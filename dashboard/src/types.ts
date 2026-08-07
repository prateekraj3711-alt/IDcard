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

export interface GeneratedCredentials {
  username: string;
  password: string;
}

export interface TeacherCreated extends Teacher {
  credentials: GeneratedCredentials;
}

export interface PasswordResetResult {
  user_id: string;
  credentials: GeneratedCredentials;
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
  id: string;
  school_id: string;
  template_id: string;
  output_format: 'pdf' | 'png' | 'zip';
  layout: 'single' | 'a4-sheet';
  status: 'queued' | 'running' | 'done' | 'failed';
  total: number;
  processed: number;
  output_key: string | null;
  download_url?: string | null;
  error?: string | null;
  created_at: string;
  updated_at: string;
}

export type TemplateModule = 'student' | 'employee';

export interface Template {
  id: string;
  school_id: string | null;
  module: TemplateModule;
  name: string;
  version: number;
  layout_json: TemplateLayout | null;
  html: string | null;
  css: string;
  paper_size: string;
  card_width_mm: number;
  card_height_mm: number;
  is_active: boolean;
  created_at: string;
}

export interface TemplateBackgroundImage {
  storage_key: string;
  url?: string;              // signed URL populated by the server on read
  locked?: boolean;
}

export interface TemplateLayout {
  width: number;
  height: number;
  dpi?: number;               // native DPI; renderer preserves this end-to-end
  background: string;
  background_image?: TemplateBackgroundImage;
  elements: TemplateElement[];
}

export type ElementKind = 'text' | 'image' | 'qr' | 'barcode';

export interface TemplateElement {
  id: string;
  kind: ElementKind;
  binding?: string;         // e.g. "student.name" | "photo" | "qr"
  label?: string;           // static label rendered in the editor palette
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize?: number;
  fontFamily?: string;
  fill?: string;
  align?: 'left' | 'center' | 'right';
  text?: string;            // static text (for header, "STUDENT ID CARD", etc.)
  src?: string;             // static image data-uri / URL
  storage_key?: string;     // S3 key for uploaded imagery (resolved to `url`)
  url?: string;             // signed URL from server (read-only)
  rotation?: number;
  locked?: boolean;         // if true, cannot be dragged/transformed in the editor
}

export interface FieldCatalogEntry {
  field: string;
  label: string;
  kind: ElementKind;
}

export interface BulkImportRow {
  id: string;
  row_index: number;
  raw: Record<string, unknown>;
  mapped: Record<string, unknown> | null;
  status: 'pending' | 'valid' | 'invalid' | 'imported' | 'failed';
  errors: Array<{ field?: string; code?: string; message?: string }> | null;
  photo_storage_key: string | null;
}

export interface BulkImportPreview {
  import_id: string;
  columns_detected: string[];
  suggested_mapping: Record<string, string>;
  total_rows: number;
  sample: BulkImportRow[];
}

export interface BulkImportCommitResult {
  imported: number;
  failed: number;
  photos_matched: number;
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
    role: 'super_admin' | 'teacher';
    school?: { id: string; code: string; name: string } | null;
  };
}
