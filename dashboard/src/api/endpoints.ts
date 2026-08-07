import { api } from './client';
import type {
  LoginResponse, Page, Student, School, Teacher, TeacherCreated, PasswordResetResult, IdCardJob,
} from '@/types';

export const AuthApi = {
  login: (body: { school_code?: string; email?: string; username?: string; password: string }) =>
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

export const TeachersApi = {
  list: (schoolId: string) => api.get<Teacher[]>('/teachers', { params: { school_id: schoolId } }).then((r) => r.data),
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
  generate: (body: {
    student_ids?: string[]; class_id?: string; school_id?: string;
    template_id: string; format?: 'pdf' | 'png'; layout?: 'single' | 'a4-sheet';
  }) => api.post<IdCardJob>('/id-cards/generate', body).then((r) => r.data),
  preview: (studentId: string, templateId: string) =>
    api.get(`/id-cards/${studentId}/preview`, { params: { template_id: templateId }, responseType: 'blob' })
      .then((r) => URL.createObjectURL(r.data)),
};
