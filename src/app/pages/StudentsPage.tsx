import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Avatar, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography } from '@mui/material';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import PrintIcon from '@mui/icons-material/Print';
import { DataGrid, GridColDef, GridRowSelectionModel } from '@mui/x-data-grid';
import { useNavigate } from '@/app/router-shim';
import { ClassesApi, SchoolsApi, StudentsApi } from '@/app/api/endpoints';
import { friendlyError } from '@/app/media';
import { useAuth } from '@/app/auth/store';
import { StudentFormDialog } from '@/app/components/StudentFormDialog';
import type { Student } from '@/app/types';

const columns: GridColDef<Student>[] = [
  {
    field: 'photo', headerName: '', width: 64, sortable: false,
    renderCell: (p) => <Avatar variant="rounded" src={p.row.primary_photo_url ?? undefined} sx={{ width: 36, height: 44, mt: 0.5 }} />,
  },
  { field: 'enrollment_no', headerName: 'Enrollment', width: 150 },
  { field: 'name', headerName: 'Name', flex: 1 },
  { field: 'class', headerName: 'Class', width: 120, valueGetter: (_v, r) => [r.class_name, r.section_name].filter(Boolean).join(' - ') },
  { field: 'father_name', headerName: 'Father', flex: 1 },
  { field: 'mobile', headerName: 'Mobile', width: 150 },
  { field: 'status', headerName: 'Status', width: 110, renderCell: (p) => <Chip size="small" label={p.value} /> },
];

export function StudentsPage() {
  const user = useAuth((s) => s.user);
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [schoolId, setSchoolId] = useState('');
  const [classId, setClassId] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const [creating, setCreating] = useState(false);
  const [selection, setSelection] = useState<GridRowSelectionModel>([]);
  const nav = useNavigate();
  const qc = useQueryClient();
  const [confirmDel, setConfirmDel] = useState(false);
  const delMany = useMutation({
    mutationFn: (ids: string[]) => StudentsApi.deleteMany(ids),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['students'] }); setSelection([]); setConfirmDel(false); },
  });

  useEffect(() => { const t = setTimeout(() => setDebounced(q), 300); return () => clearTimeout(t); }, [q]);

  const { data: schools } = useQuery({
    queryKey: ['schools', 'select'],
    queryFn: () => SchoolsApi.list({ page: 1, page_size: 200 }),
  });
  const effectiveSchool = schoolId || (user?.role === 'teacher' ? user.school?.id ?? '' : '');
  const { data: classes } = useQuery({
    queryKey: ['classes', effectiveSchool],
    queryFn: () => ClassesApi.list(effectiveSchool),
    enabled: !!effectiveSchool,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['students', debounced, schoolId, classId, status, page],
    queryFn: () => StudentsApi.list({
      q: debounced, school_id: schoolId || undefined, class_id: classId || undefined,
      status: status || undefined, page: page + 1, page_size: 25,
    }),
  });

  const isSuper = user?.role === 'super_admin';
  const selectedRows = (data?.items ?? []).filter((s) => selection.includes(s.id));
  const multiSchool = new Set(selectedRows.map((s) => s.school_id)).size > 1;

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="h4">Candidates</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreating(true)}>New candidate</Button>
      </Stack>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <TextField size="small" placeholder="Search name, enrollment, roll, mobile…" value={q}
          onChange={(e) => { setQ(e.target.value); setPage(0); }} sx={{ minWidth: 300, background: 'white' }} />
        {user?.role === 'super_admin' && (
          <TextField select size="small" label="Organization" value={schoolId} sx={{ minWidth: 220, background: 'white' }}
            onChange={(e) => { setSchoolId(e.target.value); setClassId(''); setPage(0); }}>
            <MenuItem value="">All organizations</MenuItem>
            {(schools?.items ?? []).map((s) => <MenuItem key={s.id} value={s.id}>{s.code} — {s.name}</MenuItem>)}
          </TextField>
        )}
        <TextField select size="small" label="Class" value={classId} disabled={!effectiveSchool} sx={{ minWidth: 140, background: 'white' }}
          onChange={(e) => { setClassId(e.target.value); setPage(0); }}>
          <MenuItem value="">All classes</MenuItem>
          {(classes ?? []).map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Status" value={status} sx={{ minWidth: 140, background: 'white' }}
          onChange={(e) => { setStatus(e.target.value); setPage(0); }}>
          <MenuItem value="">Any status</MenuItem>
          {['draft', 'submitted', 'active', 'archived'].map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
        </TextField>
      </Stack>
      {isSuper && selection.length > 0 && (
        <Alert
          severity={multiSchool ? 'warning' : 'info'}
          sx={{ mb: 2 }}
          action={<Stack direction="row" spacing={1}>
            <Button color="error" size="small" startIcon={<DeleteIcon />} onClick={() => setConfirmDel(true)}>Delete ({selection.length})</Button>
            {!multiSchool && (
            <Button color="inherit" size="small" startIcon={<PrintIcon />}
              onClick={() => {
                const selSchool = effectiveSchool
                  || (new Set(selectedRows.map((s) => s.school_id)).size === 1 ? selectedRows[0].school_id : undefined);
                nav('/generate', { search: { ids: selection.join(','), school: selSchool } });
              }}>
              Generate ID cards ({selection.length})
            </Button>
            )}
          </Stack>}
        >
          {multiSchool
            ? 'Candidates from more than one organization are selected — filter to a single organization first.'
            : `${selection.length} candidates selected.`}
        </Alert>
      )}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{friendlyError(error, "Couldn't load candidates")}</Alert>}
      <div style={{ height: 640, background: 'white' }}>
        <DataGrid
          rows={data?.items ?? []}
          columns={columns}
          loading={isLoading}
          getRowId={(r) => r.id}
          rowHeight={56}
          checkboxSelection={isSuper}
          disableRowSelectionOnClick
          rowSelectionModel={selection}
          onRowSelectionModelChange={(m) => setSelection(m)}
          paginationMode="server"
          rowCount={data?.total ?? 0}
          paginationModel={{ page, pageSize: 25 }}
          onPaginationModelChange={(m) => setPage(m.page)}
          pageSizeOptions={[25]}
          onRowClick={(r, e) => {
            if ((e.target as HTMLElement).closest?.('.MuiDataGrid-cellCheckbox')) return;
            nav(`/students/${r.id}`);
          }}
          sx={{ '& .MuiDataGrid-row': { cursor: 'pointer' } }}
        />
      </div>
      <Dialog open={confirmDel} onClose={() => setConfirmDel(false)}>
        <DialogTitle>Delete {selection.length} candidates?</DialogTitle>
        <DialogContent>
          <Typography>They will be archived and hidden from the list.</Typography>
          {delMany.isError && <Alert severity="error" sx={{ mt: 2 }}>{friendlyError(delMany.error)}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDel(false)}>Cancel</Button>
          <Button color="error" variant="contained" disabled={delMany.isPending} onClick={() => delMany.mutate(selection.map(String))}>
            {delMany.isPending ? 'Deleting…' : 'Delete all'}
          </Button>
        </DialogActions>
      </Dialog>
      {creating && <StudentFormDialog onClose={() => setCreating(false)} />}
    </Box>
  );
}
