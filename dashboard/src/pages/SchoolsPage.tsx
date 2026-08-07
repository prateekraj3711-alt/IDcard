import { useQuery } from '@tanstack/react-query';
import { Box, Typography } from '@mui/material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { SchoolsApi } from '@/api/endpoints';

const columns: GridColDef[] = [
  { field: 'code', headerName: 'Code', width: 140 },
  { field: 'name', headerName: 'Name', flex: 1 },
  { field: 'city', headerName: 'City', width: 160 },
  { field: 'principal_name', headerName: 'Principal', width: 200 },
  { field: 'is_active', headerName: 'Active', width: 100, type: 'boolean' },
];

export function SchoolsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['schools'],
    queryFn: () => SchoolsApi.list({ page: 1, page_size: 100 }),
  });
  return (
    <Box>
      <Typography variant="h4" gutterBottom>Schools</Typography>
      <div style={{ height: 600, background: 'white' }}>
        <DataGrid
          rows={data?.items ?? []}
          columns={columns}
          loading={isLoading}
          getRowId={(r) => r.id}
          disableRowSelectionOnClick
        />
      </div>
    </Box>
  );
}
