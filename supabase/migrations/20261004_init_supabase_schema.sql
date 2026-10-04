-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Schools
CREATE TABLE IF NOT EXISTS schools (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    logo_path TEXT,
    address TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    settings JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. User Profiles
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('super_admin', 'school_admin', 'teacher');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    school_id UUID REFERENCES schools(id) ON DELETE SET NULL,
    full_name TEXT NOT NULL,
    role user_role DEFAULT 'teacher',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Classes and Sections
CREATE TABLE IF NOT EXISTS classes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    display_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Students
DO $$ BEGIN
    CREATE TYPE student_status AS ENUM ('active', 'inactive', 'archived');
    CREATE TYPE student_gender AS ENUM ('male', 'female', 'other');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS students (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    class_id UUID REFERENCES classes(id) ON DELETE SET NULL,
    section_id UUID REFERENCES sections(id) ON DELETE SET NULL,
    roll_number TEXT,
    admission_number TEXT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    date_of_birth DATE,
    gender student_gender,
    blood_group TEXT,
    father_name TEXT,
    mother_name TEXT,
    guardian_phone TEXT,
    emergency_contact TEXT,
    address TEXT,
    status student_status DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Student Photos
CREATE TABLE IF NOT EXISTS photos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    photo_hash TEXT,
    file_size INT,
    mime_type TEXT DEFAULT 'image/jpeg',
    width INT,
    height INT,
    is_primary BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. ID Card Templates
CREATE TABLE IF NOT EXISTS id_card_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    width_mm NUMERIC(6,2) DEFAULT 85.60,
    height_mm NUMERIC(6,2) DEFAULT 53.98,
    orientation TEXT DEFAULT 'landscape',
    layout JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Generated ID Cards
CREATE TABLE IF NOT EXISTS id_cards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    template_id UUID NOT NULL REFERENCES id_card_templates(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_size INT,
    generated_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE id_card_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE id_cards ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION current_user_school_id()
RETURNS UUID AS $$
  SELECT school_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Policies
CREATE POLICY "School users can view students" ON students FOR SELECT
  USING (is_super_admin() OR school_id = current_user_school_id());

CREATE POLICY "School users can manage students" ON students FOR ALL
  USING (is_super_admin() OR school_id = current_user_school_id());

CREATE POLICY "School users can view photos" ON photos FOR SELECT
  USING (is_super_admin() OR school_id = current_user_school_id());

CREATE POLICY "School users can manage photos" ON photos FOR ALL
  USING (is_super_admin() OR school_id = current_user_school_id());

CREATE POLICY "School users can view id_cards" ON id_cards FOR SELECT
  USING (is_super_admin() OR school_id = current_user_school_id());

CREATE POLICY "School users can manage id_cards" ON id_cards FOR ALL
  USING (is_super_admin() OR school_id = current_user_school_id());
