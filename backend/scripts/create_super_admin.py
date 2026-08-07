"""
Create the first super-admin user for the platform.

Usage:
    python -m scripts.create_super_admin \
        --email admin@example.com \
        --full-name "Site Admin" \
        --password 'ChangeMe123!'

If --password is omitted, one is generated and printed.
"""
from __future__ import annotations

import argparse
import asyncio
import secrets
import string

from sqlalchemy import select

from app.core.security import hash_password
from app.infrastructure.db.models import User, UserRole
from app.infrastructure.db.session import SessionLocal, engine


def _gen_password(length: int = 14) -> str:
    alpha = "".join(c for c in string.ascii_letters if c not in "IlO")
    digits = "".join(c for c in string.digits if c not in "01")
    return "".join(secrets.choice(alpha + digits) for _ in range(length))


async def main(email: str, full_name: str, password: str | None) -> None:
    async with SessionLocal() as s:
        existing = (await s.execute(select(User).where(User.email == email))).scalar_one_or_none()
        if existing:
            print(f"! User {email} already exists (role={existing.role.value}); nothing to do.")
            return

        pw = password or _gen_password()
        user = User(
            email=email,
            full_name=full_name,
            password_hash=hash_password(pw),
            role=UserRole.super_admin,
            school_id=None,
            is_active=True,
        )
        s.add(user)
        await s.commit()
        print("✓ Super-admin created")
        print(f"  email:    {email}")
        print(f"  password: {pw}")
        print("  (log in to the dashboard with these credentials — change the password afterward)")
    await engine.dispose()


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--email", required=True)
    p.add_argument("--full-name", required=True)
    p.add_argument("--password", default=None, help="omit to auto-generate")
    args = p.parse_args()
    asyncio.run(main(args.email, args.full_name, args.password))
