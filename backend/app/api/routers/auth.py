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
from app.infrastructure.db.session import get_session
from app.services.auth import AuthService

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
    school = SchoolMini(id=user.school.id, code=user.school.code, name=user.school.name) if user.school else None
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
    user, pair = await AuthService(session).signup_teacher(req, ip, user_agent)
    # Refresh to pull the school relation.
    from app.infrastructure.db.models import User
    row = await session.get(User, user.id)
    school = SchoolMini(id=row.school.id, code=row.school.code, name=row.school.name) if row.school else None
    return LoginResponse(
        **pair.model_dump(),
        user=UserOut(
            id=row.id, full_name=row.full_name, email=row.email, role=row.role, school=school,
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
    school = SchoolMini(id=row.school.id, code=row.school.code, name=row.school.name) if row.school else None
    return UserOut(
        id=row.id, full_name=row.full_name, email=row.email, role=row.role, school=school
    )
