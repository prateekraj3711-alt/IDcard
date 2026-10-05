import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton,
  Stack, Switch, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import { DataGrid, GridColDef, GridRowSelectionModel } from '@mui/x-data-grid';
import { SchoolsApi, uploadSchoolBranding } from '@/app/api/endpoints';
import { PHOTO_ACCEPT } from '@/app/media';
import { friendlyError } from '@/app/media';
import { useAuth } from '@/app/auth/store';
import type { School } from '@/app/types';
import { Checkbox, FormGroup } from '@mui/material';
import { ENTRY_FIELDS, customKey } from '@/app/entryFields';
import { ExportMenu } from '@/app/components/ExportMenu';

export function SchoolsPage() {
  const qc = useQueryClient();
  const isAdmin = useAuth((s) => s.user?.role === 'super_admin');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Partial<School> | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<School | null>(null);
  const [selection, setSelection] = useState<GridRowSelectionModel>([]);
  const [confirmBulk, setConfirmBulk] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['schools', q],
    queryFn: () => SchoolsApi.list({ q, page: 1, page_size: 100 }),
  });

  const del = useMutation({
    mutationFn: (id: string) => SchoolsApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['schools'] }); setConfirmDelete(null); },
  });
  const delMany = useMutation({
    mutationFn: (ids: string[]) => SchoolsApi.deleteMany(ids),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['schools'] }); setSelection([]); setConfirmBulk(false); },
  });

  const columns: GridColDef<School>[] = [
    { field: 'code', headerName: 'Code', width: 140 },
    { field: 'name', headerName: 'Name', flex: 1 },
    { field: 'city', headerName: 'City', width: 160 },
    { field: 'principal_name', headerName: 'Principal', width: 200 },
    { field: 'is_active', headerName: 'Active', width: 100, type: 'boolean' },
    ...(isAdmin ? [{
      field: 'actions', headerName: '', width: 110, sortable: false,
      renderCell: (p: { row: School }) => (
        <Stack direction="row">
          <Tooltip title="Edit"><IconButton size="small" onClick={() => setEditing(p.row)}><EditIcon fontSize="small" /></IconButton></Tooltip>
          <Tooltip title="Delete"><IconButton size="small" onClick={() => setConfirmDelete(p.row)}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
        </Stack>
      ),
    } as GridColDef<School>] : []),
  ];

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
        <Typography variant="h4" sx={{ flexGrow: 1 }}>Organizations</Typography>
        <TextField size="small" placeholder="Search name, code, city…" value={q} onChange={(e) => setQ(e.target.value)} sx={{ minWidth: 280, background: 'white' }} />
        {isAdmin && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing({ is_active: true })}>New organization</Button>
        )}
      </Stack>
      {isAdmin && selection.length > 0 && (
        <Alert severity="info" sx={{ mb: 2 }} action={<Stack direction="row" spacing={1}>
          <ExportMenu scope={{ schoolIds: selection.map(String) }} label={`Export candidates (${selection.length})`} filename="organization-candidates" />
          <Button color="error" size="small" startIcon={<DeleteIcon />} onClick={() => setConfirmBulk(true)}>Delete selected ({selection.length})</Button>
        </Stack>}>{selection.length} organizations selected.</Alert>
      )}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{friendlyError(error, "Couldn't load organizations")}</Alert>}
      <div style={{ height: 600, background: 'white' }}>
        <DataGrid rows={data?.items ?? []} columns={columns} loading={isLoading} getRowId={(r) => r.id} disableRowSelectionOnClick
          checkboxSelection={isAdmin} rowSelectionModel={selection} onRowSelectionModelChange={(m) => setSelection(m)} />
      </div>

      {editing && <SchoolDialog school={editing} onClose={() => setEditing(null)} />}

      <Dialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)}>
        <DialogTitle>Delete organization?</DialogTitle>
        <DialogContent>
          <Typography>“{confirmDelete?.name}” will be deactivated and hidden. Its candidates and files are kept.</Typography>
          {del.isError && <Alert severity="error" sx={{ mt: 2 }}>{friendlyError(del.error)}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(null)}>Cancel</Button>
          <Button color="error" variant="contained" disabled={del.isPending} onClick={() => del.mutate(confirmDelete!.id)}>
            {del.isPending ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmBulk} onClose={() => setConfirmBulk(false)}>
        <DialogTitle>Delete {selection.length} organizations?</DialogTitle>
        <DialogContent>
          <Typography>They will be deactivated and hidden. Their candidates and files are kept.</Typography>
          {delMany.isError && <Alert severity="error" sx={{ mt: 2 }}>{friendlyError(delMany.error)}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmBulk(false)}>Cancel</Button>
          <Button color="error" variant="contained" disabled={delMany.isPending} onClick={() => delMany.mutate(selection.map(String))}>
            {delMany.isPending ? 'Deleting…' : 'Delete all'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

const FIELDS: Array<[keyof School, string]> = [
  ['code', 'Code *'], ['name', 'Name *'], ['principal_name', 'Principal'], ['email', 'Email'],
  ['city', 'City'], ['state', 'State'],
];

function SchoolDialog({ school, onClose }: { school: Partial<School>; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Partial<School>>(school);
  const save = useMutation({
    mutationFn: () => (school.id ? SchoolsApi.update(school.id, form) : SchoolsApi.create(form)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['schools'] }); onClose(); },
  });
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{school.id ? 'Edit organization' : 'New organization'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {FIELDS.map(([k, label]) => (
            <TextField key={k} label={label} value={(form[k] as string) ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, [k]: k === 'code' ? e.target.value.toUpperCase() : e.target.value }))}
              inputProps={k === 'code' ? { maxLength: 16 } : undefined} />
          ))}
          {school.id ? (['signature', 'logo'] as const).map((kind) => (
            <BrandingUpload key={kind} schoolId={school.id!} kind={kind} current={(form as Record<string, unknown>)[`${kind}_path`] as string | null}
              onDone={(path) => { setForm((f) => ({ ...f, [`${kind}_path`]: path })); qc.invalidateQueries({ queryKey: ['schools'] }); }} />
          )) : <Typography variant="body2" color="text.secondary">Save the organization first, then edit it to add the authorised signature and logo.</Typography>}
          <EntryFieldsPicker value={form.entry_fields ?? null} onChange={(v) => setForm((f) => ({ ...f, entry_fields: v }))} />
          <FormControlLabel control={<Switch checked={form.is_active ?? true} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />} label="Active" />
          {save.isError && <Alert severity="error">{friendlyError(save.error, 'Save failed')}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!form.code || !form.name || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function BrandingUpload({ schoolId, kind, current, onDone }: { schoolId: string; kind: 'signature' | 'logo'; current?: string | null; onDone: (p: string) => void }) {
  const up = useMutation({ mutationFn: (f: File) => uploadSchoolBranding(schoolId, kind, f), onSuccess: onDone });
  return (
    <Stack direction="row" spacing={2} alignItems="center">
      <Button component="label" variant="outlined" disabled={up.isPending}>
        {up.isPending ? 'Uploading…' : kind === 'signature' ? 'Upload authorised signature' : 'Upload logo'}
        <input hidden type="file" accept={PHOTO_ACCEPT.join(',')} onChange={(e) => { const f = e.target.files?.[0]; if (f) up.mutate(f); e.target.value = ''; }} />
      </Button>
      <Typography variant="body2" color={current ? 'success.main' : 'text.secondary'}>{current ? 'Added' : 'Not added'}</Typography>
      {up.isError && <Alert severity="error">{friendlyError(up.error)}</Alert>}
    </Stack>
  );
}

export function EntryFieldsPicker({ value, onChange }: { value: string[] | null; onChange: (v: string[] | null) => void }) {
  const [custom, setCustom] = useState('');
  const all = ENTRY_FIELDS.map((f) => f.key);
  const selected = value ?? all;
  const customs = selected.filter((k) => !all.includes(k));
  const toggle = (k: string) => onChange(selected.includes(k) ? selected.filter((x) => x !== k) : [...selected, k]);
  return (
    <Box>
      <Typography variant="subtitle2">Details users fill in</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Full name, class and photo are always asked.</Typography>
      <FormGroup row>
        {ENTRY_FIELDS.map((f) => (
          <FormControlLabel key={f.key} sx={{ width: '50%', mr: 0 }} label={f.label}
            control={<Checkbox size="small" checked={selected.includes(f.key)} onChange={() => toggle(f.key)} />} />
        ))}
        {customs.map((k) => (
          <FormControlLabel key={k} sx={{ width: '50%', mr: 0 }} label={k.slice(6).replace(/_/g, ' ')}
            control={<Checkbox size="small" checked onChange={() => toggle(k)} />} />
        ))}
      </FormGroup>
      <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
        <TextField size="small" label="Add another detail" placeholder="e.g. House" value={custom} onChange={(e) => setCustom(e.target.value)} />
        <Button disabled={!custom.trim() || customKey(custom) === 'extra.'} onClick={() => { const k = customKey(custom); if (!selected.includes(k)) onChange([...selected, k]); setCustom(''); }}>Add</Button>
      </Stack>
    </Box>
  );
}
