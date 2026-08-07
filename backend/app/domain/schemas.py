from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.infrastructure.db.models import Gender, StudentStatus, SyncOp, SyncStatus, UserRole


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class LoginRequest(BaseModel):
    school_code: str | None = None
    username: str | None = None
    email: EmailStr | None = None
    password: str = Field(min_length=6, max_length=128)
    device_id: str | None = Field(default=None, max_length=128)


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "Bearer"
    expires_in: int


class SchoolMini(ORMModel):
    id: UUID
    code: str
    name: str


class UserOut(ORMModel):
    id: UUID
    full_name: str
    email: EmailStr
    role: UserRole
    school: SchoolMini | None = None


class LoginResponse(TokenPair):
    user: UserOut


class RefreshRequest(BaseModel):
    refresh_token: str
    device_id: str | None = None


class SchoolCreate(BaseModel):
    code: str = Field(min_length=2, max_length=16, pattern=r"^[A-Z0-9-]+$")
    name: str
    address: str | None = None
    city: str | None = None
    state: str | None = None
    pincode: str | None = None
    phone: str | None = None
    email: EmailStr | None = None
    principal_name: str | None = None


class SchoolUpdate(BaseModel):
    name: str | None = None
    address: str | None = None
    city: str | None = None
    state: str | None = None
    pincode: str | None = None
    phone: str | None = None
    email: EmailStr | None = None
    principal_name: str | None = None
    is_active: bool | None = None
    logo_url: str | None = None


class SchoolOut(ORMModel):
    id: UUID
    code: str
    name: str
    city: str | None
    state: str | None
    email: str | None
    is_active: bool
    principal_name: str | None
    logo_url: str | None
    created_at: datetime


class ClassCreate(BaseModel):
    name: str
    ordering: int = 0


class ClassOut(ORMModel):
    id: UUID
    school_id: UUID
    name: str
    ordering: int


class SectionCreate(BaseModel):
    name: str
    ordering: int = 0


class SectionOut(ORMModel):
    id: UUID
    class_id: UUID
    name: str


class TeacherCreate(BaseModel):
    school_id: UUID
    full_name: str
    email: EmailStr
    phone: str | None = None
    # Optional — when omitted the server generates and returns them once.
    username: str | None = Field(default=None, min_length=3, max_length=50, pattern=r"^[a-zA-Z0-9._-]+$")
    password: str | None = Field(default=None, min_length=8, max_length=128)


class GeneratedCredentials(BaseModel):
    username: str
    password: str


class TeacherOut(UserOut):
    is_active: bool
    last_login_at: datetime | None = None


class TeacherCreatedOut(TeacherOut):
    """Response for POST /teachers — includes the plaintext password once so
    the super admin can hand it to the teacher. Never returned again."""
    credentials: GeneratedCredentials


class PasswordResetOut(BaseModel):
    user_id: UUID
    credentials: GeneratedCredentials


class StudentBase(BaseModel):
    school_id: UUID
    class_id: UUID | None = None
    section_id: UUID | None = None
    enrollment_no: str = Field(min_length=3, max_length=30, pattern=r"^[A-Z0-9-]+$")
    roll_no: str | None = None
    name: str = Field(min_length=1, max_length=150)
    father_name: str | None = None
    mother_name: str | None = None
    dob: date | None = None
    blood_group: str | None = Field(default=None, max_length=5)
    gender: Gender | None = None
    address: str | None = None
    mobile: str | None = None
    enrolled_on: date | None = None
    status: StudentStatus = StudentStatus.draft

    @field_validator("dob")
    @classmethod
    def _dob_sane(cls, v):
        if v is None:
            return v
        if v > date.today():
            raise ValueError("dob cannot be in the future")
        if v.year < 1900:
            raise ValueError("dob too far in the past")
        return v

    @field_validator("mobile")
    @classmethod
    def _mobile_e164(cls, v):
        if v is None:
            return v
        try:
            import phonenumbers  # noqa

            parsed = phonenumbers.parse(v, None)
            if not phonenumbers.is_valid_number(parsed):
                raise ValueError("invalid mobile")
            return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)
        except Exception as e:
            raise ValueError(f"invalid mobile: {e}") from e


class StudentCreate(StudentBase):
    client_uuid: UUID


class StudentUpdate(BaseModel):
    class_id: UUID | None = None
    section_id: UUID | None = None
    roll_no: str | None = None
    name: str | None = None
    father_name: str | None = None
    mother_name: str | None = None
    dob: date | None = None
    blood_group: str | None = None
    gender: Gender | None = None
    address: str | None = None
    mobile: str | None = None
    status: StudentStatus | None = None


class StudentOut(ORMModel):
    id: UUID
    client_uuid: UUID
    school_id: UUID
    class_id: UUID | None
    section_id: UUID | None
    enrollment_no: str
    roll_no: str | None
    name: str
    father_name: str | None
    mother_name: str | None
    dob: date | None
    blood_group: str | None
    gender: Gender | None
    address: str | None
    mobile: str | None
    enrolled_on: date | None
    status: StudentStatus
    primary_photo_url: str | None = None
    created_at: datetime
    updated_at: datetime


class Page(BaseModel):
    items: list
    page: int
    page_size: int
    total: int


class PhotoUploadRequest(BaseModel):
    sha256: str = Field(min_length=64, max_length=64, pattern=r"^[0-9a-f]{64}$")
    size_bytes: int = Field(gt=0)
    content_type: str = "image/jpeg"


class PhotoUploadUrl(BaseModel):
    url: str
    storage_key: str
    expires_in: int
    required_headers: dict[str, str]


class PhotoComplete(BaseModel):
    storage_key: str
    sha256: str
    size_bytes: int
    width: int | None = None
    height: int | None = None


class PhotoOut(ORMModel):
    id: UUID
    student_id: UUID
    storage_key: str
    is_primary: bool
    size_bytes: int
    width: int | None
    height: int | None
    uploaded_at: datetime


class SyncOperationIn(BaseModel):
    op: SyncOp
    type: str
    client_uuid: UUID
    payload: dict


class SyncBatchIn(BaseModel):
    device_id: str
    operations: list[SyncOperationIn]


class SyncOperationResult(BaseModel):
    client_uuid: UUID
    status: SyncStatus
    server_id: UUID | None = None
    error: str | None = None


class SyncBatchOut(BaseModel):
    results: list[SyncOperationResult]


class IdCardGenerateRequest(BaseModel):
    student_ids: list[UUID] | None = None
    class_id: UUID | None = None
    school_id: UUID | None = None
    section_id: UUID | None = None
    template_id: UUID
    format: str = Field(default="pdf", pattern=r"^(pdf|png)$")
    layout: str = Field(default="single", pattern=r"^(single|a4-sheet)$")


class IdCardJob(BaseModel):
    job_id: str
    status: str
    download_url: str | None = None
    expires_at: datetime | None = None


class ProblemDetails(BaseModel):
    type: str = "about:blank"
    title: str
    status: int
    detail: str | None = None
    instance: str | None = None
    errors: list[dict] = []
