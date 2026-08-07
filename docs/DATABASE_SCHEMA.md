# Database Schema

PostgreSQL 15. All tables use UUID v4 primary keys, `created_at` / `updated_at` with `TIMESTAMPTZ`, and soft-delete via `deleted_at`.

## ER Diagram

```
┌──────────────┐        ┌──────────────┐        ┌──────────────┐
│   schools    │ 1────* │   classes    │ 1────* │   sections   │
│──────────────│        │──────────────│        │──────────────│
│ id (uuid)    │        │ id           │        │ id           │
│ code         │◄───┐   │ school_id    │◄───┐   │ class_id     │◄───┐
│ name         │    │   │ name         │    │   │ name         │    │
│ address      │    │   │ ordering     │    │   │ ordering     │    │
│ logo_url     │    │   └──────────────┘    │   └──────────────┘    │
│ ...          │    │                       │                       │
└──────────────┘    │                       │                       │
       ▲            │                       │                       │
       │ 1          │                       │                       │
       │            │                       │                       │
       *            │                       │                       │
┌──────────────┐    │   ┌──────────────┐    │                       │
│   users      │────┘   │   students   │────┘                       │
│──────────────│        │──────────────│                            │
│ id           │        │ id           │                            │
│ email        │        │ client_uuid  │──────────────────────────► unique
│ password_hash│        │ school_id    │
│ role         │        │ class_id     │────────────────────────────┘
│ school_id?   │        │ section_id   │─────────► sections.id
│ ...          │        │ enrollment_no│──── unique per school
└──────┬───────┘        │ name         │
       │                │ father_name  │        ┌──────────────┐
       │ 1              │ mother_name  │ 1────* │  photos      │
       │                │ dob          │        │──────────────│
       *                │ blood_group  │        │ id           │
┌──────────────┐        │ address      │        │ student_id   │
│  audit_logs  │        │ mobile       │        │ storage_key  │
│──────────────│        │ enrolled_on  │        │ url          │
│ id           │        │ status       │        │ width/height │
│ user_id      │        │ ...          │        │ sha256       │
│ action       │        └──────┬───────┘        │ is_primary   │
│ entity_type  │               │ 1              └──────────────┘
│ entity_id    │               │
│ diff (jsonb) │               *
│ ip / ua      │        ┌──────────────┐
│ created_at   │        │  sync_logs   │
└──────────────┘        │──────────────│
                        │ id           │
                        │ student_id?  │
                        │ device_id    │
                        │ operation    │  (create/update/delete/photo)
                        │ status       │  (pending/uploading/uploaded/failed)
                        │ error        │
                        │ retries      │
                        └──────────────┘
```

## Tables

### `schools`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| code | varchar(16) UNIQUE | teacher login uses this |
| name | varchar(200) | |
| address | text | |
| city | varchar(100) | |
| state | varchar(100) | |
| pincode | varchar(10) | |
| phone | varchar(20) | |
| email | citext | |
| logo_url | text | |
| principal_name | varchar(100) | |
| is_active | boolean DEFAULT true | |
| created_at, updated_at, deleted_at | timestamptz | |

Indexes: `code`, `name` (GIN trigram).

### `users`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| email | citext UNIQUE | |
| username | citext UNIQUE | for teachers |
| password_hash | text | bcrypt cost 12 |
| full_name | varchar(150) | |
| role | user_role ENUM | `super_admin`, `teacher` |
| school_id | uuid FK schools.id NULLABLE | required for teachers; null for super_admin |
| is_active | boolean | |
| last_login_at | timestamptz | |
| failed_login_attempts | int | for lockout |
| ... | | |

Indexes: `email`, `(school_id, role)`.

### `classes`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| school_id | uuid FK | |
| name | varchar(50) | e.g. "Grade 5" |
| ordering | int | |
| UNIQUE(school_id, name) | | |

### `sections`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| class_id | uuid FK | |
| name | varchar(10) | "A", "B" |
| UNIQUE(class_id, name) | | |

### `students`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| client_uuid | uuid UNIQUE | generated on device; upsert key |
| school_id | uuid FK NOT NULL | |
| class_id | uuid FK | |
| section_id | uuid FK | |
| enrollment_no | varchar(30) | |
| roll_no | varchar(10) | |
| name | varchar(150) | |
| father_name | varchar(150) | |
| mother_name | varchar(150) | |
| dob | date | |
| blood_group | varchar(5) | |
| gender | gender ENUM | |
| address | text | |
| mobile | varchar(20) | E.164-normalized |
| enrolled_on | date | |
| status | student_status ENUM | `draft`, `submitted`, `active`, `archived` |
| created_by | uuid FK users.id | |
| created_at, updated_at, deleted_at | timestamptz | |

Constraints:
- `UNIQUE (school_id, enrollment_no) WHERE deleted_at IS NULL`
- `UNIQUE (school_id, class_id, section_id, roll_no) WHERE deleted_at IS NULL`

Indexes:
- B-tree: `(school_id, class_id, section_id)`, `enrollment_no`, `mobile`
- GIN trigram: `name`, `father_name`, `mother_name` (for fuzzy search)

### `photos`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| student_id | uuid FK | |
| storage_key | text UNIQUE | `schools/{school_id}/students/{student_id}/{uuid}.jpg` |
| url | text | signed CDN URL cached; nullable |
| content_type | varchar(50) | |
| size_bytes | int | |
| width | int | |
| height | int | |
| sha256 | char(64) | |
| is_primary | boolean | one primary per student — partial unique index |
| uploaded_at | timestamptz | |

Partial unique: `UNIQUE(student_id) WHERE is_primary IS TRUE`.

### `sync_logs`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| student_id | uuid FK NULL | may reference not-yet-created row via client_uuid |
| client_uuid | uuid | |
| device_id | varchar(128) | |
| user_id | uuid FK | |
| operation | sync_op ENUM | `create`, `update`, `delete`, `photo_upload` |
| status | sync_status ENUM | `pending`, `uploading`, `uploaded`, `failed` |
| retries | int DEFAULT 0 | |
| error | text | |
| payload | jsonb | last request body for replay |
| created_at, updated_at | timestamptz | |

### `audit_logs`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK NULL | null for system |
| action | varchar(50) | `student.create`, `student.update`, `photo.upload`, ... |
| entity_type | varchar(50) | |
| entity_id | uuid | |
| diff | jsonb | `{before, after}` for updates |
| ip | inet | |
| user_agent | text | |
| created_at | timestamptz | |

Partition by month for retention.

### `id_card_templates`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| school_id | uuid FK NULL | null = system template |
| module | template_module ENUM | `student` \| `employee` — determines the binding catalog |
| name | varchar(100) | |
| version | int | bumps on every PATCH |
| layout_json | jsonb | Konva canvas layout (elements with binding, x/y/w/h, font, kind) |
| html | text NULL | optional hand-authored HTML (advanced users) |
| css | text | |
| paper_size | varchar(10) | e.g. `A4`, `A6` |
| card_width_mm | int | CR80 default 86 |
| card_height_mm | int | CR80 default 54 |
| is_active | boolean | |
| created_by | uuid FK | |

Index: `(module, school_id)`.

### `bulk_imports`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| school_id | uuid FK NOT NULL | |
| uploader_id | uuid FK users.id | |
| source_type | varchar(10) | `xlsx` \| `csv` |
| original_filename | varchar(255) | |
| spreadsheet_key | text | S3 key of the uploaded sheet |
| photos_prefix | text | S3 prefix where photos were extracted |
| column_mapping | jsonb | `{ "Student Name": "name", ... }` |
| status | bulk_import_status ENUM | `uploaded`, `validated`, `importing`, `completed`, `failed` |
| stats | jsonb | `{ total, valid, invalid, imported, photos_matched }` |
| error | text | |

### `bulk_import_rows`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| bulk_import_id | uuid FK ON DELETE CASCADE | |
| row_index | int | 1-based |
| raw | jsonb | cells by header |
| mapped | jsonb | normalized to student fields |
| status | bulk_import_row_status ENUM | `pending`, `valid`, `invalid`, `imported`, `failed` |
| errors | jsonb | list of `{ field, code, message }` |
| photo_storage_key | text | matched photo (if any) |
| student_id | uuid FK NULL | filled after successful commit |

Index: `(bulk_import_id)`.

### `id_card_jobs`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| school_id | uuid FK NOT NULL | |
| requested_by | uuid FK users.id | |
| template_id | uuid FK | |
| student_ids | jsonb | array of ids (nullable when class/section-based) |
| class_id / section_id | uuid FK NULL | |
| output_format | varchar(10) | `pdf` \| `png` \| `zip` |
| layout | varchar(20) | `single` \| `a4-sheet` |
| total | int | |
| processed | int | worker updates as it renders |
| status | id_card_job_status ENUM | `queued`, `running`, `done`, `failed` |
| output_key | text | S3 key of the final bundle |
| error | text | |

### `refresh_tokens`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK | |
| token_hash | char(64) | sha256 of raw token |
| device_id | varchar(128) | |
| user_agent | text | |
| ip | inet | |
| expires_at | timestamptz | |
| revoked_at | timestamptz NULL | |

Index: `(user_id, revoked_at)`.

### `id_cards`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| student_id | uuid FK | |
| template_id | uuid FK | |
| pdf_key | text | S3 key |
| png_key | text | |
| qr_payload | jsonb | |
| generated_by | uuid FK | |
| generated_at | timestamptz | |

## Enums

```sql
CREATE TYPE user_role              AS ENUM ('super_admin', 'teacher');
CREATE TYPE student_status         AS ENUM ('draft', 'submitted', 'active', 'archived');
CREATE TYPE sync_op                AS ENUM ('create', 'update', 'delete', 'photo_upload');
CREATE TYPE sync_status            AS ENUM ('pending', 'uploading', 'uploaded', 'failed');
CREATE TYPE gender                 AS ENUM ('male', 'female', 'other');
CREATE TYPE template_module        AS ENUM ('student', 'employee');
CREATE TYPE bulk_import_status     AS ENUM ('uploaded', 'validated', 'importing', 'completed', 'failed');
CREATE TYPE bulk_import_row_status AS ENUM ('pending', 'valid', 'invalid', 'imported', 'failed');
CREATE TYPE id_card_job_status     AS ENUM ('queued', 'running', 'done', 'failed');
```

## Search Extension

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE INDEX students_name_trgm     ON students USING GIN (name gin_trgm_ops);
CREATE INDEX students_father_trgm   ON students USING GIN (father_name gin_trgm_ops);
CREATE INDEX students_mother_trgm   ON students USING GIN (mother_name gin_trgm_ops);
```
