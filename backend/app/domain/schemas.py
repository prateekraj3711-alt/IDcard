from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.infrastructure.db.models import (
    BulkImportRowStatus,
    BulkImportStatus,
    Gender,
    IdCardJobStatus,
    StudentStatus,
    SyncOp,
    SyncStatus,
    TemplateModule,
    UserRole,
)


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


class AdminCreate(BaseModel):
    full_name: str
    email: EmailStr
    phone: str | None = None
    username: str | None = Field(default=None, min_length=3, max_length=50, pattern=r"^[a-zA-Z0-9._-]+$")
    password: str | None = Field(default=None, min_length=8, max_length=128)


class AdminOut(ORMModel):
    id: UUID
    full_name: str
    email: EmailStr
    role: UserRole
    is_active: bool
    last_login_at: datetime | None = None
    created_at: datetime


class AdminCreatedOut(AdminOut):
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


class ProblemDetails(BaseModel):
    type: str = "about:blank"
    title: str
    status: int
    detail: str | None = None
    instance: str | None = None
    errors: list[dict] = []


# --- Templates -------------------------------------------------------------

class TemplateCreate(BaseModel):
    school_id: UUID | None = None
    module: TemplateModule = TemplateModule.student
    name: str
    layout_json: dict | None = None
    html: str | None = None
    css: str = ""
    paper_size: str = "A4"
    card_width_mm: int = 86
    card_height_mm: int = 54


class TemplateUpdate(BaseModel):
    name: str | None = None
    module: TemplateModule | None = None
    layout_json: dict | None = None
    html: str | None = None
    css: str | None = None
    paper_size: str | None = None
    card_width_mm: int | None = None
    card_height_mm: int | None = None
    is_active: bool | None = None


class TemplateOut(ORMModel):
    id: UUID
    school_id: UUID | None
    module: TemplateModule
    name: str
    version: int
    layout_json: dict | None
    html: str | None
    css: str
    paper_size: str
    card_width_mm: int
    card_height_mm: int
    is_active: bool
    created_at: datetime


# Canonical binding vocabulary the Konva editor and renderer both know about.
# Each `field` is what an element's `binding` value references.
TEMPLATE_FIELD_CATALOG: dict[str, list[dict[str, str]]] = {
    "student": [
        {"field": "student.name",            "label": "Name",           "kind": "text"},
        {"field": "student.enrollment_no",   "label": "Enrollment ID",  "kind": "text"},
        {"field": "student.class_section",   "label": "Class & Section","kind": "text"},
        {"field": "student.roll_no",         "label": "Roll No",        "kind": "text"},
        {"field": "student.dob",             "label": "DOB",            "kind": "text"},
        {"field": "student.blood_group",     "label": "Blood Group",    "kind": "text"},
        {"field": "student.father_name",     "label": "Father's Name",  "kind": "text"},
        {"field": "student.mother_name",     "label": "Mother's Name",  "kind": "text"},
        {"field": "student.address",         "label": "Address",        "kind": "text"},
        {"field": "student.mobile",          "label": "Mobile",         "kind": "text"},
        {"field": "photo",                   "label": "Photo",          "kind": "image"},
        {"field": "qr",                      "label": "QR Code",        "kind": "qr"},
        {"field": "barcode",                 "label": "Barcode",        "kind": "barcode"},
        {"field": "school.logo",             "label": "School Logo",    "kind": "image"},
        {"field": "school.name",             "label": "School Name",    "kind": "text"},
        {"field": "principal.signature",     "label": "Signature",      "kind": "image"},
    ],
    "employee": [
        {"field": "employee.name",           "label": "Name",           "kind": "text"},
        {"field": "employee.employee_id",    "label": "Employee ID",    "kind": "text"},
        {"field": "employee.designation",    "label": "Designation",    "kind": "text"},
        {"field": "employee.department",     "label": "Department",     "kind": "text"},
        {"field": "employee.doj",            "label": "Date of Joining","kind": "text"},
        {"field": "employee.blood_group",    "label": "Blood Group",    "kind": "text"},
        {"field": "employee.address",        "label": "Address",        "kind": "text"},
        {"field": "employee.mobile",         "label": "Mobile",         "kind": "text"},
        {"field": "photo",                   "label": "Photo",          "kind": "image"},
        {"field": "qr",                      "label": "QR Code",        "kind": "qr"},
        {"field": "barcode",                 "label": "Barcode",        "kind": "barcode"},
        {"field": "org.logo",                "label": "Org Logo",       "kind": "image"},
        {"field": "org.name",                "label": "Org Name",       "kind": "text"},
        {"field": "authority.signature",     "label": "Authorised Signatory", "kind": "image"},
    ],
}


class TemplateFieldCatalog(BaseModel):
    module: TemplateModule
    fields: list[dict[str, str]]


class TemplateImportResult(BaseModel):
    """Response body for POST /templates/import."""
    template: "TemplateOut"
    source: str      # "json" | "image"


# --- Bulk import -----------------------------------------------------------

# Header → student field. Not exhaustive — the service also does keyword-based
# fuzzy matching against FIELD_KEYWORDS so headers like "S.N.", "ENR. NO.",
# "FATHER NAME" or "CLASS" from various client sheets all auto-map.
DEFAULT_COLUMN_MAPPING: dict[str, str] = {
    "Ph No.":         "photo_hint",
    "S.N.":           "photo_hint",
    "Student Name":   "name",
    "NAME":           "name",
    "Enr No.":        "enrollment_no",
    "ENR. NO.":       "enrollment_no",
    "Enr":            "enrolled_year",
    "CLASS":          "class_name",
    "SECTION":        "section_name",
    "ROLL":           "roll_no",
    "DOB":            "dob",
    "Father's Name":  "father_name",
    "FATHER NAME":    "father_name",
    "Mother's Name":  "mother_name",
    "MOTHER NAME":    "mother_name",
    "Address":        "address",
    "ADDRESS":        "address",
    "Mobile":         "mobile",
    "MOBILE":         "mobile",
}

# Token vocabulary used by the fuzzy suggester when a header isn't in
# DEFAULT_COLUMN_MAPPING verbatim. Each entry is (field, keyword phrases the
# normalized column may contain). Longer / more-specific phrases first so
# "father name" beats "name".
FIELD_KEYWORDS: list[tuple[str, list[str]]] = [
    ("photo_hint",    ["photonumber", "photono", "phno", "photofile", "photograph", "sno", "srno", "serialno"]),
    ("father_name",   ["fathername", "fathersname", "fathersname", "guardianname"]),
    ("mother_name",   ["mothername", "mothersname"]),
    ("enrollment_no", ["enrollmentno", "enrolmentno", "enrollmentid", "enrno", "enrolno", "registrationno", "regno", "admissionno"]),
    ("roll_no",       ["rollno", "rollnumber", "roll"]),
    ("class_name",    ["class", "standard", "std", "grade"]),
    ("section_name",  ["section", "sec"]),
    ("dob",           ["dateofbirth", "birthdate", "dob"]),
    ("blood_group",   ["bloodgroup", "blood"]),
    ("gender",        ["gender", "sex"]),
    ("enrolled_on",   ["admissiondate", "joiningdate", "enrolledon", "dateofjoining"]),
    ("enrolled_year", ["academicyear", "session", "batch", "year"]),
    ("mobile",        ["mobilenumber", "mobileno", "phonenumber", "phoneno", "contactno", "contactnumber", "mobile", "phone", "contact"]),
    ("address",       ["address", "residence", "location"]),
    ("name",          ["studentname", "candidatename", "fullname", "name"]),
]


class BulkImportOut(ORMModel):
    id: UUID
    school_id: UUID
    source_type: str
    original_filename: str
    column_mapping: dict | None
    status: BulkImportStatus
    stats: dict | None
    error: str | None
    created_at: datetime
    updated_at: datetime


class BulkImportRowOut(ORMModel):
    id: UUID
    row_index: int
    raw: dict
    mapped: dict | None
    status: BulkImportRowStatus
    errors: list | None
    photo_storage_key: str | None


class BulkImportPreview(BaseModel):
    import_id: UUID
    columns_detected: list[str]
    suggested_mapping: dict[str, str]
    total_rows: int
    sample: list[BulkImportRowOut]


class BulkImportCommitRequest(BaseModel):
    column_mapping: dict[str, str] | None = None   # overrides on commit
    default_class_id: UUID | None = None
    default_section_id: UUID | None = None


class BulkImportCommitResult(BaseModel):
    imported: int
    failed: int
    photos_matched: int


# --- ID Card generation jobs -----------------------------------------------

class IdCardJobCreate(BaseModel):
    template_id: UUID
    school_id: UUID
    student_ids: list[UUID] | None = None
    class_id: UUID | None = None
    section_id: UUID | None = None
    output_format: str = Field(default="pdf", pattern=r"^(pdf|png|zip)$")
    layout: str = Field(default="single", pattern=r"^(single|a4-sheet)$")


class IdCardJobOut(ORMModel):
    id: UUID
    school_id: UUID
    template_id: UUID
    output_format: str
    layout: str
    status: IdCardJobStatus
    total: int
    processed: int
    output_key: str | None
    download_url: str | None = None
    error: str | None
    created_at: datetime
    updated_at: datetime
