-- ===== Enums =====
CREATE TYPE public.app_role AS ENUM ('super_admin', 'teacher');
CREATE TYPE public.student_status AS ENUM ('draft', 'submitted', 'active', 'archived');
CREATE TYPE public.gender AS ENUM ('male', 'female', 'other');
CREATE TYPE public.sync_op AS ENUM ('create', 'update', 'delete', 'photo_upload');
CREATE TYPE public.sync_status AS ENUM ('pending', 'uploading', 'uploaded', 'failed');
CREATE TYPE public.bulk_import_status AS ENUM ('uploaded', 'validated', 'importing', 'completed', 'failed');
CREATE TYPE public.bulk_import_row_status AS ENUM ('pending', 'valid', 'invalid', 'imported', 'failed');
CREATE TYPE public.id_card_job_status AS ENUM ('queued', 'running', 'done', 'failed');
CREATE TYPE public.template_module AS ENUM ('student', 'employee');

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ===== Schools =====
CREATE TABLE public.schools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(16) NOT NULL UNIQUE,
  name varchar(200) NOT NULL,
  address text, city varchar(100), state varchar(100), pincode varchar(10),
  phone varchar(20), email text, logo_url text, principal_name varchar(100),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schools TO authenticated;
GRANT ALL ON public.schools TO service_role;
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;

-- ===== Profiles & roles (replaces backend `users` table; auth lives in Supabase Auth) =====
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,                       -- = auth.users.id
  email text NOT NULL UNIQUE,
  username text UNIQUE,
  full_name varchar(150) NOT NULL,
  phone varchar(20),
  school_id uuid REFERENCES public.schools(id),
  is_active boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX ix_profiles_school ON public.profiles(school_id);
CREATE INDEX ix_profiles_phone ON public.profiles(phone);
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ===== Authorization helpers =====
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.current_school_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT school_id FROM public.profiles WHERE id = auth.uid() AND is_active AND deleted_at IS NULL
$$;

CREATE OR REPLACE FUNCTION public.can_access_school(_school_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.has_role(auth.uid(), 'super_admin')
    OR (_school_id IS NOT NULL AND _school_id = public.current_school_id())
  )
$$;

-- For storage paths: first folder segment must be the caller's school id.
CREATE OR REPLACE FUNCTION public.can_access_school_path(_segment text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.has_role(auth.uid(), 'super_admin')
    OR (_segment IS NOT NULL AND _segment = public.current_school_id()::text)
  )
$$;

-- ===== Policies: schools / profiles / roles =====
CREATE POLICY "schools_select" ON public.schools FOR SELECT TO authenticated USING (public.can_access_school(id));
CREATE POLICY "schools_admin_insert" ON public.schools FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "schools_admin_update" ON public.schools FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "schools_admin_delete" ON public.schools FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "profiles_update_self" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid() AND school_id IS NOT DISTINCT FROM public.current_school_id());

CREATE POLICY "roles_select" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'));

-- ===== Classes & sections =====
CREATE TABLE public.classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name varchar(50) NOT NULL,
  ordering int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_class_school_name UNIQUE (school_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.classes TO authenticated;
GRANT ALL ON public.classes TO service_role;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "classes_all" ON public.classes FOR ALL TO authenticated
  USING (public.can_access_school(school_id)) WITH CHECK (public.can_access_school(school_id));

CREATE TABLE public.sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name varchar(10) NOT NULL,
  ordering int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_section_class_name UNIQUE (class_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sections TO authenticated;
GRANT ALL ON public.sections TO service_role;
ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sections_all" ON public.sections FOR ALL TO authenticated
  USING (public.can_access_school(school_id)) WITH CHECK (public.can_access_school(school_id));

-- ===== Students =====
CREATE TABLE public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_uuid uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  class_id uuid REFERENCES public.classes(id),
  section_id uuid REFERENCES public.sections(id),
  enrollment_no varchar(30) NOT NULL,
  roll_no varchar(10),
  name varchar(150) NOT NULL CHECK (length(name) > 0),
  father_name varchar(150), mother_name varchar(150),
  dob date, blood_group varchar(5), gender public.gender,
  address text, mobile varchar(20), enrolled_on date,
  status public.student_status NOT NULL DEFAULT 'draft',
  photo_path text,           -- primary photo path in `student-photos`
  photo_hash varchar(64),    -- sha256 of primary photo
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX ix_students_school_class_section ON public.students(school_id, class_id, section_id);
CREATE INDEX ix_students_enrollment_no ON public.students(enrollment_no);
CREATE INDEX ix_students_mobile ON public.students(mobile);
CREATE UNIQUE INDEX uq_students_school_enrollment ON public.students(school_id, enrollment_no) WHERE deleted_at IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.students TO authenticated;
GRANT ALL ON public.students TO service_role;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
CREATE POLICY "students_all" ON public.students FOR ALL TO authenticated
  USING (public.can_access_school(school_id)) WITH CHECK (public.can_access_school(school_id));

-- ===== Photos (metadata only; binaries in Storage bucket `student-photos`) =====
CREATE TABLE public.photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id),
  storage_path text NOT NULL UNIQUE,
  content_type varchar(50) NOT NULL DEFAULT 'image/jpeg',
  size_bytes int NOT NULL,
  width int, height int,
  sha256 varchar(64) NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  uploaded_by uuid,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_photo_student_sha UNIQUE (student_id, sha256)
);
CREATE UNIQUE INDEX uq_photo_primary_per_student ON public.photos(student_id) WHERE is_primary;
CREATE INDEX ix_photos_sha ON public.photos(sha256);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.photos TO authenticated;
GRANT ALL ON public.photos TO service_role;
ALTER TABLE public.photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "photos_all" ON public.photos FOR ALL TO authenticated
  USING (public.can_access_school(school_id)) WITH CHECK (public.can_access_school(school_id));

-- Atomically record an uploaded photo as the student's primary photo.
CREATE OR REPLACE FUNCTION public.record_student_photo(
  _student_id uuid, _storage_path text, _size_bytes int, _width int, _height int, _sha256 text,
  _content_type text DEFAULT 'image/jpeg'
) RETURNS public.photos
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE s public.students; p public.photos;
BEGIN
  SELECT * INTO s FROM public.students WHERE id = _student_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'student not found' USING ERRCODE = 'P0002'; END IF;
  IF split_part(_storage_path, '/', 1) <> s.school_id::text OR split_part(_storage_path, '/', 2) <> s.id::text THEN
    RAISE EXCEPTION 'storage path does not match student' USING ERRCODE = '22023';
  END IF;
  UPDATE public.photos SET is_primary = false WHERE student_id = s.id AND is_primary;
  INSERT INTO public.photos (student_id, school_id, storage_path, content_type, size_bytes, width, height, sha256, is_primary, uploaded_by)
  VALUES (s.id, s.school_id, _storage_path, coalesce(_content_type, 'image/jpeg'), _size_bytes, _width, _height, _sha256, true, auth.uid())
  ON CONFLICT (student_id, sha256) DO UPDATE SET is_primary = true, updated_at = now()
  RETURNING * INTO p;
  UPDATE public.students SET photo_path = p.storage_path, photo_hash = p.sha256, updated_at = now() WHERE id = s.id;
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, diff)
  VALUES (auth.uid(), 'photo.upload', 'photo', p.id, jsonb_build_object('student_id', s.id, 'storage_path', p.storage_path));
  RETURN p;
END; $$;

-- ===== Sync & audit logs =====
CREATE TABLE public.sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  client_uuid uuid, device_id varchar(128),
  user_id uuid DEFAULT auth.uid(),
  operation public.sync_op NOT NULL,
  status public.sync_status NOT NULL,
  retries int NOT NULL DEFAULT 0,
  error text, payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.sync_logs TO authenticated;
GRANT ALL ON public.sync_logs TO service_role;
ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sync_insert_self" ON public.sync_logs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "sync_select" ON public.sync_logs FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'));

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid DEFAULT auth.uid(),
  action varchar(50) NOT NULL,
  entity_type varchar(50) NOT NULL,
  entity_id uuid,
  diff jsonb, ip varchar(45), user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_insert_self" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "audit_select_admin" ON public.audit_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));

-- ===== Templates =====
CREATE TABLE public.id_card_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE,   -- NULL = global template
  module public.template_module NOT NULL DEFAULT 'student',
  name varchar(100) NOT NULL,
  version int NOT NULL DEFAULT 1,
  layout_json jsonb,
  html text,
  css text NOT NULL DEFAULT '',
  paper_size varchar(10) NOT NULL DEFAULT 'A4',
  card_width_mm int NOT NULL DEFAULT 86,
  card_height_mm int NOT NULL DEFAULT 54,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_templates_module_school ON public.id_card_templates(module, school_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.id_card_templates TO authenticated;
GRANT ALL ON public.id_card_templates TO service_role;
ALTER TABLE public.id_card_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "templates_select" ON public.id_card_templates FOR SELECT TO authenticated
  USING (school_id IS NULL OR public.can_access_school(school_id));
CREATE POLICY "templates_admin_write" ON public.id_card_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- ===== Generated ID cards (metadata; PDFs in bucket `id-cards`) =====
CREATE TABLE public.id_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id),
  template_id uuid REFERENCES public.id_card_templates(id) ON DELETE SET NULL,
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  file_size int NOT NULL,
  mime_type varchar(50) NOT NULL DEFAULT 'application/pdf',
  qr_payload jsonb,
  generated_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_id_cards_student ON public.id_cards(student_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.id_cards TO authenticated;
GRANT ALL ON public.id_cards TO service_role;
ALTER TABLE public.id_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "id_cards_all" ON public.id_cards FOR ALL TO authenticated
  USING (public.can_access_school(school_id)) WITH CHECK (public.can_access_school(school_id));

-- ===== Bulk ID card jobs (batch PDFs) =====
CREATE TABLE public.id_card_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  requested_by uuid NOT NULL DEFAULT auth.uid(),
  template_id uuid REFERENCES public.id_card_templates(id) ON DELETE SET NULL,
  student_ids jsonb,
  class_id uuid REFERENCES public.classes(id),
  section_id uuid REFERENCES public.sections(id),
  output_format varchar(10) NOT NULL DEFAULT 'pdf',
  layout varchar(20) NOT NULL DEFAULT 'a4-sheet',
  total int NOT NULL DEFAULT 0,
  processed int NOT NULL DEFAULT 0,
  status public.id_card_job_status NOT NULL DEFAULT 'queued',
  output_key text,             -- storage path in `id-cards`
  file_size int,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.id_card_jobs TO authenticated;
GRANT ALL ON public.id_card_jobs TO service_role;
ALTER TABLE public.id_card_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "jobs_all" ON public.id_card_jobs FOR ALL TO authenticated
  USING (public.can_access_school(school_id)) WITH CHECK (public.can_access_school(school_id));

-- ===== Bulk imports =====
CREATE TABLE public.bulk_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  uploader_id uuid NOT NULL DEFAULT auth.uid(),
  source_type varchar(10) NOT NULL,
  original_filename varchar(255) NOT NULL,
  column_mapping jsonb,
  status public.bulk_import_status NOT NULL DEFAULT 'uploaded',
  stats jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bulk_imports TO authenticated;
GRANT ALL ON public.bulk_imports TO service_role;
ALTER TABLE public.bulk_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bulk_imports_all" ON public.bulk_imports FOR ALL TO authenticated
  USING (public.can_access_school(school_id)) WITH CHECK (public.can_access_school(school_id));

CREATE TABLE public.bulk_import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bulk_import_id uuid NOT NULL REFERENCES public.bulk_imports(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id),
  row_index int NOT NULL,
  raw jsonb NOT NULL,
  mapped jsonb,
  status public.bulk_import_row_status NOT NULL DEFAULT 'pending',
  errors jsonb,
  photo_storage_key text,
  student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_bulk_import_rows_import ON public.bulk_import_rows(bulk_import_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bulk_import_rows TO authenticated;
GRANT ALL ON public.bulk_import_rows TO service_role;
ALTER TABLE public.bulk_import_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bulk_rows_all" ON public.bulk_import_rows FOR ALL TO authenticated
  USING (public.can_access_school(school_id)) WITH CHECK (public.can_access_school(school_id));

-- ===== updated_at triggers =====
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['schools','profiles','classes','sections','students','photos','sync_logs','id_card_templates','id_cards','id_card_jobs','bulk_imports','bulk_import_rows'] LOOP
    EXECUTE format('CREATE TRIGGER trg_%s_updated BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()', t, t);
  END LOOP;
END $$;

-- ===== Default global template (CR80 portrait, 300 DPI) =====
INSERT INTO public.id_card_templates (school_id, module, name, layout_json)
VALUES (NULL, 'student', 'Standard Student Card', '{
  "width": 638, "height": 1012, "dpi": 300, "background": "#ffffff",
  "elements": [
    {"id":"hdr","kind":"text","text":"STUDENT ID CARD","x":0,"y":40,"width":638,"height":40,"fontSize":34,"fill":"#1F3A8A","align":"center"},
    {"id":"sch","kind":"text","binding":"school.name","label":"School Name","x":0,"y":95,"width":638,"height":36,"fontSize":30,"fill":"#0F172A","align":"center"},
    {"id":"ph","kind":"image","binding":"photo","label":"Photo","x":199,"y":160,"width":240,"height":320},
    {"id":"nm","kind":"text","binding":"student.name","label":"Name","x":0,"y":510,"width":638,"height":40,"fontSize":36,"fill":"#0F172A","align":"center"},
    {"id":"en","kind":"text","binding":"student.enrollment_no","label":"Enrollment ID","x":0,"y":565,"width":638,"height":30,"fontSize":26,"fill":"#334155","align":"center"},
    {"id":"cs","kind":"text","binding":"student.class_section","label":"Class & Section","x":0,"y":605,"width":638,"height":30,"fontSize":26,"fill":"#334155","align":"center"},
    {"id":"rl","kind":"text","binding":"student.roll_no","label":"Roll No","x":0,"y":645,"width":638,"height":30,"fontSize":26,"fill":"#334155","align":"center"},
    {"id":"bg","kind":"text","binding":"student.blood_group","label":"Blood Group","x":0,"y":685,"width":638,"height":30,"fontSize":26,"fill":"#DC2626","align":"center"},
    {"id":"qr","kind":"qr","binding":"qr","label":"QR Code","x":219,"y":740,"width":200,"height":200}
  ]
}'::jsonb);

-- ===== Storage policies (buckets `student-photos`, `id-cards`; first path segment = school id,
-- template assets live under `id-cards/templates/...`) =====
CREATE POLICY "school_files_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id IN ('student-photos','id-cards') AND (
    public.can_access_school_path((storage.foldername(name))[1])
    OR (bucket_id = 'id-cards' AND (storage.foldername(name))[1] = 'templates')
  ));
CREATE POLICY "school_files_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('student-photos','id-cards') AND public.can_access_school_path((storage.foldername(name))[1]));
CREATE POLICY "school_files_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id IN ('student-photos','id-cards') AND public.can_access_school_path((storage.foldername(name))[1]))
  WITH CHECK (bucket_id IN ('student-photos','id-cards') AND public.can_access_school_path((storage.foldername(name))[1]));
CREATE POLICY "school_files_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id IN ('student-photos','id-cards') AND public.can_access_school_path((storage.foldername(name))[1]));
