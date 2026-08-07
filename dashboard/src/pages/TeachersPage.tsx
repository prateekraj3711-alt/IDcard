import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Box, Button, MenuItem, TextField, Typography, Dialog, DialogTitle, DialogContent,
  DialogActions, Stack, Alert, IconButton, Tooltip,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import RefreshIcon from '@mui/icons-material/Refresh';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { SchoolsApi, TeachersApi } from '@/api/endpoints';

interface Credentials { username: string; password: string }

export function TeachersPage() {
  const qc = useQueryClient();
  const [schoolId, setSchoolId] = useState<string>('');
  const [open, setOpen] = useState(false);
  const [issued, setIssued] = useState<Credentials | null>(null);

  const { data: schools } = useQuery({
    queryKey: ['schools', 'select'],
    queryFn: () => SchoolsApi.list({ page: 1, page_size: 100 }),
  });

  const { data: teachers, isLoading } = useQuery({
    queryKey: ['teachers', schoolId],
    queryFn: () => TeachersApi.list(schoolId),
    enabled: !!schoolId,
  });

  const createTeacher = useMutation({
    mutationFn: TeachersApi.create,
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ['teachers', schoolId] });
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
    { field: 'is_active', headerName: 'Active', width: 100, type: 'boolean' },
    { field: 'last_login_at', headerName: 'Last login', width: 200 },
    {
      field: 'actions', headerName: '', width: 100, sortable: false,
      renderCell: (p) => (
        <Tooltip title="Reset password">
          <IconButton size="small" onClick={() => regenerate.mutate(p.row.id)}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      ),
    },
  ];

  return (
    <Box>
      <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="h4">Teachers</Typography>
        <Stack direction="row" spacing={2}>
          <TextField
            select size="small" label="School" value={schoolId}
            onChange={(e) => setSchoolId(e.target.value)}
            sx={{ minWidth: 260, background: 'white' }}
          >
            {(schools?.items ?? []).map((s) => (
              <MenuItem key={s.id} value={s.id}>{s.code} — {s.name}</MenuItem>
            ))}
          </TextField>
          <Button variant="contained" onClick={() => setOpen(true)} disabled={!schoolId}>
            Add teacher
          </Button>
        </Stack>
      </Stack>

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
        onSubmit={(body) => createTeacher.mutate({ ...body, school_id: schoolId })}
        submitting={createTeacher.isPending}
        error={createTeacher.error as { response?: { data?: { detail?: string } } } | null}
      />

      <CredentialsDialog open={!!issued} creds={issued} onClose={() => setIssued(null)} />
    </Box>
  );
}

function AddTeacherDialog({
  open, onClose, onSubmit, submitting, error,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (body: { full_name: string; email: string; phone?: string; username?: string; password?: string }) => void;
  submitting: boolean;
  error: { response?: { data?: { detail?: string } } } | null;
}) {
  const [full_name, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const submit = () => onSubmit({
    full_name, email,
    phone: phone || undefined,
    username: username || undefined,
    password: password || undefined,
  });

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Add teacher</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField label="Full name" value={full_name} onChange={(e) => setFullName(e.target.value)} required />
          <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
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
              {error.response?.data?.detail ?? 'Failed to create teacher'}
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={submit} disabled={submitting || !full_name || !email}>
          {submitting ? 'Creating…' : 'Create'}
        </Button>
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
      <DialogTitle>Teacher credentials</DialogTitle>
      <DialogContent>
        <Alert severity="warning" sx={{ mb: 2 }}>
          These credentials are shown once. Copy and share them securely with the teacher.
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
