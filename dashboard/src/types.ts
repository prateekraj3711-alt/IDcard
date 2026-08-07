export interface Page<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
}

export interface School {
  id: string;
  code: string;
  name: string;
  city?: string | null;
  state?: string | null;
  email?: string | null;
  is_active: boolean;
  principal_name?: string | null;
  logo_url?: string | null;
  created_at: string;
}

export interface Teacher {
  id: string;
  full_name: string;
  email: string;
  role: 'teacher';
  school?: { id: string; code: string; name: string } | null;
  is_active: boolean;
  last_login_at?: string | null;
}

export interface Student {
  id: string;
  client_uuid: string;
  school_id: string;
  class_id: string | null;
  section_id: string | null;
  enrollment_no: string;
  roll_no: string | null;
  name: string;
  father_name: string | null;
  mother_name: string | null;
  dob: string | null;
  blood_group: string | null;
  gender: 'male' | 'female' | 'other' | null;
  address: string | null;
  mobile: string | null;
  enrolled_on: string | null;
  status: 'draft' | 'submitted' | 'active' | 'archived';
  primary_photo_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface IdCardJob {
  job_id: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  download_url?: string;
  expires_at?: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: {
    id: string;
    full_name: string;
    email: string;
    role: 'super_admin' | 'school_admin' | 'teacher';
    school?: { id: string; code: string; name: string } | null;
  };
}
