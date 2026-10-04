import { EntryFieldsPicker } from '@/app/pages/SchoolsPage';
import { parseEntryFields } from '@/app/entryFields';
import { friendlyError } from '@/app/media';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Box, Button, MenuItem, TextField, Typography, Dialog, DialogTitle, DialogContent,
  DialogActions, Stack, Alert, IconButton, Tooltip,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import RefreshIcon from '@mui/icons-material/Refresh';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { ClassesApi, SchoolsApi, TeachersApi } from '@/app/api/endpoints';
import EditIcon from '@mui/icons-material/Edit';
import type { School } from '@/app/types';

interface Credentials { username: string; password: string }

export function TeachersPage() {
  const qc = useQueryClient();
  const [schoolId, setSchoolId] = useState<string>('');
  const [open, setOpen] = useState(false);
  const [issued, setIssued] = useState<Credentials | null>(null);
  const [classFor, setClassFor] = useState<{ id: string; schoolId?: string; name: string } | null>(null);

  const { data: schools } = useQuery({
    queryKey: ['schools', 'select'],
    queryFn: () => SchoolsApi.list({ page: 1, page_size: 100 }),
  });

  const {
    data: teachers,
    isLoading,
    error: teachersError,
    refetch: refetchTeachers,
  } = useQuery({
    queryKey: ['teachers', schoolId || 'all'],
    queryFn: () => TeachersApi.list(schoolId || undefined),
    retry: 1,
  });

  const createTeacher = useMutation({
    mutationFn: TeachersApi.create,
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ['teachers'] });
      setOpen(false);
      setIssued(t.credentials);
    },
  });

  const regenerate = useMutation({
    mutationFn: TeachersApi.regeneratePassword,
    onSuccess: (r) => setIssued(r.credentials),
  });

  const columns: GridColDef[] = [
    { field: 'full_name', headerName: 'Name', flex: 1 },
    { field: 'email', headerName: 'Email', flex: 1 },
    {
      field: 'school',
      headerName: 'Organization',
      flex: 1,
      valueGetter: (_v, row) => row.school?.code ? `${row.school.code} — ${row.school.name}` : '—',
    },
    { field: 'class', headerName: 'Class', width: 140, valueGetter: (_v, row) => row.class?.name ?? 'All classes' },
    { field: 'is_active', headerName: 'Active', width: 100, type: 'boolean' },
    { field: 'last_login_at', headerName: 'Last login', width: 200 },
    {
      field: 'actions', headerName: '', width: 110, sortable: false,
      renderCell: (p) => (
        <>
        <Tooltip title="Change class">
          <IconButton size="small" onClick={() => setClassFor({ id: p.row.id, schoolId: p.row.school?.id, name: p.row.class?.name ?? '' })}>
            <EditIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Reset password">
          <IconButton size="small" onClick={() => regenerate.mutate(p.row.id)}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        </>
      ),
    },
  ];

  return (
    <Box>
      <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="h4">Users</Typography>
        <Stack direction="row" spacing={2}>
          <TextField
            select size="small" label="Organization" value={schoolId}
            onChange={(e) => setSchoolId(e.target.value)}
            sx={{ minWidth: 260, background: 'white' }}
            helperText={!schoolId ? 'Showing all organizations' : ''}
          >
            <MenuItem value=""><em>All organizations</em></MenuItem>
            {(schools?.items ?? []).map((s) => (
              <MenuItem key={s.id} value={s.id}>{s.code} — {s.name}</MenuItem>
            ))}
          </TextField>
          <Button variant="contained" onClick={() => setOpen(true)}>
            Add user
          </Button>
        </Stack>
      </Stack>

      {teachersError && (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          action={<Button size="small" onClick={() => refetchTeachers()}>Retry</Button>}
        >
          Couldn't load teachers: {
            friendlyError(teachersError)
              ?? (teachersError as { message?: string }).message
              ?? 'unknown error'
          }
        </Alert>
      )}

      <div style={{ height: 600, background: 'white' }}>
        <DataGrid
          rows={teachers ?? []}
          columns={columns}
          loading={isLoading}
          getRowId={(r) => r.id}
        />
      </div>

      <AddTeacherDialog
        open={open}
        onClose={() => setOpen(false)}
        onSubmit={(body) => createTeacher.mutate(body)}
        submitting={createTeacher.isPending}
        error={createTeacher.error as Error | null}
        schools={schools?.items ?? []}
        defaultSchoolId={schoolId}
      />

      {classFor && <ClassDialog target={classFor} onClose={() => setClassFor(null)} />}

      <CredentialsDialog open={!!issued} creds={issued} onClose={() => setIssued(null)} />
    </Box>
  );
}

function AddTeacherDialog({
  open, onClose, onSubmit, submitting, error, schools, defaultSchoolId,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (body: {
    school_id?: string;
    class_name?: string;
    entry_fields?: string[] | null;
    full_name: string;
    email?: string;
    phone?: string;
    username?: string;
    password?: string;
  }) => void;
  submitting: boolean;
  error: Error | null;
  schools: School[];
  defaultSchoolId: string;
}) {
  // School is now optional. If left blank the teacher can pick a school
  // per student later, from the Android app.
  const [school_id, setSchoolId] = useState(defaultSchoolId || '');
  const [class_name, setClassName] = useState('');
  const [entry_fields, setEntryFields] = useState<string[] | null>(null);
  const { data: classes } = useQuery({ queryKey: ['classes', school_id], queryFn: () => ClassesApi.list(school_id), enabled: !!school_id });
  const [full_name, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (open) {
      setSchoolId(defaultSchoolId || '');
    }
  }, [open, defaultSchoolId]);

  const submit = () => onSubmit({
    school_id: school_id || undefined,
    class_name: school_id && class_name.trim() ? class_name.trim() : undefined,
    entry_fields: school_id ? entry_fields : null,
    full_name, email: email || undefined,
    phone: phone || undefined,
    username: username || undefined,
    password: password || undefined,
  });

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Add user</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            select label="Organization (optional)" value={school_id}
            onChange={(e) => setSchoolId(e.target.value)}
            helperText={schools.length === 0
              ? "No organizations yet — leave blank; user will pick per candidate"
              : "Leave blank to let the user choose per candidate"}
          >
            <MenuItem value=""><em>No organization — pick later per candidate</em></MenuItem>
            {schools.map((s) => (
              <MenuItem key={s.id} value={s.id}>{s.code} — {s.name}</MenuItem>
            ))}
          </TextField>
          {school_id && (
            <>
              <TextField label="Class" value={class_name} onChange={(e) => setClassName(e.target.value)}
                inputProps={{ list: 'teacher-class-options', maxLength: 50 }}
                helperText="The user will only see and add candidates for this class. Leave blank for all classes." />
              <datalist id="teacher-class-options">{(classes ?? []).map((c) => <option key={c.id} value={c.name} />)}</datalist>
              <EntryFieldsPicker value={entry_fields ?? parseEntryFields(schools.find((s) => s.id === school_id)?.entry_fields)} onChange={setEntryFields} />
            </>
          )}
          <TextField label="Full name" value={full_name} onChange={(e) => setFullName(e.target.value)} required />
          <TextField label="Email (optional)" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            helperText="Not needed — the user can sign in with their username or phone" />
          <TextField label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <TextField
            label="Username (optional)"
            helperText="Leave blank to auto-generate from the name"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <TextField
            label="Password (optional)"
            helperText="Leave blank to auto-generate a strong password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && (
            <Alert severity="error">
              {friendlyError(error, 'Failed to create user')}
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained" onClick={submit}
          disabled={submitting || !full_name}
        >
          {submitting ? 'Creating…' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function ClassDialog({ target, onClose }: { target: { id: string; schoolId?: string; name: string }; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(target.name);
  const { data: classes } = useQuery({ queryKey: ['classes', target.schoolId], queryFn: () => ClassesApi.list(target.schoolId!), enabled: !!target.schoolId });
  const save = useMutation({
    mutationFn: () => TeachersApi.setClass(target.id, name.trim()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['teachers'] }); onClose(); },
  });
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Assign class</DialogTitle>
      <DialogContent>
        {!target.schoolId ? <Alert severity="info" sx={{ mt: 1 }}>This user has no organization, so a class can't be set.</Alert> : (
          <>
            <TextField fullWidth sx={{ mt: 1 }} label="Class" value={name} onChange={(e) => setName(e.target.value)}
              inputProps={{ list: 'assign-class-options', maxLength: 50 }} helperText="Leave blank to allow all classes" />
            <datalist id="assign-class-options">{(classes ?? []).map((c) => <option key={c.id} value={c.name} />)}</datalist>
          </>
        )}
        {save.isError && <Alert severity="error" sx={{ mt: 2 }}>{friendlyError(save.error, 'Could not save')}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!target.schoolId || save.isPending} onClick={() => save.mutate()}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}

function CredentialsDialog({
  open, creds, onClose,
}: { open: boolean; creds: Credentials | null; onClose: () => void }) {
  const copy = (v: string) => navigator.clipboard.writeText(v);
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>User credentials</DialogTitle>
      <DialogContent>
        <Alert severity="warning" sx={{ mb: 2 }}>
          These credentials are shown once. Copy and share them securely with the user.
        </Alert>
        {creds && (
          <Stack spacing={2}>
            <FieldWithCopy label="Username" value={creds.username} onCopy={() => copy(creds.username)} />
            <FieldWithCopy label="Password" value={creds.password} onCopy={() => copy(creds.password)} />
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="contained">Done</Button>
      </DialogActions>
    </Dialog>
  );
}

function FieldWithCopy({ label, value, onCopy }: { label: string; value: string; onCopy: () => void }) {
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <TextField label={label} value={value} fullWidth InputProps={{ readOnly: true }} />
      <Tooltip title="Copy">
        <IconButton onClick={onCopy}><ContentCopyIcon /></IconButton>
      </Tooltip>
    </Stack>
  );
}
