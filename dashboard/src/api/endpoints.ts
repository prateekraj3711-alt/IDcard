import { api } from './client';
import type {
  LoginResponse, Page, Student, School, Teacher, TeacherCreated, PasswordResetResult,
  Admin, AdminCreated,
  IdCardJob, Template, TemplateModule, FieldCatalogEntry,
  BulkImportPreview, BulkImportCommitResult, BulkImportRow,
} from '@/types';

export const AuthApi = {
  login: (body: { school_code?: string; email?: string; phone?: string; username?: string; password: string }) =>
    api.post<LoginResponse>('/auth/login', body).then((r) => r.data),
  logout: (refresh_token: string) => api.post('/auth/logout', { refresh_token }),
  me: () => api.get('/auth/me').then((r) => r.data),
};

export const SchoolsApi = {
  list: (params: { q?: string; page?: number; page_size?: number }) =>
    api.get<Page<School>>('/schools', { params }).then((r) => r.data),
  create: (body: Partial<School>) => api.post<School>('/schools', body).then((r) => r.data),
  update: (id: string, body: Partial<School>) => api.patch<School>(`/schools/${id}`, body).then((r) => r.data),
  delete: (id: string) => api.delete(`/schools/${id}`),
};

export const AdminsApi = {
  list: () => api.get<Admin[]>('/admins').then((r) => r.data),
  create: (body: { full_name: string; email: string; phone?: string; username?: string; password?: string }) =>
    api.post<AdminCreated>('/admins', body).then((r) => r.data),
  regeneratePassword: (id: string) =>
    api.post<PasswordResetResult>(`/admins/${id}/regenerate-password`).then((r) => r.data),
  delete: (id: string) => api.delete(`/admins/${id}`),
};

export const TeachersApi = {
  list: (schoolId?: string) => {
    const params = schoolId ? { school_id: schoolId } : {};
    return api.get<Teacher[]>('/teachers', { params }).then((r) => r.data);
  },
  create: (body: {
    school_id: string; full_name: string; email: string; phone?: string;
    username?: string; password?: string;
  }) => api.post<TeacherCreated>('/teachers', body).then((r) => r.data),
  regeneratePassword: (id: string) =>
    api.post<PasswordResetResult>(`/teachers/${id}/regenerate-password`).then((r) => r.data),
  delete: (id: string) => api.delete(`/teachers/${id}`),
};

export const StudentsApi = {
  list: (params: {
    q?: string; school_id?: string; class_id?: string; section_id?: string;
    status?: string; page?: number; page_size?: number;
  }) => api.get<Page<Student>>('/students', { params }).then((r) => r.data),
  get: (id: string) => api.get<Student>(`/students/${id}`).then((r) => r.data),
  photoUrl: (id: string) => api.get<{ url: string }>(`/students/${id}/photo`).then((r) => r.data.url),
};

export const IdCardsApi = {
  preview: (studentId: string, templateId: string) =>
    api.get(`/id-cards/${studentId}/preview`, { params: { template_id: templateId }, responseType: 'blob' })
      .then((r) => URL.createObjectURL(r.data)),
};

export const TemplatesApi = {
  list: (params: { module?: TemplateModule; school_id?: string }) =>
    api.get<Template[]>('/templates', { params }).then((r) => r.data),
  get: (id: string) => api.get<Template>(`/templates/${id}`).then((r) => r.data),
  create: (body: Partial<Template>) => api.post<Template>('/templates', body).then((r) => r.data),
  update: (id: string, body: Partial<Template>) => api.patch<Template>(`/templates/${id}`, body).then((r) => r.data),
  fieldCatalog: (module: TemplateModule) =>
    api.get<{ module: TemplateModule; fields: FieldCatalogEntry[] }>('/templates/fields/catalog', { params: { module } }).then((r) => r.data),
  import: (opts: { file: File; name: string; module: TemplateModule; school_id?: string }) => {
    const fd = new FormData();
    fd.append('file', opts.file);
    fd.append('name', opts.name);
    fd.append('module', opts.module);
    if (opts.school_id) fd.append('school_id', opts.school_id);
    return api.post<{ template: Template; source: 'json' | 'image' }>('/templates/import', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data);
  },
  exportUrl: (id: string) => `/api/v1/templates/${id}/export`,
};

export const IdCardJobsApi = {
  create: (body: {
    template_id: string; school_id: string;
    student_ids?: string[]; class_id?: string; section_id?: string;
    output_format?: 'pdf' | 'png' | 'zip';
    layout?: 'single' | 'a4-sheet';
  }) => api.post<IdCardJob>('/id-card-jobs', body).then((r) => r.data),
  get: (id: string) => api.get<IdCardJob>(`/id-card-jobs/${id}`).then((r) => r.data),
};

export const BulkImportsApi = {
  uploadSpreadsheet: (schoolId: string, file: File) => {
    const fd = new FormData();
    fd.append('school_id', schoolId);
    fd.append('file', file);
    return api.post<BulkImportPreview>('/bulk-imports', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data);
  },
  attachPhotos: (importId: string, zipFile: File) => {
    const fd = new FormData();
    fd.append('file', zipFile);
    return api.post<{ photos_uploaded: number; photos_matched: number }>(`/bulk-imports/${importId}/photos`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data);
  },
  presignLocalPhotos: (importId: string, items: Array<{ enrollment_no: string; content_type?: string }>) =>
    api.post<Array<{
      enrollment_no: string;
      put_url: string;
      storage_key: string;
      required_headers: Record<string, string>;
    }>>(`/bulk-imports/${importId}/photos/presign`, items).then((r) => r.data),
  recordLocalPhotos: (importId: string, items: Array<{ enrollment_no: string; storage_key: string }>) =>
    api.post<{ photos_uploaded: number; photos_matched: number }>(
      `/bulk-imports/${importId}/photos/record`, items,
    ).then((r) => r.data),
  commit: (importId: string, body: {
    column_mapping?: Record<string, string>;
    default_class_id?: string;
    default_section_id?: string;
  }) => api.post<BulkImportCommitResult>(`/bulk-imports/${importId}/commit`, body).then((r) => r.data),
  rows: (importId: string, params: { status_filter?: string; limit?: number; offset?: number }) =>
    api.get<BulkImportRow[]>(`/bulk-imports/${importId}/rows`, { params }).then((r) => r.data),
};
