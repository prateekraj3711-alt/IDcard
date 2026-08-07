from __future__ import annotations

import enum
from datetime import date, datetime
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import CITEXT, INET, JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.infrastructure.db.base import Base, SoftDelete, Timestamped, UUIDPK


class UserRole(str, enum.Enum):
    super_admin = "super_admin"
    teacher = "teacher"


class StudentStatus(str, enum.Enum):
    draft = "draft"
    submitted = "submitted"
    active = "active"
    archived = "archived"


class Gender(str, enum.Enum):
    male = "male"
    female = "female"
    other = "other"


class SyncOp(str, enum.Enum):
    create = "create"
    update = "update"
    delete = "delete"
    photo_upload = "photo_upload"


class SyncStatus(str, enum.Enum):
    pending = "pending"
    uploading = "uploading"
    uploaded = "uploaded"
    failed = "failed"


class School(Base, UUIDPK, Timestamped, SoftDelete):
    __tablename__ = "schools"

    code: Mapped[str] = mapped_column(String(16), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    address: Mapped[str | None] = mapped_column(Text)
    city: Mapped[str | None] = mapped_column(String(100))
    state: Mapped[str | None] = mapped_column(String(100))
    pincode: Mapped[str | None] = mapped_column(String(10))
    phone: Mapped[str | None] = mapped_column(String(20))
    email: Mapped[str | None] = mapped_column(CITEXT)
    logo_url: Mapped[str | None] = mapped_column(Text)
    principal_name: Mapped[str | None] = mapped_column(String(100))
    is_active: Mapped[bool] = mapped_column(Boolean, server_default="true", nullable=False)

    users: Mapped[list["User"]] = relationship(back_populates="school")
    students: Mapped[list["Student"]] = relationship(back_populates="school")
    classes: Mapped[list["Class"]] = relationship(back_populates="school")


class User(Base, UUIDPK, Timestamped, SoftDelete):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(CITEXT, unique=True, nullable=False)
    username: Mapped[str | None] = mapped_column(CITEXT, unique=True)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    full_name: Mapped[str] = mapped_column(String(150), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole, name="user_role"), nullable=False)
    school_id: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("schools.id"))
    phone: Mapped[str | None] = mapped_column(String(20))
    is_active: Mapped[bool] = mapped_column(Boolean, server_default="true", nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    failed_login_attempts: Mapped[int] = mapped_column(Integer, server_default="0", nullable=False)
    token_version: Mapped[int] = mapped_column(Integer, server_default="0", nullable=False)

    school: Mapped[School | None] = relationship(back_populates="users")

    __table_args__ = (Index("ix_users_school_role", "school_id", "role"),)


class Class(Base, UUIDPK, Timestamped):
    __tablename__ = "classes"

    school_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    ordering: Mapped[int] = mapped_column(Integer, server_default="0", nullable=False)

    school: Mapped[School] = relationship(back_populates="classes")
    sections: Mapped[list["Section"]] = relationship(back_populates="class_")

    __table_args__ = (UniqueConstraint("school_id", "name", name="uq_class_school_name"),)


class Section(Base, UUIDPK, Timestamped):
    __tablename__ = "sections"

    class_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("classes.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(10), nullable=False)
    ordering: Mapped[int] = mapped_column(Integer, server_default="0", nullable=False)

    class_: Mapped[Class] = relationship(back_populates="sections")

    __table_args__ = (UniqueConstraint("class_id", "name", name="uq_section_class_name"),)


class Student(Base, UUIDPK, Timestamped, SoftDelete):
    __tablename__ = "students"

    client_uuid: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), unique=True, nullable=False)
    school_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("schools.id"), nullable=False
    )
    class_id: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("classes.id"))
    section_id: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("sections.id"))
    enrollment_no: Mapped[str] = mapped_column(String(30), nullable=False)
    roll_no: Mapped[str | None] = mapped_column(String(10))
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    father_name: Mapped[str | None] = mapped_column(String(150))
    mother_name: Mapped[str | None] = mapped_column(String(150))
    dob: Mapped[date | None] = mapped_column(Date)
    blood_group: Mapped[str | None] = mapped_column(String(5))
    gender: Mapped[Gender | None] = mapped_column(Enum(Gender, name="gender"))
    address: Mapped[str | None] = mapped_column(Text)
    mobile: Mapped[str | None] = mapped_column(String(20))
    enrolled_on: Mapped[date | None] = mapped_column(Date)
    status: Mapped[StudentStatus] = mapped_column(
        Enum(StudentStatus, name="student_status"), server_default="draft", nullable=False
    )
    created_by: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id"))

    school: Mapped[School] = relationship(back_populates="students")
    photos: Mapped[list["Photo"]] = relationship(back_populates="student", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_students_school_class_section", "school_id", "class_id", "section_id"),
        Index("ix_students_enrollment_no", "enrollment_no"),
        Index("ix_students_mobile", "mobile"),
        CheckConstraint("length(name) > 0", name="ck_students_name_nonempty"),
    )


class Photo(Base, UUIDPK, Timestamped):
    __tablename__ = "photos"

    student_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("students.id", ondelete="CASCADE"), nullable=False
    )
    storage_key: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    content_type: Mapped[str] = mapped_column(String(50), server_default="image/jpeg", nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    is_primary: Mapped[bool] = mapped_column(Boolean, server_default="false", nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    student: Mapped[Student] = relationship(back_populates="photos")

    __table_args__ = (
        Index(
            "uq_photo_primary_per_student",
            "student_id",
            unique=True,
            postgresql_where="is_primary = true",
        ),
    )


class SyncLog(Base, UUIDPK, Timestamped):
    __tablename__ = "sync_logs"

    student_id: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("students.id"))
    client_uuid: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True))
    device_id: Mapped[str | None] = mapped_column(String(128))
    user_id: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id"))
    operation: Mapped[SyncOp] = mapped_column(Enum(SyncOp, name="sync_op"), nullable=False)
    status: Mapped[SyncStatus] = mapped_column(Enum(SyncStatus, name="sync_status"), nullable=False)
    retries: Mapped[int] = mapped_column(Integer, server_default="0", nullable=False)
    error: Mapped[str | None] = mapped_column(Text)
    payload: Mapped[dict | None] = mapped_column(JSONB)


class AuditLog(Base, UUIDPK):
    __tablename__ = "audit_logs"

    user_id: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True))
    action: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_id: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True))
    diff: Mapped[dict | None] = mapped_column(JSONB)
    ip: Mapped[str | None] = mapped_column(INET)
    user_agent: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class RefreshToken(Base, UUIDPK, Timestamped):
    __tablename__ = "refresh_tokens"

    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    device_id: Mapped[str | None] = mapped_column(String(128))
    user_agent: Mapped[str | None] = mapped_column(Text)
    ip: Mapped[str | None] = mapped_column(INET)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (Index("ix_refresh_tokens_user_active", "user_id", "revoked_at"),)


class IdCardTemplate(Base, UUIDPK, Timestamped):
    __tablename__ = "id_card_templates"

    school_id: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("schools.id"))
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    version: Mapped[int] = mapped_column(Integer, server_default="1", nullable=False)
    html: Mapped[str] = mapped_column(Text, nullable=False)
    css: Mapped[str] = mapped_column(Text, server_default="", nullable=False)
    paper_size: Mapped[str] = mapped_column(String(10), server_default="A4", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default="true", nullable=False)
    created_by: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id"))


class IdCard(Base, UUIDPK, Timestamped):
    __tablename__ = "id_cards"

    student_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("students.id"), nullable=False
    )
    template_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("id_card_templates.id"), nullable=False
    )
    pdf_key: Mapped[str | None] = mapped_column(Text)
    png_key: Mapped[str | None] = mapped_column(Text)
    qr_payload: Mapped[dict | None] = mapped_column(JSONB)
    generated_by: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id"))
