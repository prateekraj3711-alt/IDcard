"""
Seed minimal demo data so the dashboard and Android app have something to show.

    python -m scripts.seed_demo

Creates:
  - 1 school (DPS-DEL-01 — Delhi Public School Demo)
  - 1 class (Grade 5) with 1 section (A)
  - 1 teacher (username: priya.sharma, password printed)
  - 3 sample students with enrollment numbers DPS2025-0001..0003
  - 1 template (student module, blank layout)

Idempotent: safe to re-run — checks for existing rows first.
"""
from __future__ import annotations

import asyncio
import secrets
import string
from datetime import date
from uuid import uuid4

from sqlalchemy import select

from app.core.security import hash_password
from app.infrastructure.db.models import (
    Class,
    IdCardTemplate,
    School,
    Section,
    Student,
    StudentStatus,
    TemplateModule,
    User,
    UserRole,
)
from app.infrastructure.db.session import SessionLocal, engine


def _gen_password(n: int = 12) -> str:
    alpha = "".join(c for c in string.ascii_letters if c not in "IlO")
    digits = "".join(c for c in string.digits if c not in "01")
    return "".join(secrets.choice(alpha + digits) for _ in range(n))


async def main() -> None:
    async with SessionLocal() as s:
        # School
        school = (
            await s.execute(select(School).where(School.code == "DPS-DEL-01"))
        ).scalar_one_or_none()
        if school is None:
            school = School(
                code="DPS-DEL-01", name="Delhi Public School Demo",
                city="New Delhi", state="DL", pincode="110001",
                principal_name="Dr. R Sharma",
            )
            s.add(school); await s.flush()

        # Class + section
        cls = (
            await s.execute(select(Class).where(Class.school_id == school.id, Class.name == "Grade 5"))
        ).scalar_one_or_none()
        if cls is None:
            cls = Class(school_id=school.id, name="Grade 5", ordering=5)
            s.add(cls); await s.flush()

        sec = (
            await s.execute(select(Section).where(Section.class_id == cls.id, Section.name == "A"))
        ).scalar_one_or_none()
        if sec is None:
            sec = Section(class_id=cls.id, name="A"); s.add(sec); await s.flush()

        # Teacher
        teacher = (
            await s.execute(select(User).where(User.username == "priya.sharma"))
        ).scalar_one_or_none()
        teacher_pw = None
        if teacher is None:
            teacher_pw = _gen_password()
            teacher = User(
                email="priya@dpsdel.example",
                username="priya.sharma",
                full_name="Priya Sharma",
                password_hash=hash_password(teacher_pw),
                role=UserRole.teacher,
                school_id=school.id,
            )
            s.add(teacher); await s.flush()

        # Students
        for i in range(1, 4):
            enrollment = f"DPS2025-{i:04d}"
            exists = (
                await s.execute(
                    select(Student).where(
                        Student.school_id == school.id, Student.enrollment_no == enrollment
                    )
                )
            ).scalar_one_or_none()
            if exists:
                continue
            s.add(
                Student(
                    client_uuid=uuid4(),
                    school_id=school.id, class_id=cls.id, section_id=sec.id,
                    enrollment_no=enrollment, roll_no=str(i),
                    name=f"Demo Student {i}",
                    father_name="Ramesh Kumar",
                    mother_name="Anita Kumari",
                    dob=date(2014, 8, 11),
                    blood_group="B+",
                    address="Sector 21, New Delhi",
                    mobile="+919812345678",
                    enrolled_on=date(2025, 4, 1),
                    status=StudentStatus.active,
                    created_by=teacher.id,
                )
            )

        # Template
        tmpl_exists = (
            await s.execute(
                select(IdCardTemplate).where(
                    IdCardTemplate.school_id == school.id,
                    IdCardTemplate.name == "Default Student Card",
                )
            )
        ).scalar_one_or_none()
        if tmpl_exists is None:
            s.add(
                IdCardTemplate(
                    school_id=school.id,
                    module=TemplateModule.student,
                    name="Default Student Card",
                    layout_json={
                        "width": 340, "height": 214, "background": "#ffffff",
                        "elements": [
                            {"id": "hdr",   "kind": "text",  "text": "STUDENT ID CARD",
                             "x": 24, "y": 12, "width": 220, "height": 20, "fontSize": 12, "fill": "#1F5DF9"},
                            {"id": "photo", "kind": "image", "binding": "photo",
                             "x": 240, "y": 40, "width": 80, "height": 100},
                            {"id": "name",  "kind": "text",  "binding": "student.name",
                             "x": 24, "y": 46, "width": 200, "height": 22, "fontSize": 16},
                            {"id": "enr",   "kind": "text",  "binding": "student.enrollment_no",
                             "x": 24, "y": 72, "width": 200, "height": 18, "fontSize": 12, "fill": "#555"},
                            {"id": "qr",    "kind": "qr",    "binding": "qr",
                             "x": 24, "y": 148, "width": 46, "height": 46},
                        ],
                    },
                    paper_size="A4",
                    card_width_mm=86,
                    card_height_mm=54,
                    created_by=teacher.id,
                )
            )

        await s.commit()

    print("✓ Demo seed complete")
    print(f"  school code:   DPS-DEL-01")
    print(f"  teacher user:  priya.sharma")
    if teacher_pw:
        print(f"  teacher pass:  {teacher_pw}   (only shown once)")
    else:
        print(f"  teacher pass:  (unchanged — teacher already existed)")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
