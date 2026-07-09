"""Telegram authentication service (OIDC Phase 1).

Bot webhook / link live in Phase 2.
"""

from __future__ import annotations

import time
from typing import Any

import httpx
from fastapi import HTTPException, status
from jose import JWTError, jwt
from jose.exceptions import ExpiredSignatureError, JWTClaimsError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.user import User
from app.repositories.user_repository import UserRepository
from app.services.auth_token import create_access_token

TELEGRAM_OIDC_ISSUER = "https://oauth.telegram.org"
TELEGRAM_JWKS_URL = "https://oauth.telegram.org/.well-known/jwks.json"
TELEGRAM_AUTHORIZE_URL = "https://oauth.telegram.org/auth"
TELEGRAM_OIDC_ALGORITHMS = ["RS256", "ES256", "ES256K", "EdDSA"]

# Module-level JWKS cache: (fetched_at_unix, jwks_dict)
_jwks_cache: tuple[float, dict[str, Any]] | None = None
_JWKS_TTL_SECONDS = 3600


class TelegramAuthService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.users = UserRepository()

    def _require_oidc_configured(self) -> str:
        client_id = (settings.TELEGRAM_OIDC_CLIENT_ID or "").strip()
        if not client_id:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="telegram_not_configured",
            )
        return client_id

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
            # aud/iss mismatch etc.
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
        2. if phone: get_by_phone (optional match + set telegram_id if unlinked)
        3. if none and TELEGRAM_ALLOW_JIT: create username=preferred if free else tg_<id>
        4. else raise HTTPException 403 detail=telegram_not_allowed
        """
        user = await self.users.get_by_telegram_id(self.db, telegram_id)
        if user is not None:
            if phone and not user.phone:
                user.phone = phone
                self.db.add(user)
                await self.db.flush()
                await self.db.refresh(user)
            return user

        if phone:
            by_phone = await self.users.get_by_phone(self.db, phone)
            if by_phone is not None:
                if by_phone.telegram_id is None:
                    return await self.users.link_telegram(
                        self.db, by_phone, telegram_id, phone=phone
                    )
                if by_phone.telegram_id != telegram_id:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="telegram_already_linked",
                    )
                return by_phone

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
