import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton,
  Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/PersonAddAlt1';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { AdminsApi } from '@/api/endpoints';
import { useAuth } from '@/auth/store';

interface Credentials { username: string; password: string }

export function AdminsPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [issued, setIssued] = useState<Credentials | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);

  const { data: admins, isLoading } = useQuery({
    queryKey: ['admins'],
    queryFn: AdminsApi.list,
  });

  const create = useMutation({
    mutationFn: AdminsApi.create,
    onSuccess: (a) => {
      qc.invalidateQueries({ queryKey: ['admins'] });
      setOpen(false);
      setIssued(a.credentials);
    },
  });

  const regenerate = useMutation({
    mutationFn: AdminsApi.regeneratePassword,
    onSuccess: (r) => setIssued(r.credentials),
  });

  const del = useMutation({
    mutationFn: AdminsApi.delete,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admins'] });
      setConfirmDelete(null);
    },
  });

  const columns: GridColDef[] = [
    { field: 'full_name', headerName: 'Name', flex: 1 },
    { field: 'email', headerName: 'Email', flex: 1 },
    {
      field: 'you', headerName: '', width: 80, sortable: false,
      renderCell: (p) => p.row.id === user?.id
        ? <Chip size="small" color="primary" label="You" />
        : null,
    },
    { field: 'is_active', headerName: 'Active', width: 100, type: 'boolean' },
    { field: 'last_login_at', headerName: 'Last login', width: 200 },
    { field: 'created_at', headerName: 'Added', width: 200 },
    {
      field: 'actions', headerName: '', width: 110, sortable: false,
      renderCell: (p) => (
        <Stack direction="row">
          <Tooltip title="Reset password">
            <IconButton size="small" onClick={() => regenerate.mutate(p.row.id)}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={p.row.id === user?.id ? "You can't delete yourself" : 'Remove admin'}>
            <span>
              <IconButton
                size="small" color="error"
                disabled={p.row.id === user?.id}
                onClick={() => setConfirmDelete({ id: p.row.id, name: p.row.full_name })}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      ),
    },
  ];

  return (
    <Box>
      <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h4">Super Admins</Typography>
          <Typography variant="body2">
            Anyone here has full platform access. Add someone → they receive a one-time username + password modal.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen(true)}>
          Add super admin
        </Button>
      </Stack>

      <Box sx={{ height: 600, background: 'white', borderRadius: 2 }}>
        <DataGrid
          rows={admins ?? []}
          columns={columns}
          loading={isLoading}
          getRowId={(r) => r.id}
          disableRowSelectionOnClick
        />
      </Box>

      <AddAdminDialog
        open={open}
        onClose={() => setOpen(false)}
        onSubmit={(body) => create.mutate(body)}
        submitting={create.isPending}
        error={create.error as { response?: { data?: { detail?: string } } } | null}
      />

      <CredentialsDialog open={!!issued} creds={issued} onClose={() => setIssued(null)} />

      <Dialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)}>
        <DialogTitle>Remove {confirmDelete?.name}?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            They'll lose access immediately. This is a soft-delete; the audit trail is preserved.
            The server prevents removing the last super admin.
          </Typography>
          {del.isError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {(del.error as { response?: { data?: { detail?: string } } }).response?.data?.detail ?? 'Delete failed'}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(null)}>Cancel</Button>
          <Button
            variant="contained" color="error" disabled={del.isPending}
            onClick={() => confirmDelete && del.mutate(confirmDelete.id)}
          >
            {del.isPending ? 'Removing…' : 'Remove'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function AddAdminDialog({
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
  const [password, setPassword] = useState('');

  const submit = () => onSubmit({
    full_name, email,
    phone: phone || undefined,
    password: password || undefined,
  });

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Add super admin</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Alert severity="warning">
            Super admins have full platform access — creating schools, teachers, templates, generating ID cards, and adding or removing other admins.
          </Alert>
          <TextField label="Full name" value={full_name} onChange={(e) => setFullName(e.target.value)} required />
          <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <TextField label="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <TextField
            label="Password (optional)"
            helperText="Leave blank to auto-generate a strong 14-char password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && (
            <Alert severity="error">
              {error.response?.data?.detail ?? 'Failed to create admin'}
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
      <DialogTitle>Super admin credentials</DialogTitle>
      <DialogContent>
        <Alert severity="warning" sx={{ mb: 2 }}>
          Shown once. Copy and share securely — you can't retrieve the password later.
        </Alert>
        {creds && (
          <Stack spacing={2}>
            <FieldWithCopy label="Login email" value={creds.username} onCopy={() => copy(creds.username)} />
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
