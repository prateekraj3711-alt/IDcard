import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Box, TextField, Typography, Chip, Stack } from '@mui/material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { useNavigate } from 'react-router-dom';
import { StudentsApi } from '@/api/endpoints';

const columns: GridColDef[] = [
  { field: 'enrollment_no', headerName: 'Enrollment', width: 160 },
  { field: 'name', headerName: 'Name', flex: 1 },
  { field: 'father_name', headerName: 'Father', flex: 1 },
  { field: 'mobile', headerName: 'Mobile', width: 160 },
  {
    field: 'status', headerName: 'Status', width: 130,
    renderCell: (p) => <Chip size="small" label={p.value} />,
  },
];

export function StudentsPage() {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const nav = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['students', q, page],
    queryFn: () => StudentsApi.list({ q, page: page + 1, page_size: 25 }),
  });

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="h4">Students</Typography>
        <TextField
          size="small"
          placeholder="Search name, enrollment, mobile…"
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(0); }}
          sx={{ minWidth: 320, background: 'white' }}
        />
      </Stack>
      <div style={{ height: 640, background: 'white' }}>
        <DataGrid
          rows={data?.items ?? []}
          columns={columns}
          loading={isLoading}
          getRowId={(r) => r.id}
          paginationMode="server"
          rowCount={data?.total ?? 0}
          paginationModel={{ page, pageSize: 25 }}
          onPaginationModelChange={(m) => setPage(m.page)}
          pageSizeOptions={[25]}
          onRowClick={(r) => nav(`/students/${r.id}`)}
        />
      </div>
    </Box>
  );
}
