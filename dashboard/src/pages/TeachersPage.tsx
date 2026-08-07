import { useQuery } from '@tanstack/react-query';
import { Box, Typography } from '@mui/material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { TeachersApi } from '@/api/endpoints';
import { useAuth } from '@/auth/store';

const columns: GridColDef[] = [
  { field: 'full_name', headerName: 'Name', flex: 1 },
  { field: 'email', headerName: 'Email', flex: 1 },
  { field: 'is_active', headerName: 'Active', width: 100, type: 'boolean' },
  { field: 'last_login_at', headerName: 'Last login', width: 200 },
];

export function TeachersPage() {
  const { user } = useAuth();
  const schoolId = user?.school?.id;
  const { data, isLoading } = useQuery({
    queryKey: ['teachers', schoolId],
    queryFn: () => TeachersApi.list(schoolId!),
    enabled: !!schoolId,
  });
  return (
    <Box>
      <Typography variant="h4" gutterBottom>Teachers</Typography>
      <div style={{ height: 600, background: 'white' }}>
        <DataGrid
          rows={data ?? []}
          columns={columns}
          loading={isLoading}
          getRowId={(r) => r.id}
        />
      </div>
    </Box>
  );
}
