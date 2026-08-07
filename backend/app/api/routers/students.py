from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user
from app.domain.schemas import Page, StudentCreate, StudentOut, StudentUpdate
from app.infrastructure.db.models import StudentStatus
from app.infrastructure.db.session import get_session
from app.services.students import StudentService

router = APIRouter(prefix="/students", tags=["students"])


@router.post("", response_model=StudentOut, status_code=201)
async def create_or_upsert(
    body: StudentCreate,
    user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    row = await StudentService(session).upsert(body, user)
    return StudentOut.model_validate(row)


@router.get("", response_model=Page)
async def list_students(
    q: str | None = None,
    school_id: UUID | None = None,
    class_id: UUID | None = None,
    section_id: UUID | None = None,
    status: StudentStatus | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await StudentService(session).list_(
        user,
        q=q,
        school_id=school_id,
        class_id=class_id,
        section_id=section_id,
        status=status,
        page=page,
        page_size=page_size,
    )


@router.get("/{student_id}", response_model=StudentOut)
async def get_student(
    student_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    row = await StudentService(session).get(student_id, user)
    return StudentOut.model_validate(row)


@router.patch("/{student_id}", response_model=StudentOut)
async def update_student(
    student_id: UUID,
    body: StudentUpdate,
    user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    row = await StudentService(session).patch(student_id, body, user)
    return StudentOut.model_validate(row)


@router.delete("/{student_id}", status_code=204)
async def delete_student(
    student_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    await StudentService(session).soft_delete(student_id, user)
    return None
