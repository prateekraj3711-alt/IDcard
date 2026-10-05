import { supabase } from '@/integrations/supabase/client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Grid, MenuItem, TextField,
} from '@mui/material';
import { ClassesApi, SchoolsApi, StudentsApi, type StudentInput } from '@/app/api/endpoints';
import { friendlyError } from '@/app/media';
import { useAuth } from '@/app/auth/store';
import type { Student } from '@/app/types';
import { DateTextField } from './DateTextField';
import { DATE_EXTRA_KEYS, ENTRY_FIELDS, parseEntryFields } from '@/app/entryFields';

const EXTRA_FIELDS: Array<[string, string]> = ENTRY_FIELDS.filter((f) => f.key.startsWith('extra.')).map((f) => [f.key.slice(6), f.label]);
const EXTRA_LABEL: Record<string, string> = Object.fromEntries(EXTRA_FIELDS);

/** Keep only digits, drop +91 / 91 / leading 0 prefixes, cap at 10 digits. */
function normalizeMobile(raw: string): string {
  let d = raw.replace(/\D/g, '');
  if (d.length > 10 && d.startsWith('91')) d = d.slice(2);
  d = d.replace(/^0+/, '');
  if (d.length > 10 && d.startsWith('91')) d = d.slice(2);
  return d.slice(0, 10);
}

export function StudentFormDialog({
  student, onClose, onSaved,
}: { student?: Student | null; onClose: () => void; onSaved?: (id: string) => void }) {
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  const [saved, setSaved] = useState<{ id: string; name: string } | null>(null);
  const blank = (): StudentInput & { class_name?: string; section_name?: string } => ({
    school_id: user?.school?.id ?? '',
    enrollment_no: '', name: '', roll_no: '',
    father_name: '', mother_name: '', dob: '',
    blood_group: '', gender: null, mobile: '',
    address: '', status: 'active',
    class_name: user?.class?.name ?? '', section_name: '',
    extra: {} as Record<string, string>,
  });
  const [form, setForm] = useState<StudentInput & { class_name?: string; section_name?: string }>(() => student ? {
    school_id: student.school_id,
    enrollment_no: student.enrollment_no, name: student.name, roll_no: student.roll_no ?? '',
    father_name: student.father_name ?? '', mother_name: student.mother_name ?? '', dob: student.dob ?? '',
    blood_group: student.blood_group ?? '', gender: student.gender ?? null, mobile: student.mobile ?? '',
    address: student.address ?? '', status: student.status ?? 'active',
    class_name: student.class_name ?? '', section_name: student.section_name ?? '',
    extra: { ...(student.extra ?? {}) },
  } : blank());
  const setExtra = (k: string, v: string) => setForm((f) => ({ ...f, extra: { ...(f.extra ?? {}), [k]: v } }));
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const isAdmin = user?.role === 'super_admin';
  const classLocked = !isAdmin && !!user?.class;

  const { data: schools } = useQuery({
    queryKey: ['schools', 'select'],
    queryFn: () => SchoolsApi.list({ page: 1, page_size: 200 }),
  });
  const { data: classes } = useQuery({
    queryKey: ['classes', form.school_id],
    queryFn: () => ClassesApi.list(form.school_id!),
    enabled: !!form.school_id,
  });

  // Which details to ask: super admins see everything; users see what the super admin chose for the organization.
  const school = (schools?.items ?? []).find((s) => s.id === form.school_id) as { entry_fields?: unknown } | undefined;
  const { data: myFields } = useQuery({
    queryKey: ['my-entry-fields', user?.id],
    enabled: !isAdmin && !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('entry_fields').eq('id', user!.id).maybeSingle();
      return parseEntryFields(data?.entry_fields);
    },
  });
  // A user's own list (set when the super admin created them) wins over the organization's list.
  const config = isAdmin ? null : (myFields ?? parseEntryFields(school?.entry_fields));
  const ask = (key: string) => key === 'name' || !config || config.includes(key);
  const configExtras = (config ?? []).filter((k) => k.startsWith('extra.')).map((k) => k.slice(6));
  const extraKeys = Array.from(new Set([
    ...EXTRA_FIELDS.map(([k]) => k).filter((k) => ask('extra.' + k)),
    ...configExtras,
    ...(isAdmin ? Object.keys(form.extra ?? {}) : []),
  ]));
  const enrollmentRequired = ask('enrollment_no');

  const save = useMutation({
    mutationFn: async () => {
      const { class_name, section_name, ...rest } = form;
      rest.mobile = normalizeMobile(rest.mobile ?? '');
      if (rest.mobile && rest.mobile.length !== 10) throw new Error('Mobile number must be exactly 10 digits.');
      if (!rest.enrollment_no) rest.enrollment_no = `C${Date.now().toString(36).toUpperCase()}`;
      const cls = await ClassesApi.ensure(rest.school_id!, class_name, section_name);
      const extra = Object.fromEntries(Object.entries(rest.extra ?? {}).map(([k, v]) => [k, String(v ?? '').trim()]).filter(([, v]) => v));
      const body: StudentInput = { ...rest, extra, class_id: cls.class_id, section_id: cls.section_id, gender: rest.gender || null };
      if (student) { await StudentsApi.update(student.id, body); return student.id; }
      return (await StudentsApi.create(body)).id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ['students'] });
      qc.invalidateQueries({ queryKey: ['student', id] });
      qc.invalidateQueries({ queryKey: ['classes'] });
      if (student) { onSaved?.(id); onClose(); return; }
      // New candidate: show a Done step so the user can add another right away.
      setSaved({ id, name: (form.name ?? '').trim() });
    },
  });

  const sections = classes?.find((c) => c.name === form.class_name)?.sections ?? [];
  const field = (k: keyof typeof form, label: string, xs = 6, extra: object = {}) => !ask(k as string) ? null : (
    <Grid item xs={12} sm={xs}>
      <TextField fullWidth label={label} value={(form[k] as string) ?? ''} onChange={(e) => set(k, e.target.value)} {...extra} />
    </Grid>
  );

  if (saved && !student) {
    return (
      <Dialog open onClose={onClose} fullWidth maxWidth="xs">
        <DialogTitle>Candidate saved</DialogTitle>
        <DialogContent>
          <Alert severity="success" sx={{ mt: 1 }}>
            {saved.name ? `“${saved.name}” was added.` : 'The candidate was added.'} You can add the next one right away.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Done</Button>
          <Button variant="contained" onClick={() => { setForm((f) => ({ ...blank(), school_id: f.school_id })); setSaved(null); }}>
            Add another
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{student ? 'Edit candidate' : 'New candidate'}</DialogTitle>
      <DialogContent>
        <Grid container spacing={2} sx={{ mt: 0 }}>
          <Grid item xs={12} sm={6}>
            <TextField select fullWidth label="Organization *" value={form.school_id ?? ''}
              disabled={!!student || user?.role !== 'super_admin'}
              onChange={(e) => set('school_id', e.target.value)}>
              {(schools?.items ?? []).map((s) => <MenuItem key={s.id} value={s.id}>{s.code} — {s.name}</MenuItem>)}
            </TextField>
          </Grid>
          {field('enrollment_no', 'ID / Enrollment No *')}
          {field('name', 'Full name *')}
          {field('roll_no', 'Roll No', 3)}
          {isAdmin && (
            <Grid item xs={12} sm={3}>
              <TextField select fullWidth label="Status" value={form.status ?? 'active'} onChange={(e) => set('status', e.target.value)}>
                {['draft', 'submitted', 'active', 'archived'].map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </TextField>
            </Grid>
          )}
          <Grid item xs={12} sm={3}>
            <TextField fullWidth label="Class / Group" value={form.class_name ?? ''} onChange={(e) => set('class_name', e.target.value)}
              disabled={classLocked} helperText={classLocked ? 'Your assigned class' : undefined}
              inputProps={{ list: 'class-options', maxLength: 50 }} />
            <datalist id="class-options">{(classes ?? []).map((c) => <option key={c.id} value={c.name} />)}</datalist>
          </Grid>
          {ask('section_name') && (
            <Grid item xs={12} sm={3}>
              <TextField fullWidth label="Section / Team" value={form.section_name ?? ''} onChange={(e) => set('section_name', e.target.value)}
                inputProps={{ list: 'section-options', maxLength: 10 }} />
              <datalist id="section-options">{sections.map((s) => <option key={s.id} value={s.name} />)}</datalist>
            </Grid>
          )}
          {field('father_name', "Father's name")}
          {field('mother_name', "Mother's name")}
          {ask('dob') && (
            <Grid item xs={12} sm={3}>
              <DateTextField fullWidth label="Date of birth" value={form.dob ?? ''} onChange={(v) => set('dob', v)} />
            </Grid>
          )}
          {field('blood_group', 'Blood group', 3, { inputProps: { maxLength: 5 } })}
          {ask('gender') && (
            <Grid item xs={12} sm={3}>
              <TextField select fullWidth label="Gender" value={form.gender ?? ''} onChange={(e) => set('gender', e.target.value || null)}>
                <MenuItem value="">—</MenuItem>
                <MenuItem value="male">Male</MenuItem><MenuItem value="female">Female</MenuItem><MenuItem value="other">Other</MenuItem>
              </TextField>
            </Grid>
          )}
          {ask('mobile') && (
            <Grid item xs={12} sm={3}>
              <TextField fullWidth label="Mobile" value={form.mobile ?? ''}
                onChange={(e) => set('mobile', normalizeMobile(e.target.value))}
                error={!!form.mobile && form.mobile.length !== 10}
                helperText={form.mobile && form.mobile.length !== 10 ? 'Mobile must be exactly 10 digits' : undefined}
                inputProps={{ inputMode: 'numeric', maxLength: 14 }} />
            </Grid>
          )}
          {field('address', 'Address', 12, { multiline: true, minRows: 2 })}
          {extraKeys.map((k) => (
            <Grid item xs={12} sm={DATE_EXTRA_KEYS.has(k) ? 3 : 6} key={k}>
              {DATE_EXTRA_KEYS.has(k) ? (
                <DateTextField fullWidth label={EXTRA_LABEL[k] ?? k.replace(/_/g, ' ')} value={form.extra?.[k] ?? ''} onChange={(v) => setExtra(k, v)} />
              ) : (
                <TextField fullWidth label={EXTRA_LABEL[k] ?? k.replace(/_/g, ' ')} value={form.extra?.[k] ?? ''}
                  onChange={(e) => setExtra(k, e.target.value)} />
              )}
            </Grid>
          ))}
        </Grid>
        {save.isError && <Alert severity="error" sx={{ mt: 2 }}>{friendlyError(save.error, 'Save failed')}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!form.school_id || !form.name || (enrollmentRequired && !form.enrollment_no) || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? 'Saving…' : 'Save candidate'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
