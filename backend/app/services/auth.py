from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import Unauthorized
from app.core.security import (
    create_access_token,
    hash_refresh,
    new_refresh_token,
    verify_password,
)
from app.domain.schemas import LoginRequest, TokenPair
from app.infrastructure.db.models import RefreshToken, School, User, UserRole


class AuthService:
    def __init__(self, session: AsyncSession):
        self.s = session

    async def authenticate(self, req: LoginRequest, ip: str | None, ua: str | None) -> tuple[User, TokenPair]:
        user = await self._find_user(req)
        if user is None or not user.is_active or user.deleted_at is not None:
            raise Unauthorized("invalid credentials")
        if not verify_password(req.password, user.password_hash):
            user.failed_login_attempts += 1
            await self.s.commit()
            raise Unauthorized("invalid credentials")
        user.failed_login_attempts = 0
        user.last_login_at = datetime.now(tz=timezone.utc)

        pair = await self._issue_tokens(user, req.device_id, ip, ua)
        await self.s.commit()
        return user, pair

    async def refresh(self, raw_token: str, device_id: str | None, ip: str | None, ua: str | None) -> TokenPair:
        hashed = hash_refresh(raw_token)
        stmt = select(RefreshToken).where(RefreshToken.token_hash == hashed)
        rt = (await self.s.execute(stmt)).scalar_one_or_none()
        if rt is None or rt.revoked_at is not None or rt.expires_at <= datetime.now(tz=timezone.utc):
            raise Unauthorized("invalid refresh token")
        rt.revoked_at = datetime.now(tz=timezone.utc)

        user = await self.s.get(User, rt.user_id)
        if user is None or not user.is_active:
            raise Unauthorized("user inactive")
        pair = await self._issue_tokens(user, device_id, ip, ua)
        await self.s.commit()
        return pair

    async def logout(self, raw_token: str) -> None:
        stmt = select(RefreshToken).where(RefreshToken.token_hash == hash_refresh(raw_token))
        rt = (await self.s.execute(stmt)).scalar_one_or_none()
        if rt is not None and rt.revoked_at is None:
            rt.revoked_at = datetime.now(tz=timezone.utc)
            await self.s.commit()

    async def _find_user(self, req: LoginRequest) -> User | None:
        if req.email:
            return (await self.s.execute(select(User).where(User.email == req.email))).scalar_one_or_none()
        if req.phone:
            candidates = _phone_candidates(req.phone)
            for candidate in candidates:
                found = (
                    await self.s.execute(select(User).where(User.phone == candidate))
                ).scalar_one_or_none()
                if found is not None:
                    return found
            return None
        if req.username and req.school_code:
            school = (
                await self.s.execute(select(School).where(School.code == req.school_code))
            ).scalar_one_or_none()
            if school is None:
                return None
            return (
                await self.s.execute(
                    select(User).where(User.username == req.username, User.school_id == school.id)
                )
            ).scalar_one_or_none()
        return None

    async def _issue_tokens(
        self, user: User, device_id: str | None, ip: str | None, ua: str | None
    ) -> TokenPair:
        access = create_access_token(
            subject=str(user.id),
            claims={
                "role": user.role.value,
                "sid": str(user.school_id) if user.school_id else None,
                "tv": user.token_version,
            },
        )
        raw, hashed = new_refresh_token()
        rt = RefreshToken(
            user_id=user.id,
            token_hash=hashed,
            device_id=device_id,
            user_agent=ua,
            ip=ip,
            expires_at=datetime.now(tz=timezone.utc) + timedelta(seconds=settings.refresh_token_ttl_seconds),
        )
        self.s.add(rt)
        return TokenPair(
            access_token=access,
            refresh_token=raw,
            expires_in=settings.access_token_ttl_seconds,
        )


def _phone_candidates(raw: str) -> list[str]:
    """
    Produce a small set of candidate stored formats for a user-typed phone
    number, so someone who has "+919812345678" stored can still log in when
    they type "9812345678" or "919812345678" or "+91 98123 45678".
    """
    digits = re.sub(r"\D", "", raw or "")
    if not digits:
        return []
    out: list[str] = []
    def add(v: str) -> None:
        if v and v not in out:
            out.append(v)
    add(raw.strip())
    add("+" + digits)
    add(digits)
    if len(digits) == 10:
        add("+91" + digits)
    if digits.startswith("91") and len(digits) == 12:
        add("+" + digits)
        add(digits[2:])
    return out
