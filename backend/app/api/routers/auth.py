from uuid import UUID

from fastapi import APIRouter, Depends, Header, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user
from app.domain.schemas import (
    LoginRequest,
    LoginResponse,
    RefreshRequest,
    SchoolMini,
    TeacherSignupRequest,
    TokenPair,
    UserOut,
)
from app.infrastructure.db.models import School
from app.infrastructure.db.session import get_session
from app.services.auth import AuthService


async def _school_mini(session: AsyncSession, school_id: UUID | None) -> SchoolMini | None:
    """Fetch a SchoolMini by id without triggering a lazy relationship load.

    Direct attribute access on ``user.school`` after ``session.commit()``
    is what was raising MissingGreenlet: the ORM tries to lazy-load the
    relationship, which drops into the sync-connect path that's not
    wrapped in greenlet_spawn. Explicitly fetching by id keeps the whole
    call inside the async engine's greenlet context."""
    if school_id is None:
        return None
    row = await session.get(School, school_id)
    if row is None:
        return None
    return SchoolMini(id=row.id, code=row.code, name=row.name)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
async def login(
    req: LoginRequest,
    request: Request,
    user_agent: str | None = Header(default=None),
    session: AsyncSession = Depends(get_session),
):
    ip = request.client.host if request.client else None
    user, pair = await AuthService(session).authenticate(req, ip, user_agent)
    school = await _school_mini(session, user.school_id)
    return LoginResponse(
        **pair.model_dump(),
        user=UserOut(
            id=user.id,
            full_name=user.full_name,
            email=user.email,
            role=user.role,
            school=school,
        ),
    )


@router.post("/signup/teacher", response_model=LoginResponse, status_code=201)
async def signup_teacher(
    req: TeacherSignupRequest,
    request: Request,
    user_agent: str | None = Header(default=None),
    session: AsyncSession = Depends(get_session),
):
    ip = request.client.host if request.client else None
    user, pair, school = await AuthService(session).signup_teacher(req, ip, user_agent)
    school_out = (
        SchoolMini(id=school.id, code=school.code, name=school.name)
        if school is not None else None
    )
    return LoginResponse(
        **pair.model_dump(),
        user=UserOut(
            id=user.id,
            full_name=user.full_name,
            email=user.email,
            role=user.role,
            school=school_out,
        ),
    )


@router.post("/refresh", response_model=TokenPair)
async def refresh(
    req: RefreshRequest,
    request: Request,
    user_agent: str | None = Header(default=None),
    session: AsyncSession = Depends(get_session),
):
    ip = request.client.host if request.client else None
    return await AuthService(session).refresh(req.refresh_token, req.device_id, ip, user_agent)


@router.post("/logout", status_code=204)
async def logout(req: RefreshRequest, session: AsyncSession = Depends(get_session)):
    await AuthService(session).logout(req.refresh_token)
    return None


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUser = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    # deps already loads user; fetch school for response
    from app.infrastructure.db.models import User
    row = await session.get(User, user.id)
    school = await _school_mini(session, row.school_id)
    return UserOut(
        id=row.id, full_name=row.full_name, email=row.email, role=row.role, school=school
    )
