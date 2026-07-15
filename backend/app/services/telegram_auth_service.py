"""Telegram authentication service (bot challenge/webhook + link)."""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import re
import secrets
import time
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
import httpx
import structlog

_log = structlog.get_logger(__name__)

from app.core.config import settings
from app.core.constants import SSO_BYPASS_HASH
from app.models.auth_challenge import AuthLoginChallenge
from app.models.user import User
from app.repositories.challenge_repository import ChallengeRepository
from app.repositories.signature_repository import SignatureRepository
from app.repositories.system_setting_repository import SystemSettingRepository
from app.repositories.user_repository import UserRepository
from app.services.auth_token import create_access_token

# getUpdates offset + one-shot deleteWebhook for local polling mode
_telegram_updates_offset: int | None = None
_telegram_webhook_cleared_for_polling: bool = False

_START_PAYLOAD_RE = re.compile(r"^/start(?:@\w+)?(?:\s+(.+))?$", re.IGNORECASE)


class TelegramAuthService:
    _polling_lock: tuple[asyncio.AbstractEventLoop, asyncio.Lock] | None = None

    def __init__(self, db: AsyncSession):
        self.db = db
        self.users = UserRepository()
        self.challenges = ChallengeRepository()
        self.signatures = SignatureRepository()
        self.settings = SystemSettingRepository()

    # ─── config guards ────────────────────────────────────────────────────

    def _require_bot_configured(self) -> str:
        bot_username = (settings.TELEGRAM_BOT_USERNAME or "").strip().lstrip("@")
        if not bot_username:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="telegram_not_configured",
            )
        return bot_username

    @staticmethod
    def is_bot_login_enabled() -> bool:
        """Real bot QR needs TELEGRAM_BOT_USERNAME set."""
        bot_username = (settings.TELEGRAM_BOT_USERNAME or "").strip().lstrip("@")
        return bool(bot_username)

    async def is_updates_polling_enabled(self) -> bool:
        """Pull real Telegram /start via getUpdates (dev-friendly, no public webhook)."""
        token = await self._get_bot_token()
        if not token:
            return False
        return bool(getattr(settings, "TELEGRAM_UPDATES_POLLING", False))

    def _public_api_base(self) -> str:
        """Base URL for QR deep links (browser on host machine must open this)."""
        base = (settings.APP_PUBLIC_URL or "http://localhost:8000").rstrip("/")
        # APP_PUBLIC_URL often points at docker-internal hostnames — unusable in browser QR.
        if any(
            marker in base
            for marker in (
                "host.docker.internal",
                "://backend",
                "://hrms-backend",
                "://api:",
            )
        ):
            return "http://localhost:8000"
        return base

    async def _get_bot_token(self) -> str:
        """Бот-токен: сначала system_settings.telegram.bot_token, иначе env TELEGRAM_BOT_TOKEN."""
        db_value = await self.settings.get_value(self.db, "telegram.bot_token")
        if db_value is not None and db_value.strip():
            return db_value.strip()
        return (settings.TELEGRAM_BOT_TOKEN or "").strip()

    async def _require_bot_token(self) -> str:
        token = await self._get_bot_token()
        if not token:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="telegram_not_configured",
            )
        return token

    async def validate_bot_token(self) -> bool:
        """Quick Bot API /getMe check to confirm the configured token is alive.

        Used as a pre-flight guard before issuing a real bot challenge, so a
        bad token (revoked, typo, not yet applied via @BotFather) surfaces as
        a clear error before the user sees a dead QR. Returns True on 2xx
        with ok=true, False on any failure (network, 4xx, 5xx, bad JSON).
        """
        token = await self._get_bot_token()
        if not token:
            return False
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"https://api.telegram.org/bot{token}/getMe")
        except Exception as exc:
            _log.warning("telegram_validate_token_network_error", error=str(exc))
            return False
        if resp.status_code != 200:
            return False
        try:
            return bool(resp.json().get("ok"))
        except ValueError:
            return False

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

    # ─── Login Widget (HMAC) ──────────────────────────────────────────────

    async def verify_widget_payload(self, data: dict[str, Any]) -> dict[str, Any]:
        """
        Verify Telegram Login Widget data-check-string + HMAC-SHA256(bot_token).

        See https://core.telegram.org/widgets/login#checking-authorization
        """
        bot_token = await self._require_bot_token()
        check_hash = data.get("hash")
        if not check_hash or not isinstance(check_hash, str):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="telegram_invalid_token",
            )

        signature_hash = hashlib.sha256(data["hash"].encode()).hexdigest()
        if await self.signatures.is_used(self.db, signature_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="telegram_signature_already_used",
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

        await self.signatures.mark_used(self.db, signature_hash)
        await self.signatures.cleanup_expired(self.db, max_age)

        return {
            "telegram_id": telegram_id,
            "full_name": full_name,
            "preferred_username": preferred,
        }

    async def login_with_widget(self, data: dict[str, Any]) -> dict:
        """Verify Login Widget HMAC → resolve/provision → LoginResponse dict."""
        identity = await self.verify_widget_payload(data)
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
            updated = False
            if preferred_username and user.telegram_username != preferred_username:
                user.telegram_username = preferred_username
                updated = True
            if phone and not user.phone:
                user.phone = phone
                updated = True
            if updated:
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
            telegram_username=preferred_username,
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
        Deep link: https://t.me/<bot>?start=<token>
        """
        bot_username = (settings.TELEGRAM_BOT_USERNAME or "").strip().lstrip("@")
        if not bot_username:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="telegram_not_configured",
            )
        if purpose not in ("login", "link", "invite"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="invalid_purpose",
            )
        if purpose in ("link", "invite") and user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Missing authentication token",
            )

        # Pre-flight: a working token is required before we hand the user a QR.
        # Fail fast with a specific detail so the UI can show "check settings"
        # before the user ever sees a dead QR.
        if not await self.validate_bot_token():
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="telegram_bot_token_invalid",
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
            # Local dev: pull real Telegram updates (user pressed Start in TG app).
            if await self.is_updates_polling_enabled():
                await self.drain_bot_updates()
                await self.db.refresh(challenge)
                if challenge.status == "confirmed":
                    # Fall through to confirmed handling below.
                    pass
                elif challenge.status == "expired":
                    raise HTTPException(
                        status_code=status.HTTP_410_GONE,
                        detail="challenge_expired",
                    )
                else:
                    return self._status_body("pending")
            else:
                return self._status_body("pending")

        # Re-check after optional drain (status may have become confirmed).
        if challenge.status == "pending":
            return self._status_body("pending")

        if challenge.status == "consumed":
            return self._status_body("consumed")

        if challenge.status == "confirmed":
            # Link challenges are consumed by POST /link, not poll.
            if challenge.purpose == "link":
                return self._status_body("confirmed")

            if challenge.purpose == "invite":
                if challenge.user_id is None:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="invalid_challenge_no_user",
                    )
                user = await self.users.get_by_id(self.db, challenge.user_id)
                if user is None:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="user_not_found",
                    )
                if challenge.telegram_id is None:
                    return self._status_body("confirmed")

                telegram_id = int(challenge.telegram_id)
                existing = await self.users.get_by_telegram_id(self.db, telegram_id)
                if existing is not None and existing.id != user.id:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="telegram_id_already_linked",
                    )

                user.telegram_id = telegram_id
                if getattr(challenge, "telegram_username", None):
                    user.telegram_username = challenge.telegram_username
                user.invite_code = None
                self.db.add(user)

                claimed = await self.challenges.try_consume_confirmed(self.db, cid)
                if claimed is None:
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
                    "require_password_setup": True,
                }

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

    # ─── webhook + getUpdates (real Telegram) ─────────────────────────────

    async def _send_bot_message(
        self,
        chat_id: int,
        text: str,
        *,
        reply_markup: dict[str, Any] | None = None,
    ) -> bool:
        """
        Best-effort sendMessage via Telegram Bot API.
        Never raises to the caller; login must still succeed if bot is down.
        Returns True on 2xx.
        """
        if not getattr(settings, "TELEGRAM_BOT_REPLY_ENABLED", True):
            return False
        token = await self._get_bot_token()
        if not token:
            return False
        payload: dict[str, Any] = {
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "HTML",
            "disable_web_page_preview": True,
        }
        if reply_markup:
            payload["reply_markup"] = reply_markup
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                resp = await client.post(
                    f"https://api.telegram.org/bot{token}/sendMessage",
                    json=payload,
                )
                if resp.status_code >= 400:
                    _log.warning(
                        "telegram_send_message_failed",
                        status=resp.status_code,
                        body=resp.text[:200],
                    )
                    return False
                return True
        except Exception as exc:
            _log.warning("telegram_send_message_error", error=str(exc))
            return False

    @staticmethod
    def _app_open_url() -> str:
        return (
            getattr(settings, "TELEGRAM_PUBLIC_APP_URL", None)
            or "http://localhost:5173"
        ).rstrip("/")

    async def apply_bot_update(self, update: dict[str, Any]) -> dict:
        """
        Process one Bot API update (webhook or getUpdates).
        Confirms pending challenge on /start <token> with real telegram_id from TG.
        Sends a friendly confirmation message so the user sees the login worked.
        """
        message = update.get("message") or update.get("edited_message") or {}
        text = (message.get("text") or "").strip()
        if not text:
            return {"ok": True}

        match = _START_PAYLOAD_RE.match(text)
        if not match:
            return {"ok": True}

        start_payload = (match.group(1) or "").strip()
        chat = message.get("chat") or {}
        from_user = message.get("from") or {}
        chat_id = chat.get("id")

        # /start without payload — bot opened for the first time, no challenge.
        if not start_payload:
            if chat.get("type") == "private" and isinstance(chat_id, int):
                await self._send_bot_message(
                    chat_id,
                    "👋 Этот бот используется для входа в <b>HRMS</b>.\n\n"
                    "Откройте QR-код на странице входа в браузере и "
                    "нажмите <b>Start</b> здесь — авторизация завершится "
                    "автоматически.",
                )
            return {"ok": True}

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
            if isinstance(chat_id, int):
                await self._send_bot_message(
                    chat_id,
                    "⚠️ Этот запрос на вход истёк. Запросите новый QR-код "
                    "на странице входа.",
                )
            return {"ok": True}

        # Обновим или создадим пользователя, если разрешен JIT, сохраняя его telegram_username
        user = await self.users.get_by_telegram_id(self.db, telegram_id)
        tg_username = from_user.get("username")
        first_name = from_user.get("first_name") or ""
        last_name = from_user.get("last_name") or ""
        tg_full_name = f"{first_name} {last_name}".strip()

        if user is not None:
            updated = False
            if tg_username and user.telegram_username != tg_username:
                user.telegram_username = tg_username
                updated = True
            if tg_full_name and (not user.full_name or user.full_name.startswith("tg_")):
                user.full_name = tg_full_name
                updated = True
            if updated:
                self.db.add(user)
        elif challenge.purpose == "login" and settings.TELEGRAM_ALLOW_JIT:
            username = await self._pick_username(tg_username, telegram_id)
            role = settings.TELEGRAM_DEFAULT_ROLE or "viewer"
            await self.users.create_telegram_user(
                self.db,
                telegram_id=telegram_id,
                username=username,
                full_name=tg_full_name or username,
                role=role,
                telegram_username=tg_username,
            )

        await self.challenges.confirm(
            self.db,
            challenge,
            telegram_id=telegram_id,
            telegram_username=tg_username,
        )
        await self.db.commit()

        # Visual feedback so the user knows the login was confirmed.
        # Telegram only accepts https:// URLs in inline keyboard buttons,
        # so the button is added only when the public app URL is HTTPS.
        if isinstance(chat_id, int):
            app_url = self._app_open_url()
            reply_markup: dict[str, Any] | None = None
            if app_url.startswith("https://"):
                reply_markup = {
                    "inline_keyboard": [
                        [{"text": "🌐 Открыть HRMS", "url": app_url}]
                    ]
                }
            await self._send_bot_message(
                chat_id,
                "✅ <b>Вход в HRMS подтверждён</b>\n\n"
                "Вернитесь в браузер — авторизация завершится автоматически.",
                reply_markup=reply_markup,
            )
        return {"ok": True}

    async def handle_webhook(
        self,
        update: dict[str, Any],
        *,
        secret_header: str | None,
    ) -> dict:
        """
        Process Telegram Bot update via webhook.
        Secret header must match TELEGRAM_WEBHOOK_SECRET (503 if empty).
        """
        expected = self._require_webhook_secret()
        provided = (secret_header or "").strip()
        provided_digest = hashlib.sha256(provided.encode("utf-8")).digest()
        expected_digest = hashlib.sha256(expected.encode("utf-8")).digest()
        if not hmac.compare_digest(provided_digest, expected_digest):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="telegram_invalid_token",
            )
        return await self.apply_bot_update(update)

    async def ensure_polling_mode(self) -> None:
        """deleteWebhook so getUpdates works (once per process)."""
        global _telegram_webhook_cleared_for_polling
        if _telegram_webhook_cleared_for_polling:
            return
        token = await self._get_bot_token()
        if not token:
            return
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                await client.post(
                    f"https://api.telegram.org/bot{token}/deleteWebhook",
                    json={"drop_pending_updates": False},
                )
        except Exception:
            # Best-effort; getUpdates may still work if no webhook set.
            pass
        _telegram_webhook_cleared_for_polling = True

    async def drain_bot_updates(self) -> int:
        """
        Pull getUpdates and apply /start confirms (real Telegram identity).
        Used when TELEGRAM_UPDATES_POLLING=true — no public HTTPS tunnel needed.
        """
        global _telegram_updates_offset
        if not await self.is_updates_polling_enabled():
            return 0

        loop = asyncio.get_running_loop()
        if (
            TelegramAuthService._polling_lock is None
            or TelegramAuthService._polling_lock[0] is not loop
        ):
            TelegramAuthService._polling_lock = (loop, asyncio.Lock())

        lock = TelegramAuthService._polling_lock[1]
        was_locked = lock.locked()
        async with lock:
            if was_locked:
                return 0

            await self.ensure_polling_mode()
            token = await self._get_bot_token()
            params: dict[str, Any] = {"timeout": 0, "limit": 50}
            if _telegram_updates_offset is not None:
                params["offset"] = _telegram_updates_offset

            try:
                async with httpx.AsyncClient(timeout=15.0) as client:
                    resp = await client.get(
                        f"https://api.telegram.org/bot{token}/getUpdates",
                        params=params,
                    )
                    resp.raise_for_status()
                    payload = resp.json()
            except Exception:
                return 0

            if not payload.get("ok"):
                return 0

            updates = payload.get("result") or []
            applied = 0
            for update in updates:
                uid = update.get("update_id")
                if isinstance(uid, int):
                    _telegram_updates_offset = uid + 1
                await self.apply_bot_update(update)
                applied += 1
            return applied

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
        telegram_username: str | None = None
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
            telegram_username = challenge.telegram_username
            await self.challenges.consume(self.db, challenge)

        elif id_token:
            # OIDC Login Widget path not implemented (T1: no dead AttributeError).
            raise HTTPException(
                status_code=status.HTTP_501_NOT_IMPLEMENTED,
                detail="oidc_link_not_implemented",
            )
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

        await self.users.link_telegram(self.db, user, telegram_id, telegram_username=telegram_username, phone=phone)
        await self.db.commit()
        await self.db.refresh(user)
        return {"telegram_id": user.telegram_id, "linked": True}

    async def unlink_current_user(self, user: User) -> dict:
        # Block unlink when Telegram is the only usable auth factor.
        if not self._has_usable_password(user):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="cannot_unlink_last_auth_factor",
            )
        await self.users.unlink_telegram(self.db, user)
        await self.db.commit()
        return {"telegram_id": None, "linked": False}

    @staticmethod
    def _has_usable_password(user: User) -> bool:
        pw = (user.password_hash or "").strip()
        return bool(pw) and pw != SSO_BYPASS_HASH

    async def get_user_by_username(self, username: str) -> User | None:
        return await self.users.get_by_username(self.db, username)

    async def get_user_by_invite_code(self, invite_code: str) -> User | None:
        return await self.users.get_by_invite_code(self.db, invite_code)
