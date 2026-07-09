"""Telegram authentication service (OIDC + widget + bot challenge/webhook + link)."""

from __future__ import annotations

import hashlib
import hmac
import re
import secrets
import time
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

import httpx
from fastapi import HTTPException, status
from jose import JWTError, jwt
from jose.exceptions import ExpiredSignatureError, JWTClaimsError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.auth_challenge import AuthLoginChallenge
from app.models.user import User
from app.repositories.challenge_repository import ChallengeRepository
from app.repositories.user_repository import UserRepository
from app.services.auth_token import create_access_token

TELEGRAM_OIDC_ISSUER = "https://oauth.telegram.org"
TELEGRAM_JWKS_URL = "https://oauth.telegram.org/.well-known/jwks.json"
TELEGRAM_AUTHORIZE_URL = "https://oauth.telegram.org/auth"
TELEGRAM_OIDC_ALGORITHMS = ["RS256", "ES256", "ES256K", "EdDSA"]

# Module-level JWKS cache: (fetched_at_unix, jwks_dict)
_jwks_cache: tuple[float, dict[str, Any]] | None = None
_JWKS_TTL_SECONDS = 3600

_START_PAYLOAD_RE = re.compile(r"^/start(?:@\w+)?(?:\s+(.+))?$", re.IGNORECASE)


class TelegramAuthService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.users = UserRepository()
        self.challenges = ChallengeRepository()

    # ─── config guards ────────────────────────────────────────────────────

    def _require_oidc_configured(self) -> str:
        client_id = (settings.TELEGRAM_OIDC_CLIENT_ID or "").strip()
        if not client_id:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="telegram_not_configured",
            )
        return client_id

    def _require_bot_configured(self) -> str:
        bot_username = (settings.TELEGRAM_BOT_USERNAME or "").strip().lstrip("@")
        if not bot_username:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="telegram_not_configured",
            )
        return bot_username

    def _require_bot_token(self) -> str:
        token = (settings.TELEGRAM_BOT_TOKEN or "").strip()
        if not token:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="telegram_not_configured",
            )
        return token

    def _require_webhook_secret(self) -> str:
        secret = (settings.TELEGRAM_WEBHOOK_SECRET or "").strip()
        if not secret:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="telegram_not_configured",
            )
        return secret

    # ─── poll secret helpers ──────────────────────────────────────────────

    @staticmethod
    def hash_poll_secret(poll_secret: str) -> str:
        return hashlib.sha256(poll_secret.encode("utf-8")).hexdigest()

    @staticmethod
    def verify_poll_secret(provided: str | None, stored_hash: str | None) -> bool:
        if not provided or not stored_hash:
            return False
        expected = hashlib.sha256(provided.encode("utf-8")).hexdigest()
        return hmac.compare_digest(expected, stored_hash)

    # ─── OIDC ─────────────────────────────────────────────────────────────

    async def _fetch_jwks(self) -> dict[str, Any]:
        """Fetch Telegram JWKS with simple module-level TTL cache (~1h)."""
        global _jwks_cache
        now = time.time()
        if _jwks_cache is not None:
            fetched_at, cached = _jwks_cache
            if now - fetched_at < _JWKS_TTL_SECONDS:
                return cached

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(TELEGRAM_JWKS_URL)
                resp.raise_for_status()
                jwks = resp.json()
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="telegram_invalid_token",
            ) from exc

        if not isinstance(jwks, dict) or "keys" not in jwks:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="telegram_invalid_token",
            )

        _jwks_cache = (now, jwks)
        return jwks

    async def verify_oidc_id_token(self, id_token: str, nonce: str) -> dict[str, Any]:
        """
        Verify Telegram OIDC id_token via JWKS.

        Checks: signature, iss, aud, exp, nonce match.
        Returns decoded claims dict.
        """
        client_id = self._require_oidc_configured()
        jwks = await self._fetch_jwks()

        try:
            claims = jwt.decode(
                id_token,
                jwks,
                algorithms=TELEGRAM_OIDC_ALGORITHMS,
                audience=client_id,
                issuer=TELEGRAM_OIDC_ISSUER,
                options={
                    "verify_aud": True,
                    "verify_iss": True,
                    "verify_exp": True,
                    "require_exp": True,
                },
            )
        except ExpiredSignatureError as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="telegram_expired",
            ) from exc
        except JWTClaimsError as exc:
            message = str(exc).lower()
            if "expir" in message:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="telegram_expired",
                ) from exc
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="telegram_invalid_token",
            ) from exc
        except JWTError as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="telegram_invalid_token",
            ) from exc

        token_nonce = claims.get("nonce")
        if token_nonce is None or str(token_nonce) != str(nonce):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="telegram_nonce_mismatch",
            )

        return claims

    @staticmethod
    def _extract_identity(claims: dict[str, Any]) -> tuple[int, str, str | None, str | None]:
        """Return (telegram_id, full_name, preferred_username, phone)."""
        raw_id = claims.get("id", claims.get("sub"))
        if raw_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="telegram_invalid_token",
            )
        try:
            telegram_id = int(raw_id)
        except (TypeError, ValueError) as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="telegram_invalid_token",
            ) from exc

        full_name = claims.get("name")
        if not full_name:
            parts = [
                p
                for p in (claims.get("first_name"), claims.get("last_name"))
                if p
            ]
            full_name = " ".join(parts) if parts else f"tg_{telegram_id}"

        preferred = claims.get("preferred_username") or claims.get("username")
        if preferred is not None:
            preferred = str(preferred).strip() or None

        phone = claims.get("phone_number")
        if phone is not None:
            phone = str(phone).strip() or None

        return telegram_id, str(full_name), preferred, phone

    async def login_with_oidc(self, id_token: str, nonce: str) -> dict:
        """Verify id_token → resolve/provision user → LoginResponse-compatible dict."""
        claims = await self.verify_oidc_id_token(id_token, nonce)
        telegram_id, full_name, preferred_username, phone = self._extract_identity(claims)
        user = await self.resolve_or_provision_user(
            telegram_id=telegram_id,
            full_name=full_name,
            preferred_username=preferred_username,
            phone=phone,
        )
        return self.issue_login_response(user)

    # ─── Login Widget (HMAC) ──────────────────────────────────────────────

    def verify_widget_payload(self, data: dict[str, Any]) -> dict[str, Any]:
        """
        Verify Telegram Login Widget data-check-string + HMAC-SHA256(bot_token).

        See https://core.telegram.org/widgets/login#checking-authorization
        """
        bot_token = self._require_bot_token()
        check_hash = data.get("hash")
        if not check_hash or not isinstance(check_hash, str):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="telegram_invalid_token",
            )

        auth_date_raw = data.get("auth_date")
        try:
            auth_date = int(auth_date_raw)
        except (TypeError, ValueError) as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="telegram_invalid_token",
            ) from exc

        max_age = int(settings.TELEGRAM_AUTH_DATE_MAX_AGE_SECONDS or 86400)
        now = int(time.time())
        if auth_date > now + 60 or now - auth_date > max_age:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="telegram_expired",
            )

        # Build data-check-string from all fields except hash (sorted by key).
        pairs: list[str] = []
        for key in sorted(data.keys()):
            if key == "hash":
                continue
            value = data[key]
            if value is None:
                continue
            pairs.append(f"{key}={value}")
        data_check_string = "\n".join(pairs)

        secret_key = hashlib.sha256(bot_token.encode("utf-8")).digest()
        calculated = hmac.new(
            secret_key,
            data_check_string.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(calculated, check_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="telegram_invalid_token",
            )

        raw_id = data.get("id")
        try:
            telegram_id = int(raw_id)
        except (TypeError, ValueError) as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="telegram_invalid_token",
            ) from exc

        first = str(data.get("first_name") or "").strip()
        last = str(data.get("last_name") or "").strip()
        full_name = " ".join(p for p in (first, last) if p) or f"tg_{telegram_id}"
        preferred = data.get("username")
        if preferred is not None:
            preferred = str(preferred).strip() or None

        return {
            "telegram_id": telegram_id,
            "full_name": full_name,
            "preferred_username": preferred,
        }

    async def login_with_widget(self, data: dict[str, Any]) -> dict:
        """Verify Login Widget HMAC → resolve/provision → LoginResponse dict."""
        identity = self.verify_widget_payload(data)
        user = await self.resolve_or_provision_user(
            telegram_id=identity["telegram_id"],
            full_name=identity["full_name"],
            preferred_username=identity["preferred_username"],
            phone=None,
        )
        return self.issue_login_response(user)

    # ─── identity resolve ─────────────────────────────────────────────────

    async def resolve_or_provision_user(
        self,
        *,
        telegram_id: int,
        full_name: str,
        preferred_username: str | None,
        phone: str | None,
    ) -> User:
        """
        1. get_by_telegram_id
        2. if none and TELEGRAM_ALLOW_JIT: create username=preferred if free else tg_<id>
        3. else raise HTTPException 403 detail=telegram_not_allowed

        Phone is never used for silent auto-link (M2). It may only update when
        the user is already matched by telegram_id.
        """
        user = await self.users.get_by_telegram_id(self.db, telegram_id)
        if user is not None:
            if phone and not user.phone:
                user.phone = phone
                self.db.add(user)
                await self.db.flush()
                await self.db.refresh(user)
            return user

        # No auto-link by phone — prevents silent account takeover (M2).
        if not settings.TELEGRAM_ALLOW_JIT:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="telegram_not_allowed",
            )

        username = await self._pick_username(preferred_username, telegram_id)
        role = settings.TELEGRAM_DEFAULT_ROLE or "viewer"
        return await self.users.create_telegram_user(
            self.db,
            telegram_id=telegram_id,
            username=username,
            full_name=full_name or username,
            role=role,
            phone=phone,
        )

    async def _pick_username(
        self, preferred_username: str | None, telegram_id: int
    ) -> str:
        if preferred_username:
            candidate = preferred_username.strip()[:100]
            if candidate:
                existing = await self.users.get_by_username(self.db, candidate)
                if existing is None:
                    return candidate
        return f"tg_{telegram_id}"

    def issue_login_response(self, user: User) -> dict:
        """create_access_token + LoginResponse-compatible dict."""
        full_name = user.full_name or user.username
        token = create_access_token(
            username=user.username,
            role=user.role,
            full_name=full_name,
        )
        return {
            "access_token": token,
            "token_type": "bearer",
            "username": user.username,
            "role": user.role,
            "full_name": full_name,
        }

    # ─── bot challenge ────────────────────────────────────────────────────

    @staticmethod
    def _generate_challenge_token() -> str:
        # secrets.token_urlsafe → A-Za-z0-9_-; keep ≤64 chars
        return secrets.token_urlsafe(32)[:64]

    @staticmethod
    def _generate_poll_secret() -> str:
        return secrets.token_urlsafe(32)

    def _is_expired(self, challenge: AuthLoginChallenge) -> bool:
        expires_at = challenge.expires_at
        if expires_at is None:
            return True
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        return datetime.now(timezone.utc) >= expires_at

    async def create_bot_challenge(
        self,
        *,
        purpose: str = "login",
        user_id: int | None = None,
    ) -> dict:
        """Create one-time deep-link challenge. purpose=link requires user_id.

        Returns poll_secret only here (never in deep_link / webhook).
        """
        bot_username = self._require_bot_configured()
        if purpose not in ("login", "link"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="invalid_purpose",
            )
        if purpose == "link" and user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Missing authentication token",
            )

        ttl = int(settings.TELEGRAM_BOT_CHALLENGE_TTL_SECONDS or 300)
        token = self._generate_challenge_token()
        poll_secret = self._generate_poll_secret()
        poll_secret_hash = self.hash_poll_secret(poll_secret)
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=ttl)
        challenge = await self.challenges.create(
            self.db,
            token=token,
            purpose=purpose,
            expires_at=expires_at,
            user_id=user_id,
            poll_secret_hash=poll_secret_hash,
        )
        await self.db.commit()

        challenge_id = str(challenge.id)
        deep_link = f"https://t.me/{bot_username}?start={token}"
        poll_url = f"/api/auth/telegram/bot/challenge/{challenge_id}"
        return {
            "challenge_id": challenge_id,
            "poll_secret": poll_secret,
            "deep_link": deep_link,
            "expires_in": ttl,
            "poll_url": poll_url,
        }

    async def poll_bot_challenge(
        self,
        challenge_id: UUID | str,
        *,
        poll_secret: str | None = None,
    ) -> dict:
        """
        Poll challenge status (requires poll_secret from create response).
        - pending → no token
        - confirmed (login) → atomic consume + issue JWT once
        - confirmed (link) → no JWT (link via POST /link)
        - consumed → no token
        - expired → 410
        - missing/wrong secret → 401
        """
        try:
            cid = challenge_id if isinstance(challenge_id, UUID) else UUID(str(challenge_id))
        except (TypeError, ValueError) as exc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="challenge_not_found",
            ) from exc

        # First load without lock for secret check / status (cheap 401/404).
        challenge = await self.challenges.get_by_id(self.db, cid)
        if challenge is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="challenge_not_found",
            )

        if not self.verify_poll_secret(poll_secret, challenge.poll_secret_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="telegram_invalid_poll_secret",
            )

        if challenge.status == "expired" or (
            challenge.status == "pending" and self._is_expired(challenge)
        ):
            if challenge.status != "expired":
                await self.challenges.mark_expired(self.db, challenge)
                await self.db.commit()
            raise HTTPException(
                status_code=status.HTTP_410_GONE,
                detail="challenge_expired",
            )

        if challenge.status == "pending":
            return self._status_body("pending")

        if challenge.status == "consumed":
            return self._status_body("consumed")

        if challenge.status == "confirmed":
            # Link challenges are consumed by POST /link, not poll.
            if challenge.purpose == "link":
                return self._status_body("confirmed")

            # Login: resolve first (403 keeps confirmed for admin pre-link retry),
            # then atomic consume so concurrent polls cannot issue two JWTs (M1).
            if challenge.telegram_id is None:
                return self._status_body("confirmed")

            try:
                user = await self.resolve_or_provision_user(
                    telegram_id=int(challenge.telegram_id),
                    full_name=f"tg_{challenge.telegram_id}",
                    preferred_username=None,
                    phone=None,
                )
            except HTTPException:
                # Keep confirmed so client can retry after admin pre-link.
                raise

            claimed = await self.challenges.try_consume_confirmed(self.db, cid)
            if claimed is None:
                # Lost race: another poll already consumed.
                return self._status_body("consumed")

            login = self.issue_login_response(user)
            await self.db.commit()
            return {
                "status": "confirmed",
                "access_token": login["access_token"],
                "token_type": login["token_type"],
                "username": login["username"],
                "role": login["role"],
                "full_name": login["full_name"],
            }

        return self._status_body(challenge.status or "pending")

    @staticmethod
    def _status_body(status_value: str) -> dict:
        return {
            "status": status_value,
            "access_token": None,
            "token_type": "bearer",
            "username": None,
            "role": None,
            "full_name": None,
        }

    # ─── webhook ──────────────────────────────────────────────────────────

    async def handle_webhook(
        self,
        update: dict[str, Any],
        *,
        secret_header: str | None,
    ) -> dict:
        """
        Process Telegram Bot update. Always returns quickly after work.
        Secret header must match TELEGRAM_WEBHOOK_SECRET (503 if empty).
        """
        expected = self._require_webhook_secret()
        provided = (secret_header or "").strip()
        # Constant-time compare; pad-safe via hashes (compare_digest needs equal length).
        provided_digest = hashlib.sha256(provided.encode("utf-8")).digest()
        expected_digest = hashlib.sha256(expected.encode("utf-8")).digest()
        if not hmac.compare_digest(provided_digest, expected_digest):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="telegram_invalid_token",
            )

        message = update.get("message") or update.get("edited_message") or {}
        text = (message.get("text") or "").strip()
        if not text:
            return {"ok": True}

        match = _START_PAYLOAD_RE.match(text)
        if not match:
            return {"ok": True}

        start_payload = (match.group(1) or "").strip()
        if not start_payload:
            return {"ok": True}

        from_user = message.get("from") or {}
        raw_tg_id = from_user.get("id")
        if raw_tg_id is None:
            return {"ok": True}
        try:
            telegram_id = int(raw_tg_id)
        except (TypeError, ValueError):
            return {"ok": True}

        challenge = await self.challenges.get_by_token(self.db, start_payload)
        if challenge is None:
            return {"ok": True}

        if challenge.status != "pending":
            return {"ok": True}

        if self._is_expired(challenge):
            await self.challenges.mark_expired(self.db, challenge)
            await self.db.commit()
            return {"ok": True}

        await self.challenges.confirm(self.db, challenge, telegram_id=telegram_id)
        await self.db.commit()
        return {"ok": True}

    # ─── link / unlink ────────────────────────────────────────────────────

    async def link_to_current_user(
        self,
        user: User,
        *,
        id_token: str | None = None,
        nonce: str | None = None,
        challenge_id: UUID | str | None = None,
    ) -> dict:
        """Attach telegram_id to Bearer user via OIDC id_token or confirmed link challenge."""
        telegram_id: int | None = None
        phone: str | None = None

        if challenge_id is not None:
            try:
                cid = (
                    challenge_id
                    if isinstance(challenge_id, UUID)
                    else UUID(str(challenge_id))
                )
            except (TypeError, ValueError) as exc:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="challenge_not_found",
                ) from exc

            challenge = await self.challenges.get_by_id(self.db, cid)
            if challenge is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="challenge_not_found",
                )
            if challenge.purpose != "link":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="invalid_purpose",
                )
            if challenge.status == "expired" or self._is_expired(challenge):
                if challenge.status != "expired":
                    await self.challenges.mark_expired(self.db, challenge)
                    await self.db.commit()
                raise HTTPException(
                    status_code=status.HTTP_410_GONE,
                    detail="challenge_expired",
                )
            if challenge.status != "confirmed" or challenge.telegram_id is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="challenge_not_confirmed",
                )
            if challenge.user_id is not None and int(challenge.user_id) != int(user.id):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="telegram_not_allowed",
                )
            telegram_id = int(challenge.telegram_id)
            await self.challenges.consume(self.db, challenge)

        elif id_token:
            if not nonce:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="nonce_required",
                )
            claims = await self.verify_oidc_id_token(id_token, nonce)
            telegram_id, _, _, phone = self._extract_identity(claims)
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="id_token_or_challenge_required",
            )

        assert telegram_id is not None

        existing = await self.users.get_by_telegram_id(self.db, telegram_id)
        if existing is not None and existing.id != user.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="telegram_already_linked",
            )

        if user.telegram_id is not None and user.telegram_id != telegram_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="telegram_already_linked",
            )

        await self.users.link_telegram(self.db, user, telegram_id, phone=phone)
        await self.db.commit()
        await self.db.refresh(user)
        return {"telegram_id": user.telegram_id, "linked": True}

    async def unlink_current_user(self, user: User) -> dict:
        await self.users.unlink_telegram(self.db, user)
        await self.db.commit()
        return {"telegram_id": None, "linked": False}

    async def get_user_by_username(self, username: str) -> User | None:
        return await self.users.get_by_username(self.db, username)
