/**
 * Data layer — previously an axios client against the FastAPI backend.
 * Now talks to Lovable Cloud directly (Postgres via RLS, Storage, Auth) and to
 * server functions for privileged account management. Method signatures are
 * kept so the existing pages work unchanged.
 */
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { detectTemplateFields } from '@/lib/templateDetect.functions';
import { supabase } from '@/integrations/supabase/client';
import {
  createAccount, deleteAccount, listAccounts, regenerateAccountPassword,
} from '@/lib/accounts.functions';
import type { TemplateElement,
  Page, Student, School, Teacher, TeacherCreated, PasswordResetResult,
  Admin, AdminCreated, IdCardJob, Template, TemplateModule, FieldCatalogEntry,
  BulkImportPreview, BulkImportCommitResult, BulkImportRow, TemplateLayout, IdCard, SchoolClass,
} from '@/app/types';
import {
  CARD_BUCKET, PHOTO_BUCKET, UserFacingError, processPhoto, signedUrl, signedUrls,
  storageDataUrl, uploadStudentPhoto,
  toDecodable,
} from '@/app/media';
import { renderBundlePdf, renderCardPng, type RenderSubject } from '@/app/localRender';

function must<R extends { data: unknown; error: unknown }>(res: R): NonNullable<R['data']> {
  if (res.error) throw res.error;
  return res.data as NonNullable<R['data']>;
}

function range(page = 1, pageSize = 25) {
  const from = (page - 1) * pageSize;
  return [from, from + pageSize - 1] as const;
}

const esc = (q: string) => q.replace(/[%,()]/g, ' ').trim();

// ---------------------------------------------------------------- Auth
export const AuthApi = {
  logout: () => supabase.auth.signOut(),
};

// ---------------------------------------------------------------- Schools
export const SchoolsApi = {
  list: async (params: { q?: string; page?: number; page_size?: number }): Promise<Page<School>> => {
    const page = params.page ?? 1, size = params.page_size ?? 25;
    let qb = supabase.from('schools').select('*', { count: 'exact' }).is('deleted_at', null).order('name');
    if (params.q) qb = qb.or(`name.ilike.%${esc(params.q)}%,code.ilike.%${esc(params.q)}%,city.ilike.%${esc(params.q)}%`);
    const [from, to] = range(page, size);
    const res = await qb.range(from, to);
    if (res.error) throw res.error;
    return { items: (res.data ?? []) as School[], page, page_size: size, total: res.count ?? 0 };
  },
  create: async (body: Partial<School>) => {
    const row = { ...body, code: String(body.code ?? '').trim().toUpperCase(), name: String(body.name ?? '').trim() };
    if (!row.code || !row.name) throw new UserFacingError('School code and name are required.');
    return must(await supabase.from('schools').insert(row as never).select().single()) as School;
  },
  update: async (id: string, body: Partial<School>) => {
    const { id: _i, created_at: _c, ...rest } = body;
    return must(await supabase.from('schools').update(rest as never).eq('id', id).select().single()) as School;
  },
  delete: async (id: string) => {
    must(await supabase.from('schools').update({ deleted_at: new Date().toISOString(), is_active: false }).eq('id', id));
  },
};

// ---------------------------------------------------------------- Classes / sections
export const ClassesApi = {
  list: async (schoolId: string): Promise<SchoolClass[]> => {
    const res = await supabase.from('classes').select('id, name, ordering, sections(id, name, ordering)')
      .eq('school_id', schoolId).order('ordering').order('name');
    return (must(res) ?? []) as unknown as SchoolClass[];
  },
  /** Find or create a class (and optional section) by name. */
  ensure: async (schoolId: string, className?: string | null, sectionName?: string | null) => {
    const cn = (className ?? '').trim();
    if (!cn) return { class_id: null as string | null, section_id: null as string | null };
    let cls = (await supabase.from('classes').select('id').eq('school_id', schoolId).eq('name', cn).maybeSingle()).data;
    if (!cls) {
      const ins = await supabase.from('classes').insert({ school_id: schoolId, name: cn }).select('id').single();
      cls = ins.data ?? (await supabase.from('classes').select('id').eq('school_id', schoolId).eq('name', cn).single()).data;
    }
    if (!cls) throw new UserFacingError(`Could not create class "${cn}".`);
    const sn = (sectionName ?? '').trim();
    if (!sn) return { class_id: cls.id, section_id: null };
    let sec = (await supabase.from('sections').select('id').eq('class_id', cls.id).eq('name', sn).maybeSingle()).data;
    if (!sec) {
      const ins = await supabase.from('sections').insert({ class_id: cls.id, school_id: schoolId, name: sn }).select('id').single();
      sec = ins.data ?? (await supabase.from('sections').select('id').eq('class_id', cls.id).eq('name', sn).single()).data;
    }
    return { class_id: cls.id, section_id: sec?.id ?? null };
  },
};

// ---------------------------------------------------------------- Accounts (server functions, service role server-side only)
export const AdminsApi = {
  list: async () => (await listAccounts({ data: { role: 'super_admin' } })) as Admin[],
  create: async (body: { full_name: string; email: string; phone?: string; username?: string; password?: string }) =>
    (await createAccount({ data: { ...body, role: 'super_admin' } })) as AdminCreated,
  regeneratePassword: async (id: string) =>
    (await regenerateAccountPassword({ data: { user_id: id } })) as PasswordResetResult,
  delete: async (id: string) => { await deleteAccount({ data: { user_id: id } }); },
};

export const TeachersApi = {
  list: async (schoolId?: string) =>
    (await listAccounts({ data: { role: 'teacher', school_id: schoolId } })) as Teacher[],
  create: async (body: {
    school_id?: string; full_name: string; email: string; phone?: string; username?: string; password?: string;
  }) => (await createAccount({ data: { ...body, role: 'teacher' } })) as TeacherCreated,
  regeneratePassword: async (id: string) =>
    (await regenerateAccountPassword({ data: { user_id: id } })) as PasswordResetResult,
  delete: async (id: string) => { await deleteAccount({ data: { user_id: id } }); },
};

// ---------------------------------------------------------------- Students
const STUDENT_COLS = '*, classes(name), sections(name), schools(name, code)';

type StudentRow = Student & { classes?: { name: string } | null; sections?: { name: string } | null; schools?: { name: string; code: string } | null };

function shapeStudent(r: StudentRow, urls: Record<string, string> = {}): Student {
  const { classes, sections, schools, ...s } = r;
  return {
    ...s,
    class_name: classes?.name ?? null,
    section_name: sections?.name ?? null,
    school_name: schools?.name ?? null,
    primary_photo_url: s.photo_path ? urls[s.photo_path] ?? null : null,
  };
}

export type StudentInput = Partial<Pick<Student,
  'enrollment_no' | 'roll_no' | 'name' | 'father_name' | 'mother_name' | 'dob' | 'blood_group' |
  'gender' | 'address' | 'mobile' | 'enrolled_on' | 'status' | 'class_id' | 'section_id' | 'school_id' | 'extra'>>;

function cleanStudent(body: StudentInput) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) out[k] = typeof v === 'string' ? (v.trim() === '' ? null : v.trim()) : v;
  if (typeof out.enrollment_no === 'string') out.enrollment_no = out.enrollment_no.toUpperCase();
  return out;
}

export const StudentsApi = {
  list: async (params: {
    q?: string; school_id?: string; class_id?: string; section_id?: string;
    status?: string; page?: number; page_size?: number; with_photos?: boolean; ids?: string[];
  }): Promise<Page<Student>> => {
    const page = params.page ?? 1, size = params.page_size ?? 25;
    let qb = supabase.from('students').select(STUDENT_COLS, { count: 'exact' }).is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (params.school_id) qb = qb.eq('school_id', params.school_id);
    if (params.ids?.length) qb = qb.in('id', params.ids);
    if (params.class_id) qb = qb.eq('class_id', params.class_id);
    if (params.section_id) qb = qb.eq('section_id', params.section_id);
    if (params.status) qb = qb.eq('status', params.status as Student['status']);
    if (params.q) {
      const q = esc(params.q);
      qb = qb.or(`name.ilike.%${q}%,enrollment_no.ilike.%${q}%,mobile.ilike.%${q}%,roll_no.ilike.%${q}%,father_name.ilike.%${q}%`);
    }
    const [from, to] = range(page, size);
    const res = await qb.range(from, to);
    if (res.error) throw res.error;
    const rows = (res.data ?? []) as unknown as StudentRow[];
    const urls = params.with_photos === false ? {} : await signedUrls(PHOTO_BUCKET, rows.map((r) => r.photo_path ?? ''));
    return { items: rows.map((r) => shapeStudent(r, urls)), page, page_size: size, total: res.count ?? 0 };
  },
  get: async (id: string): Promise<Student> => {
    const row = must(await supabase.from('students').select(STUDENT_COLS).eq('id', id).is('deleted_at', null).maybeSingle()) as unknown as StudentRow | null;
    if (!row) throw new UserFacingError('Candidate not found, or you do not have access to it.');
    const url = await signedUrl(PHOTO_BUCKET, row.photo_path);
    return shapeStudent(row, row.photo_path && url ? { [row.photo_path]: url } : {});
  },
  create: async (body: StudentInput) => {
    const row = cleanStudent(body);
    if (!row.school_id) throw new UserFacingError('Choose an organization.');
    if (!row.name) throw new UserFacingError('Name is required.');
    if (!row.enrollment_no) throw new UserFacingError('ID / enrollment number is required.');
    const { data: u } = await supabase.auth.getUser();
    const res = await supabase.from('students').insert({ ...row, created_by: u.user?.id } as never).select('id').single();
    if (res.error?.code === '23505') throw new UserFacingError('A candidate with this ID number already exists in this organization.');
    return must(res) as { id: string };
  },
  update: async (id: string, body: StudentInput) => {
    const res = await supabase.from('students').update(cleanStudent(body) as never).eq('id', id).select('id').single();
    if (res.error?.code === '23505') throw new UserFacingError('A candidate with this ID number already exists in this organization.');
    return must(res);
  },
  delete: async (id: string) => {
    must(await supabase.from('students').update({ deleted_at: new Date().toISOString(), status: 'archived' }).eq('id', id));
  },
  photoUrl: async (id: string) => (await StudentsApi.get(id)).primary_photo_url ?? null,
  uploadPhoto: async (
    student: { id: string; school_id: string }, file: File,
    onStage?: (s: 'processing' | 'checking' | 'uploading' | 'saving') => void,
  ) => {
    onStage?.('processing');
    const processed = await processPhoto(file);
    return uploadStudentPhoto(student, processed, onStage);
  },
  photos: async (id: string) =>
    must(await supabase.from('photos').select('*').eq('student_id', id).order('uploaded_at', { ascending: false })),
};

// ---------------------------------------------------------------- Templates
export const TEMPLATE_FIELD_CATALOG: Record<TemplateModule, FieldCatalogEntry[]> = {
  student: [
    { field: 'student.name', label: 'Name', kind: 'text' },
    { field: 'student.enrollment_no', label: 'Enrollment ID', kind: 'text' },
    { field: 'student.class_section', label: 'Class & Section', kind: 'text' },
    { field: 'student.class', label: 'Class', kind: 'text' },
    { field: 'student.section', label: 'Section', kind: 'text' },
    { field: 'student.roll_no', label: 'Roll No', kind: 'text' },
    { field: 'student.dob', label: 'DOB', kind: 'text' },
    { field: 'student.blood_group', label: 'Blood Group', kind: 'text' },
    { field: 'student.father_name', label: "Father's Name", kind: 'text' },
    { field: 'student.mother_name', label: "Mother's Name", kind: 'text' },
    { field: 'student.address', label: 'Address', kind: 'text' },
    { field: 'student.mobile', label: 'Mobile', kind: 'text' },
    { field: 'student.age', label: 'Age', kind: 'text' },
    { field: 'student.gender', label: 'Gender', kind: 'text' },
    { field: 'extra.valid_till', label: 'Valid Till', kind: 'text' },
    { field: 'photo', label: 'Photo', kind: 'image' },
    { field: 'qr', label: 'QR Code', kind: 'qr' },
    { field: 'barcode', label: 'Barcode', kind: 'barcode' },
    { field: 'school.logo', label: 'Organization Logo', kind: 'image' },
    { field: 'school.name', label: 'Organization Name', kind: 'text' },
    { field: 'principal.signature', label: 'Signature', kind: 'image' },
  ],
  employee: [
    { field: 'employee.name', label: 'Name', kind: 'text' },
    { field: 'employee.employee_id', label: 'Employee ID', kind: 'text' },
    { field: 'employee.designation', label: 'Designation', kind: 'text' },
    { field: 'employee.department', label: 'Department', kind: 'text' },
    { field: 'employee.doj', label: 'Date of Joining', kind: 'text' },
    { field: 'employee.blood_group', label: 'Blood Group', kind: 'text' },
    { field: 'employee.address', label: 'Address', kind: 'text' },
    { field: 'employee.mobile', label: 'Mobile', kind: 'text' },
    { field: 'employee.dob', label: 'DOB', kind: 'text' },
    { field: 'employee.age', label: 'Age', kind: 'text' },
    { field: 'employee.gender', label: 'Gender', kind: 'text' },
    { field: 'employee.email', label: 'Email', kind: 'text' },
    { field: 'extra.emergency_contact', label: 'Emergency Contact', kind: 'text' },
    { field: 'extra.valid_till', label: 'Valid Till', kind: 'text' },
    { field: 'photo', label: 'Photo', kind: 'image' },
    { field: 'qr', label: 'QR Code', kind: 'qr' },
    { field: 'barcode', label: 'Barcode', kind: 'barcode' },
    { field: 'org.logo', label: 'Organization Logo', kind: 'image' },
    { field: 'org.name', label: 'Organization Name', kind: 'text' },
    { field: 'authority.signature', label: 'Authorised Signatory', kind: 'image' },
  ],
};

/** Populate signed `url`s for background/element imagery stored in `id-cards/templates/...`. */
async function hydrateLayout(layout: TemplateLayout | null): Promise<TemplateLayout | null> {
  if (!layout) return layout;
  const keys = [layout.background_image?.storage_key ?? '', ...(layout.elements ?? []).map((e) => e.storage_key ?? '')];
  const urls = await signedUrls(CARD_BUCKET, keys);
  return {
    ...layout,
    background_image: layout.background_image
      ? { ...layout.background_image, url: urls[layout.background_image.storage_key] } : undefined,
    elements: (layout.elements ?? []).map((e) => (e.storage_key ? { ...e, url: urls[e.storage_key] } : e)),
  };
}

function stripLayout(layout: TemplateLayout | null | undefined): TemplateLayout | null {
  if (!layout) return null;
  return {
    ...layout,
    background_image: layout.background_image
      ? { storage_key: layout.background_image.storage_key, locked: layout.background_image.locked ?? true } : undefined,
    elements: (layout.elements ?? []).map(({ url: _u, ...e }) => e),
  };
}

async function uploadTemplateAsset(file: Blob, ext: string) {
  const key = `templates/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(CARD_BUCKET).upload(key, file, { contentType: file.type || 'image/png' });
  if (error) throw error;
  return key;
}

/** Downscale an image to a JPEG data URL for AI layout detection. */
async function toDetectDataUrl(file: Blob, max = 1400): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url;
    });
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.9);
  } finally { URL.revokeObjectURL(url); }
}

/** Find printed labels on a card image and place matching data fields + the photo next to them. */
export async function autoPlaceFields(file: Blob, dims: { w: number; h: number }): Promise<TemplateElement[]> {
  const r = await detectTemplateFields({ data: { image: await toDetectDataUrl(file) } });
  const px = (b: number[]) => {
    const [x0, y0, x1, y1] = b.map((v) => Math.max(0, Math.min(1000, v)));
    return { x: Math.round(Math.min(x0, x1) / 1000 * dims.w), y: Math.round(Math.min(y0, y1) / 1000 * dims.h),
      width: Math.max(10, Math.round(Math.abs(x1 - x0) / 1000 * dims.w)), height: Math.max(10, Math.round(Math.abs(y1 - y0) / 1000 * dims.h)) };
  };
  const els: TemplateElement[] = [];
  if (r.photo_box && r.photo_box.length === 4) {
    els.push({ id: `photo-${crypto.randomUUID().slice(0, 8)}`, kind: 'image', binding: 'photo', label: 'Photo', ...px(r.photo_box) });
  }
  if (r.signature_box && r.signature_box.length === 4) {
    els.push({ id: `sign-${crypto.randomUUID().slice(0, 8)}`, kind: 'image', binding: 'principal.signature', label: 'Authorised Signature', fit: 'contain', ...px(r.signature_box) } as TemplateElement);
  }
  const stack: Record<string, string> = {
    Arial: 'Arial, Helvetica, "Liberation Sans", sans-serif',
    'Arial Narrow': '"Arial Narrow", "Roboto Condensed", "Liberation Sans Narrow", sans-serif',
    Verdana: 'Verdana, Geneva, sans-serif', Tahoma: 'Tahoma, Verdana, sans-serif',
    'Times New Roman': '"Times New Roman", Times, "Liberation Serif", serif',
    Georgia: 'Georgia, serif', 'Courier New': '"Courier New", Courier, monospace', Impact: 'Impact, "Arial Black", sans-serif',
  };
  // Font size that reproduces the label's glyph height (mixed-case text ≈ 0.92 em tall).
  const sizeOf = (f: (typeof r.fields)[number]) => f.label_box && f.label_box.length === 4 ? px(f.label_box).height / 0.92 : 0;
  const labelSizes = r.fields.map(sizeOf).filter((v) => v > 0);
  const typical = labelSizes.length ? labelSizes.sort((a, b) => a - b)[Math.floor(labelSizes.length / 2)] : 0;
  for (const f of r.fields) {
    if (f.value_box.length !== 4) continue;
    const b = px(f.value_box);
    const isName = f.binding === 'student.name';
    const isAddr = f.binding === 'student.address';
    // Use the median label size so all rows match even if one box was measured loosely.
    let size = typical || (isAddr ? b.height / 2 : b.height) * 0.8;
    if (isName) size = Math.max(size * 1.1, sizeOf(f));
    const color = /^#[0-9a-f]{3,8}$/i.test(f.color ?? '') ? f.color! : '#111111';
    els.push({
      id: `${f.binding.replace(/\W+/g, '-')}-${crypto.randomUUID().slice(0, 6)}`, kind: 'text', binding: f.binding,
      label: f.binding.split('.').pop()!.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()), ...b,
      height: Math.max(b.height, Math.round(size * 1.15)),
      fontSize: Math.max(8, Math.round(size)), fill: color,
      fontFamily: stack[f.font_family ?? ''] ?? stack.Arial,
      align: isName ? 'center' : 'left', fontWeight: f.bold || isName ? 'bold' : 'normal',
      wrap: true, pinned: true, lineHeight: 1.1, maxLines: isAddr ? 3 : 2,
    });
  }
  return els;
}

export const TemplatesApi = {
  list: async (params: { module?: TemplateModule; school_id?: string }) => {
    let qb = supabase.from('id_card_templates').select('*').eq('is_active', true).order('created_at', { ascending: false });
    if (params.module) qb = qb.eq('module', params.module);
    if (params.school_id) qb = qb.or(`school_id.eq.${params.school_id},school_id.is.null`);
    return (must(await qb) ?? []) as unknown as Template[];
  },
  get: async (id: string) => {
    const t = must(await supabase.from('id_card_templates').select('*').eq('id', id).single()) as unknown as Template;
    return { ...t, layout_json: await hydrateLayout(t.layout_json) };
  },
  create: async (body: Partial<Template>) => {
    const { data: u } = await supabase.auth.getUser();
    const row = { ...body, layout_json: stripLayout(body.layout_json), created_by: u.user?.id };
    return must(await supabase.from('id_card_templates').insert(row as never).select().single()) as unknown as Template;
  },
  update: async (id: string, body: Partial<Template>) => {
    const cur = must(await supabase.from('id_card_templates').select('version').eq('id', id).single());
    const row: Record<string, unknown> = { ...body, version: (cur?.version ?? 1) + 1 };
    if ('layout_json' in body) row.layout_json = stripLayout(body.layout_json);
    delete row.id; delete row.created_at;
    return must(await supabase.from('id_card_templates').update(row as never).eq('id', id).select().single()) as unknown as Template;
  },
  delete: async (id: string) => {
    must(await supabase.from('id_card_templates').update({ is_active: false }).eq('id', id));
  },
  fieldCatalog: async (module: TemplateModule) => ({ module, fields: TEMPLATE_FIELD_CATALOG[module] }),
  uploadAsset: async (file: File) => uploadTemplateAsset(file, (file.name.split('.').pop() || 'png').toLowerCase()),
  /** Import a JSON export, or a PNG/JPG that becomes a locked background layer. */
  import: async (opts: { file: File; name: string; module: TemplateModule; school_id?: string }) => {
    const lower = opts.file.name.toLowerCase();
    if (lower.endsWith('.json')) {
      let parsed: Partial<Template>;
      try { parsed = JSON.parse(await opts.file.text()); } catch { throw new UserFacingError('That JSON file could not be read.'); }
      if (!parsed || typeof parsed !== 'object') throw new UserFacingError('That JSON file is not a template export.');
      // Accept a bare layout object too.
      if (!parsed.layout_json && (parsed as unknown as TemplateLayout).elements) parsed = { layout_json: parsed as unknown as TemplateLayout };
      const lj = parsed.layout_json;
      if (lj && (!Number(lj.width) || !Number(lj.height))) throw new UserFacingError('The template layout is missing its width/height.');
      const mm = (v: unknown, d: number) => { const n = Math.round(Number(v)); return n > 0 && n < 1000 ? n : d; };
      const template = await TemplatesApi.create({
        name: opts.name || parsed.name || 'Imported template', module: opts.module,
        school_id: opts.school_id ?? null, layout_json: parsed.layout_json ?? null,
        html: typeof parsed.html === 'string' ? parsed.html : null, css: typeof parsed.css === 'string' ? parsed.css : '',
        card_width_mm: mm(parsed.card_width_mm, 86), card_height_mm: mm(parsed.card_height_mm, 54),
      });
      return { template, source: 'json' as const };
    }
    if (!opts.file.type.startsWith('image/') && !/\.(png|jpe?g|webp|gif|bmp|avif|heic|heif)$/.test(lower))
      throw new UserFacingError('Import a .json export or a card image (PNG, JPG, WEBP, HEIC…).');
    opts = { ...opts, file: new File([await toDecodable(opts.file)], opts.file.name.replace(/\.(heic|heif)$/i, '.jpg'), { type: /\.(heic|heif)$/i.test(lower) ? 'image/jpeg' : opts.file.type }) };
    const dims = await new Promise<{ w: number; h: number }>((res, rej) => {
      const url = URL.createObjectURL(opts.file); const img = new Image();
      img.onload = () => { res({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(url); };
      img.onerror = () => rej(new UserFacingError('That image could not be read.')); img.src = url;
    });
    // Normalise any image format to PNG so every browser can draw it later.
    const png = /\.png$/.test(lower) ? opts.file : await new Promise<Blob>((res, rej) => {
      const url = URL.createObjectURL(opts.file); const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext('2d')!.drawImage(img, 0, 0); URL.revokeObjectURL(url);
        c.toBlob((b) => (b ? res(b) : rej(new UserFacingError('That image could not be converted.'))), 'image/png');
      };
      img.onerror = () => rej(new UserFacingError('This browser cannot open that image format.')); img.src = url;
    });
    const key = await uploadTemplateAsset(png, 'png');
    const template = await TemplatesApi.create({
      name: opts.name, module: opts.module, school_id: opts.school_id ?? null,
      layout_json: { width: dims.w, height: dims.h, dpi: 500, background: '#ffffff',
        background_image: { storage_key: key, locked: true },
        elements: await autoPlaceFields(opts.file, dims).catch((e) => { console.warn('auto-place failed', e); return []; }) },
    });
    return { template, source: 'image' as const };
  },
  exportJson: async (id: string) => {
    const t = must(await supabase.from('id_card_templates').select('*').eq('id', id).single()) as unknown as Template;
    return {
      name: t.name, module: t.module, paper_size: t.paper_size, card_width_mm: t.card_width_mm,
      card_height_mm: t.card_height_mm, html: t.html, css: t.css, layout_json: t.layout_json,
    };
  },
};

// ---------------------------------------------------------------- ID card rendering
export function studentBindings(s: Student): Record<string, string | undefined> {
  const classSection = [s.class_name, s.section_name].filter(Boolean).join(' - ');
  const b: Record<string, string | undefined> = {
    'student.name': s.name,
    'student.enrollment_no': s.enrollment_no,
    'student.class_section': classSection || undefined,
    'student.class': s.class_name ?? undefined,
    'student.section': s.section_name ?? undefined,
    'student.roll_no': s.roll_no ?? undefined,
    'student.father_name': s.father_name ?? undefined,
    'student.mother_name': s.mother_name ?? undefined,
    'student.dob': s.dob ?? undefined,
    'student.blood_group': s.blood_group ?? undefined,
    'student.gender': s.gender ?? undefined,
    'student.address': s.address ?? undefined,
    'student.mobile': s.mobile ?? undefined,
    'student.enrolled_on': s.enrolled_on ?? undefined,
    'school.name': s.school_name ?? undefined,
    name: s.name, enrollment_no: s.enrollment_no, roll_no: s.roll_no ?? undefined,
    father_name: s.father_name ?? undefined, mother_name: s.mother_name ?? undefined,
    dob: s.dob ?? undefined, blood_group: s.blood_group ?? undefined,
    address: s.address ?? undefined, mobile: s.mobile ?? undefined,
  };
  const extra = (s.extra ?? {}) as Record<string, string>;
  for (const [k, v] of Object.entries(extra)) {
    if (v == null || v === '') continue;
    b[`extra.${k}`] = String(v);
    b[`student.${k}`] ??= String(v);
    b[`employee.${k}`] ??= String(v);
    b[k] ??= String(v);
  }
  const age = extra.age || ageFrom(s.dob);
  Object.assign(b, {
    'student.age': age, 'employee.age': age, age,
    'student.gender': b['student.gender'], gender: s.gender ?? undefined,
    'employee.name': s.name, 'employee.employee_id': s.enrollment_no, 'employee.dob': s.dob ?? undefined,
    'employee.blood_group': s.blood_group ?? undefined, 'employee.address': s.address ?? undefined,
    'employee.mobile': s.mobile ?? undefined, 'employee.gender': s.gender ?? undefined,
    'employee.designation': extra.designation, 'employee.department': extra.department,
    'employee.doj': extra.doj || s.enrolled_on || undefined, 'employee.email': extra.email,
    'org.name': s.school_name ?? undefined,
  });
  return b;
}

function ageFrom(dob: string | null | undefined): string | undefined {
  if (!dob) return undefined;
  const d = new Date(dob); if (isNaN(+d)) return undefined;
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) a--;
  return a >= 0 ? String(a) : undefined;
}

/** Embed all template imagery as data: URLs so the canvas never gets CORS-tainted. */
async function layoutForRender(layout: TemplateLayout): Promise<TemplateLayout> {
  const bg = layout.background_image?.storage_key
    ? await storageDataUrl(CARD_BUCKET, layout.background_image.storage_key) : undefined;
  const elements = await Promise.all((layout.elements ?? []).map(async (e) =>
    e.storage_key ? { ...e, url: await storageDataUrl(CARD_BUCKET, e.storage_key) } : e));
  return { ...layout, background_image: layout.background_image ? { ...layout.background_image, url: bg } : undefined, elements };
}

const brandingCache = new Map<string, Promise<{ signature?: string; logo?: string }>>();
function brandingFor(schoolId: string) {
  if (!brandingCache.has(schoolId)) brandingCache.set(schoolId, (async () => {
    const { data } = await supabase.from('schools').select('signature_path, logo_path').eq('id', schoolId).maybeSingle();
    const r = data as { signature_path?: string | null; logo_path?: string | null } | null;
    return { signature: await storageDataUrl(CARD_BUCKET, r?.signature_path), logo: await storageDataUrl(CARD_BUCKET, r?.logo_path) };
  })());
  const p = brandingCache.get(schoolId)!;
  setTimeout(() => brandingCache.delete(schoolId), 60_000);
  return p;
}

/** Upload an organization's authorised signature or logo to `id-cards/{school_id}/branding/`. */
export async function uploadSchoolBranding(schoolId: string, kind: 'signature' | 'logo', file: File) {
  const src = await toDecodable(file);
  const png = await new Promise<Blob>((res, rej) => {
    const url = URL.createObjectURL(src); const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext('2d')!.drawImage(img, 0, 0); URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? res(b) : rej(new UserFacingError('That image could not be converted.'))), 'image/png');
    };
    img.onerror = () => rej(new UserFacingError('This browser cannot open that image format.')); img.src = url;
  });
  const path = `${schoolId}/branding/${kind}-${crypto.randomUUID().slice(0, 8)}.png`;
  const { error } = await supabase.storage.from(CARD_BUCKET).upload(path, png, { contentType: 'image/png', upsert: true });
  if (error) throw error;
  must(await supabase.from('schools').update({ [`${kind}_path`]: path } as never).eq('id', schoolId));
  brandingCache.delete(schoolId);
  return path;
}

async function subjectFor(s: Student): Promise<RenderSubject> {
  const b = s.school_id ? await brandingFor(s.school_id) : {};
  return {
    signatureDataUrl: b.signature, logoDataUrl: b.logo,
    bindings: studentBindings(s),
    photoDataUrl: await storageDataUrl(PHOTO_BUCKET, s.photo_path),
    qrPayload: { student_id: s.id, enrollment_no: s.enrollment_no, school_id: s.school_id },
  };
}

async function loadTemplateLayout(templateId: string): Promise<TemplateLayout> {
  const t = must(await supabase.from('id_card_templates').select('layout_json').eq('id', templateId).single());
  const layout = t?.layout_json as unknown as TemplateLayout | null;
  if (!layout || !layout.width || !layout.height) throw new UserFacingError('This template has no card layout yet. Open it in the editor and save a design.');
  return layoutForRender(layout);
}

export type CardStage = 'preparing' | 'rendering' | 'uploading' | 'saving';

export const IdCardsApi = {
  listForStudent: async (studentId: string): Promise<IdCard[]> =>
    (must(await supabase.from('id_cards').select('*, id_card_templates(name)').eq('student_id', studentId)
      .order('created_at', { ascending: false })) ?? []) as unknown as IdCard[],
  listRecent: async (limit = 50): Promise<IdCard[]> =>
    (must(await supabase.from('id_cards').select('*, id_card_templates(name), students(name, enrollment_no)')
      .order('created_at', { ascending: false }).limit(limit)) ?? []) as unknown as IdCard[],
  /** Render → PDF → upload to `id-cards/{school}/{student}/{card}.pdf` → record metadata. */
  generateForStudent: async (studentId: string, templateId: string, onStage?: (s: CardStage) => void): Promise<IdCard> => {
    onStage?.('preparing');
    const student = await StudentsApi.get(studentId);
    const layout = await loadTemplateLayout(templateId);
    const subject = await subjectFor(student);
    onStage?.('rendering');
    let pdf: Uint8Array;
    try {
      pdf = await renderBundlePdf(layout, [subject], { mode: 'single', dpi: layout.dpi });
    } catch (e) {
      throw new UserFacingError(`ID card could not be rendered: ${(e as Error).message}`);
    }
    const cardId = crypto.randomUUID();
    const path = `${student.school_id}/${student.id}/${cardId}.pdf`;
    const fileName = `${student.enrollment_no}-${student.name.replace(/[^\w]+/g, '_')}.pdf`;
    onStage?.('uploading');
    const blob = new Blob([pdf as BlobPart], { type: 'application/pdf' });
    const up = await supabase.storage.from(CARD_BUCKET).upload(path, blob, { contentType: 'application/pdf' });
    if (up.error) throw up.error;
    // PNG preview alongside the PDF — mobile browsers cannot show PDFs inline.
    try {
      const png = await renderCardPng(layout, subject);
      await supabase.storage.from(CARD_BUCKET).upload(cardPreviewPath(path), png, { contentType: 'image/png' });
    } catch { /* preview is optional */ }
    onStage?.('saving');
    const res = await supabase.from('id_cards').insert({
      id: cardId, student_id: student.id, school_id: student.school_id, template_id: templateId,
      storage_path: path, file_name: fileName, file_size: blob.size, mime_type: 'application/pdf',
      qr_payload: subject.qrPayload as never,
    }).select('*, id_card_templates(name)').single();
    if (res.error) { await supabase.storage.from(CARD_BUCKET).remove([path, cardPreviewPath(path)]); throw res.error; }
    return res.data as unknown as IdCard;
  },
  delete: async (card: IdCard) => {
    await supabase.storage.from(CARD_BUCKET).remove([card.storage_path, cardPreviewPath(card.storage_path)]);
    must(await supabase.from('id_cards').delete().eq('id', card.id));
  },
};

export const cardPreviewPath = (pdfPath: string) => pdfPath.replace(/\.pdf$/i, '.png');

// ---------------------------------------------------------------- Bulk ID card jobs (rendered in the browser)
export const IdCardJobsApi = {
  list: async (limit = 20): Promise<IdCardJob[]> =>
    (must(await supabase.from('id_card_jobs').select('*').order('created_at', { ascending: false }).limit(limit)) ?? []) as unknown as IdCardJob[],
  run: async (
    body: { template_id: string; school_id: string; class_id?: string; section_id?: string; status?: string; layout: 'single' | 'a4-sheet'; student_ids?: string[] },
    onProgress: (p: { msg: string; done: number; total: number }) => void,
  ): Promise<IdCardJob> => {
    onProgress({ msg: 'Loading candidates…', done: 0, total: 0 });
    const students: Student[] = [];
    if (body.student_ids?.length) {
      // Explicitly chosen candidates win over the class/section filters.
      for (let i = 0; i < body.student_ids.length; i += 200) {
        const res = await StudentsApi.list({
          school_id: body.school_id, ids: body.student_ids.slice(i, i + 200),
          page: 1, page_size: 200, with_photos: false,
        });
        students.push(...res.items);
      }
    } else {
      for (let page = 1; ; page++) {
        const res = await StudentsApi.list({
          school_id: body.school_id, class_id: body.class_id, section_id: body.section_id,
          status: body.status, page, page_size: 200, with_photos: false,
        });
        students.push(...res.items);
        if (students.length >= res.total || res.items.length === 0) break;
      }
    }
    if (students.length === 0) throw new UserFacingError('No students match this selection.');
    const job = must(await supabase.from('id_card_jobs').insert({
      school_id: body.school_id, template_id: body.template_id, class_id: body.class_id ?? null,
      section_id: body.section_id ?? null, layout: body.layout, output_format: 'pdf',
      total: students.length, status: 'running', student_ids: students.map((s) => s.id) as never,
    }).select().single()) as unknown as IdCardJob;
    try {
      onProgress({ msg: 'Loading template…', done: 0, total: students.length });
      const layout = await loadTemplateLayout(body.template_id);
      const subjects: RenderSubject[] = [];
      for (let i = 0; i < students.length; i++) {
        subjects.push(await subjectFor(students[i]));
        onProgress({ msg: `Fetching photos ${i + 1}/${students.length}…`, done: i + 1, total: students.length });
      }
      onProgress({ msg: 'Rendering cards…', done: students.length, total: students.length });
      const pdf = await renderBundlePdf(layout, subjects, { mode: body.layout, dpi: layout.dpi });
      const path = `${body.school_id}/batches/${job.id}.pdf`;
      onProgress({ msg: 'Uploading PDF…', done: students.length, total: students.length });
      const blob = new Blob([pdf as BlobPart], { type: 'application/pdf' });
      const up = await supabase.storage.from(CARD_BUCKET).upload(path, blob, { contentType: 'application/pdf' });
      if (up.error) throw up.error;
      return must(await supabase.from('id_card_jobs').update({
        status: 'done', processed: students.length, output_key: path, file_size: blob.size,
      }).eq('id', job.id).select().single()) as unknown as IdCardJob;
    } catch (e) {
      await supabase.from('id_card_jobs').update({ status: 'failed', error: (e as Error).message ?? 'failed' }).eq('id', job.id);
      throw e;
    }
  },
};

// ---------------------------------------------------------------- Bulk import (parsed in the browser)
const DEFAULT_COLUMN_MAPPING: Record<string, string> = {
  'Ph No.': 'photo_hint', 'S.N.': 'photo_hint', 'Student Name': 'name', NAME: 'name',
  'Enr No.': 'enrollment_no', 'ENR. NO.': 'enrollment_no', Enr: 'enrolled_year', CLASS: 'class_name',
  SECTION: 'section_name', ROLL: 'roll_no', DOB: 'dob', "Father's Name": 'father_name',
  'FATHER NAME': 'father_name', "Mother's Name": 'mother_name', 'MOTHER NAME': 'mother_name',
  Address: 'address', ADDRESS: 'address', Mobile: 'mobile', MOBILE: 'mobile',
};
const FIELD_KEYWORDS: Array<[string, string[]]> = [
  ['photo_hint', ['photonumber', 'photono', 'phno', 'photofile', 'photograph', 'photoname', 'image', 'picture', 'photo', 'sno', 'srno', 'serialno']],
  ['extra:emergency_contact', ['emergency']],
  ['extra:email', ['email', 'mailid']],
  ['extra:designation', ['designation', 'position', 'jobtitle', '=post']],
  ['extra:department', ['department', 'dept', 'division', '=team']],
  ['extra:doj', ['dateofjoining', 'joiningdate', 'doj', 'joinedon']],
  ['extra:valid_till', ['validtill', 'validupto', 'expiry', 'validity']],
  ['extra:age', ['=age', 'ageyears', 'ageinyears', 'currentage']],
  ['father_name', ['fathername', 'fathersname', 'guardianname']],
  ['mother_name', ['mothername', 'mothersname']],
  ['enrollment_no', ['employeeid', 'employeeno', 'employeecode', 'empid', 'empno', 'empcode', 'staffid', 'staffno', 'idno', 'idnumber', 'cardno', 'enrollmentno', 'enrolmentno', 'enrollmentid', 'enrno', 'enrolno', 'registrationno', 'regno', 'admissionno']],
  ['roll_no', ['rollno', 'rollnumber', 'roll']],
  ['class_name', ['class', 'standard', 'std', 'grade']],
  ['section_name', ['section', 'sec']],
  ['dob', ['dateofbirth', 'birthdate', 'dob']],
  ['blood_group', ['bloodgroup', 'blood']],
  ['gender', ['gender', 'sex']],
  ['enrolled_on', ['admissiondate', 'joiningdate', 'enrolledon', 'dateofjoining']],
  ['enrolled_year', ['academicyear', 'session', 'batch', 'year']],
  ['mobile', ['mobilenumber', 'mobileno', 'phonenumber', 'phoneno', 'contactno', 'contactnumber', 'mobile', 'phone', 'contact']],
  ['address', ['address', 'addr', 'residence', 'location']],
  ['name', ['studentname', 'candidatename', 'employeename', 'staffname', 'fullname', 'name']],
];
const STUDENT_FIELDS = new Set(['name', 'father_name', 'mother_name', 'enrollment_no', 'roll_no', 'dob', 'blood_group',
  'gender', 'address', 'mobile', 'enrolled_on', 'enrolled_year', 'photo_hint', 'class_name', 'section_name']);
const normStem = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

function suggestMapping(columns: string[]) {
  const out: Record<string, string> = {};
  for (const col of columns) {
    const h = col.trim();
    if (DEFAULT_COLUMN_MAPPING[h]) { out[h] = DEFAULT_COLUMN_MAPPING[h]; continue; }
    const n = normStem(h);
    if (!n) continue;
    const hit = FIELD_KEYWORDS.find(([, ps]) => ps.some((p) => (p.startsWith('=') ? n === p.slice(1) : n.includes(p))));
    if (hit) out[h] = hit[0];
    // Keep every other column as an extra detail so templates can still print it.
    else out[h] = `extra:${n}`;
  }
  return out;
}

function stringify(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'number' && Number.isInteger(v)) return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

function parseDate(v: unknown): string | null {
  if (v instanceof Date && !isNaN(+v)) return v.toISOString().slice(0, 10);
  const s = stringify(v);
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (m) { const y = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  return null;
}

function mapRow(raw: Record<string, unknown>, mapping: Record<string, string>) {
  const mapped: Record<string, unknown> = {};
  for (const [col, value] of Object.entries(raw)) {
    const f = mapping[col];
    if (f?.startsWith('extra:')) {
      const v = value instanceof Date ? value.toISOString().slice(0, 10) : stringify(value);
      if (v) ((mapped.extra ??= {}) as Record<string, string>)[f.slice(6)] = v;
      continue;
    }
    if (!f || !STUDENT_FIELDS.has(f)) continue;
    mapped[f] = value === '' ? null : value;
  }
  const errors: Array<{ field: string; code: string }> = [];
  if (!stringify(mapped.name)) errors.push({ field: 'name', code: 'required' });
  else mapped.name = stringify(mapped.name);
  if (!stringify(mapped.enrollment_no)) errors.push({ field: 'enrollment_no', code: 'required' });
  else mapped.enrollment_no = stringify(mapped.enrollment_no).toUpperCase();
  for (const k of ['roll_no', 'class_name', 'section_name', 'father_name', 'mother_name', 'address', 'blood_group', 'photo_hint'])
    if (mapped[k] != null) mapped[k] = stringify(mapped[k]);
  if (mapped.dob) { const d = parseDate(mapped.dob); if (!d) errors.push({ field: 'dob', code: 'invalid_date' }); else mapped.dob = d; }
  if (mapped.enrolled_on) mapped.enrolled_on = parseDate(mapped.enrolled_on);
  if (mapped.enrolled_year && !mapped.enrolled_on) {
    const yr = parseInt(stringify(mapped.enrolled_year).replace(/\D/g, '').slice(0, 4) || '0', 10);
    if (yr >= 1900) mapped.enrolled_on = `${yr}-01-01`;
  }
  if (mapped.gender) {
    const g = stringify(mapped.gender).toLowerCase();
    mapped.gender = g.startsWith('m') ? 'male' : g.startsWith('f') ? 'female' : g ? 'other' : null;
  }
  if (mapped.mobile) {
    const d = stringify(mapped.mobile).replace(/\D/g, '');
    if (d.length < 10) errors.push({ field: 'mobile', code: 'invalid' });
    else mapped.mobile = d.startsWith('91') && d.length === 12 ? `+${d}` : d.length === 10 ? `+91${d}` : `+${d}`;
  }
  return { mapped, errors };
}

/** Photos extracted from an uploaded ZIP, kept in memory until commit (needs the student id for the path). */
const pendingImportPhotos = new Map<string, Map<string, Blob>>();

function photoFor(photos: Map<string, Blob>, mapped: Record<string, unknown>): Blob | undefined {
  for (const k of [mapped.photo_hint, mapped.enrollment_no, mapped.name]) {
    if (!k) continue;
    const stem = normStem(String(k));
    const hit = photos.get(stem) ?? photos.get(normStem(String(k).replace(/\.[a-z0-9]+$/i, '')));
    if (hit) return hit;
  }
  return undefined;
}

async function countPhotoMatches(importId: string, photos: Map<string, Blob>, mapping: Record<string, string>) {
  if (!photos.size) return 0;
  const rows = must(await supabase.from('bulk_import_rows').select('raw').eq('bulk_import_id', importId)) ?? [];
  return rows.filter((r) => photoFor(photos, mapRow(r.raw as Record<string, unknown>, mapping).mapped)).length;
}

export const BulkImportsApi = {
  uploadSpreadsheet: async (schoolId: string, file: File): Promise<BulkImportPreview> => {
    const lower = file.name.toLowerCase();
    if (!/\.(xlsx|xls|csv)$/.test(lower)) throw new UserFacingError('Upload an .xlsx, .xls or .csv file.');
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) throw new UserFacingError('The spreadsheet has no sheets.');
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: true })
      .filter((r) => Object.values(r).some((v) => stringify(v) !== ''));
    if (rows.length === 0) throw new UserFacingError('No data rows found in the spreadsheet.');
    const columns = Object.keys(rows[0]);
    const suggested = suggestMapping(columns);
    const imp = must(await supabase.from('bulk_imports').insert({
      school_id: schoolId, source_type: lower.endsWith('.csv') ? 'csv' : 'xlsx', original_filename: file.name,
      column_mapping: suggested, status: 'uploaded', stats: { total: rows.length },
    }).select('id').single());
    const json = (r: Record<string, unknown>) => JSON.parse(JSON.stringify(r, (_k, v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v)));
    for (let i = 0; i < rows.length; i += 500) {
      must(await supabase.from('bulk_import_rows').insert(rows.slice(i, i + 500).map((r, j) => ({
        bulk_import_id: imp!.id, school_id: schoolId, row_index: i + j + 1, raw: json(r), status: 'pending' as const,
      }))));
    }
    const sample = must(await supabase.from('bulk_import_rows').select('*').eq('bulk_import_id', imp!.id).order('row_index').limit(10));
    return { import_id: imp!.id, columns_detected: columns, suggested_mapping: suggested, total_rows: rows.length, sample: sample as unknown as BulkImportRow[] };
  },
  /** One ZIP or a picked folder holding the data sheet (xlsx/csv) and the photos. */
  uploadBundle: async (schoolId: string, source: File | File[]): Promise<BulkImportPreview & { photos_found: number; photos_matched: number }> => {
    const files: Array<{ name: string; blob: () => Promise<Blob> }> = [];
    if (Array.isArray(source)) {
      for (const f of source) files.push({ name: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name, blob: async () => f });
    } else {
      let zip: JSZip;
      try { zip = await JSZip.loadAsync(source); } catch { throw new UserFacingError('That ZIP file could not be opened.'); }
      for (const e of Object.values(zip.files)) if (!e.dir) files.push({ name: e.name, blob: async () => new Blob([await e.async('arraybuffer')]) });
    }
    const usable = files.filter((f) => !f.name.includes('__MACOSX') && !f.name.split('/').pop()!.startsWith('.'));
    const sheet = usable.find((f) => /\.(xlsx|xls|csv)$/i.test(f.name));
    if (!sheet) throw new UserFacingError('No data sheet (.xlsx, .xls or .csv) was found in that ZIP or folder.');
    const base = sheet.name.split('/').pop()!;
    const preview = await BulkImportsApi.uploadSpreadsheet(schoolId, new File([await sheet.blob()], base));
    const photos = new Map<string, Blob>();
    for (const f of usable) {
      const m = f.name.match(/\.(jpe?g|png|webp|gif|bmp|heic|heif|avif|tiff?)$/i);
      if (!m) continue;
      const fname = f.name.split('/').pop()!;
      const ext = m[1].toLowerCase();
      const type = ext === 'jpg' ? 'image/jpeg' : ext === 'tif' ? 'image/tiff' : `image/${ext}`;
      photos.set(normStem(fname.replace(/\.[^.]+$/, '')), new Blob([await f.blob()], { type }));
    }
    pendingImportPhotos.set(preview.import_id, photos);
    const matched = await countPhotoMatches(preview.import_id, photos, preview.suggested_mapping);
    return { ...preview, photos_found: photos.size, photos_matched: matched };
  },
  /** Re-count photo matches after the mapping changes. */
  photoMatches: async (importId: string, mapping: Record<string, string>) =>
    countPhotoMatches(importId, pendingImportPhotos.get(importId) ?? new Map(), mapping),
  attachPhotos: async (importId: string, zipFile: File) => {
    let zip: JSZip;
    try { zip = await JSZip.loadAsync(zipFile); } catch { throw new UserFacingError('That ZIP file could not be opened.'); }
    const photos = new Map<string, Blob>();
    for (const entry of Object.values(zip.files)) {
      if (entry.dir || !/\.(jpe?g|png)$/i.test(entry.name) || entry.name.includes('__MACOSX')) continue;
      const base = entry.name.split('/').pop()!;
      const stem = normStem(base.replace(/\.[^.]+$/, ''));
      const type = /\.png$/i.test(base) ? 'image/png' : 'image/jpeg';
      photos.set(stem, new Blob([await entry.async('arraybuffer')], { type }));
    }
    pendingImportPhotos.set(importId, photos);
    const rows = must(await supabase.from('bulk_import_rows').select('raw').eq('bulk_import_id', importId)) ?? [];
    const imp = must(await supabase.from('bulk_imports').select('column_mapping').eq('id', importId).single());
    const mapping = (imp?.column_mapping ?? {}) as Record<string, string>;
    let matched = 0;
    for (const r of rows) {
      const { mapped } = mapRow(r.raw as Record<string, unknown>, mapping);
      if ([mapped.photo_hint, mapped.enrollment_no].some((k) => k && photos.has(normStem(String(k))))) matched++;
    }
    return { photos_uploaded: photos.size, photos_matched: matched };
  },
  presignLocalPhotos: async (_importId: string, _items: Array<{ enrollment_no: string; content_type?: string }>): Promise<Array<{
    enrollment_no: string; put_url: string; storage_key: string; required_headers: Record<string, string>;
  }>> => { throw new UserFacingError('Desktop folder upload is not available on the web. Upload a ZIP of photos instead.'); },
  recordLocalPhotos: async (_importId: string, _items: Array<{ enrollment_no: string; storage_key: string }>): Promise<{ photos_uploaded: number; photos_matched: number }> => {
    throw new UserFacingError('Desktop folder upload is not available on the web. Upload a ZIP of photos instead.');
  },
  commit: async (importId: string, body: {
    column_mapping?: Record<string, string>; default_class_id?: string; default_section_id?: string;
  }, onProgress?: (done: number, total: number) => void): Promise<BulkImportCommitResult> => {
    const imp = must(await supabase.from('bulk_imports').select('*').eq('id', importId).single())!;
    const mapping = body.column_mapping ?? (imp.column_mapping as Record<string, string>) ?? {};
    must(await supabase.from('bulk_imports').update({ status: 'importing', column_mapping: mapping }).eq('id', importId));
    const rows = must(await supabase.from('bulk_import_rows').select('*').eq('bulk_import_id', importId).order('row_index')) ?? [];
    const photos = pendingImportPhotos.get(importId) ?? new Map<st

... [truncated — file is 55536 bytes, showing first 51200]