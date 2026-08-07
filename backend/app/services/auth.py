from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import Conflict, NotFound, Unauthorized, Validation
from app.core.security import (
    create_access_token,
    hash_password,
    hash_refresh,
    new_refresh_token,
    verify_password,
)
from app.domain.schemas import LoginRequest, TeacherSignupRequest, TokenPair
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

    async def signup_teacher(
        self, req: TeacherSignupRequest, ip: str | None, ua: str | None
    ) -> tuple[User, TokenPair, School]:
        if not req.email and not req.phone:
            raise Validation("either email or phone is required")

        # Case-insensitive + whitespace-tolerant. Codes are supposed to be
        # stored uppercase (SchoolCreate.pattern enforces ^[A-Z0-9-]+$), but
        # teachers type them however they want on the sign-up screen — and
        # even a single trailing space would have blown the exact-match up.
        code = req.school_code.strip().upper()
        school = (
            await self.s.execute(
                select(School).where(func.upper(School.code) == code)
            )
        ).scalar_one_or_none()
        if school is None or school.deleted_at is not None or not school.is_active:
            raise NotFound("school code not recognised")

        phone = _normalize_phone(req.phone) if req.phone else None
        if req.phone and phone is None:
            raise Validation("phone number is not valid")

        # Uniqueness across all users, not just this school, so a phone/email
        # can never be reused to hijack an admin identifier.
        if req.email:
            exists = (
                await self.s.execute(select(User).where(User.email == req.email))
            ).scalar_one_or_none()
            if exists:
                raise Conflict("email already registered")
        if phone:
            exists = (
                await self.s.execute(select(User).where(User.phone == phone))
            ).scalar_one_or_none()
            if exists:
                raise Conflict("phone already registered")

        username = await self._suggest_username(req.full_name)
        # Email is required by the model — synthesise a placeholder if the
        # teacher signed up with just phone.
        email = req.email or f"{username}@teachers.{school.code.lower()}.local"

        user = User(
            email=email,
            username=username,
            password_hash=hash_password(req.password),
            full_name=req.full_name.strip(),
            role=UserRole.teacher,
            school_id=school.id,
            phone=phone,
            is_active=True,
        )
        self.s.add(user)
        await self.s.flush()

        pair = await self._issue_tokens(user, req.device_id, ip, ua)
        await self.s.commit()
        return user, pair, school

    async def _suggest_username(self, full_name: str) -> str:
        import re as _re
        base = _re.sub(r"[^a-zA-Z0-9]+", ".", full_name.strip().lower()).strip(".")
        base = base[:40] or "teacher"
        for suffix in ("", *[str(n) for n in range(1, 1000)]):
            candidate = f"{base}{suffix}"
            clash = (
                await self.s.execute(select(User).where(User.username == candidate))
            ).scalar_one_or_none()
            if clash is None:
                return candidate
        return f"{base}.{_re.sub(r'.', '', '').zfill(0)}"  # unreachable

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
            code = req.school_code.strip().upper()
            school = (
                await self.s.execute(
                    select(School).where(func.upper(School.code) == code)
                )
            ).scalar_one_or_none()
            if school is None:
                return None

            identifier = req.username.strip()

            # 1. Exact username match within the school
            found = (
                await self.s.execute(
                    select(User).where(User.username == identifier, User.school_id == school.id)
                )
            ).scalar_one_or_none()
            if found is not None:
                return found

            # 2. Email match within the school (case-insensitive via CITEXT)
            if "@" in identifier:
                found = (
                    await self.s.execute(
                        select(User).where(User.email == identifier, User.school_id == school.id)
                    )
                ).scalar_one_or_none()
                if found is not None:
                    return found

            # 3. Phone match within the school, trying common candidate formats
            for candidate in _phone_candidates(identifier):
                found = (
                    await self.s.execute(
                        select(User).where(User.phone == candidate, User.school_id == school.id)
                    )
                ).scalar_one_or_none()
                if found is not None:
                    return found

            return None
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


def _normalize_phone(raw: str | None, default_region: str = "IN") -> str | None:
    """Same normalization AdminService / TeacherService use — E.164 with an
    Indian default region so 10-digit inputs still parse."""
    if not raw:
        return None
    try:
        import phonenumbers
        parsed = phonenumbers.parse(raw, default_region)
        if not phonenumbers.is_valid_number(parsed):
            return None
        return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)
    except Exception:
        return None


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
