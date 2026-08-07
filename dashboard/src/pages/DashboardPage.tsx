import { useQuery } from '@tanstack/react-query';
import {
  Alert, Box, Button, Card, CardContent, Grid, Stack, Typography,
} from '@mui/material';
import SchoolIcon from '@mui/icons-material/School';
import BadgeIcon from '@mui/icons-material/Badge';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DesignServicesIcon from '@mui/icons-material/DesignServices';
import PrintIcon from '@mui/icons-material/Print';
import { Link } from 'react-router-dom';
import { SchoolsApi, StudentsApi } from '@/api/endpoints';

export function DashboardPage() {
  const { data: schools } = useQuery({
    queryKey: ['schools', 'summary'],
    queryFn: () => SchoolsApi.list({ page: 1, page_size: 1 }),
  });
  const { data: students } = useQuery({
    queryKey: ['students', 'summary'],
    queryFn: () => StudentsApi.list({ page: 1, page_size: 1 }),
  });

  const stats: Array<{ label: string; value: string | number; icon: React.ReactNode; color: string }> = [
    { label: 'Schools',      value: schools?.total ?? 0, icon: <SchoolIcon />, color: '#1F3A8A' },
    { label: 'Candidates',   value: students?.total ?? 0, icon: <BadgeIcon />, color: '#0EA5E9' },
    { label: 'Uploads today', value: '—', icon: <CloudUploadIcon />, color: '#0F9D58' },
    { label: 'Sync failures', value: '—', icon: <DesignServicesIcon />, color: '#DC2626' },
  ];

  const quickActions = [
    {
      to: '/bulk-import', title: 'Bulk Import',
      body: 'Upload a spreadsheet + photos folder to onboard hundreds of candidates.',
      icon: <CloudUploadIcon />,
    },
    {
      to: '/templates', title: 'Design Templates',
      body: 'Drag-and-drop editor for ID card layouts. Import a JPG/JSON to start.',
      icon: <DesignServicesIcon />,
    },
    {
      to: '/generate', title: 'Generate Cards',
      body: 'Pick a template + population, generate PDFs and A4-sheet prints.',
      icon: <PrintIcon />,
    },
  ];

  const showZeroState = (schools?.total ?? 0) === 0 && (students?.total ?? 0) === 0;

  return (
    <Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }} justifyContent="space-between" sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h4" gutterBottom sx={{ mb: 0 }}>Dashboard</Typography>
          <Typography variant="body2">Overview of your organisation's ID card operations.</Typography>
        </Box>
        <Button component={Link} to="/bulk-import" variant="contained" startIcon={<CloudUploadIcon />}>
          New Bulk Import
        </Button>
      </Stack>

      {showZeroState && (
        <Alert severity="info" sx={{ mb: 3 }}>
          Get started by creating your first school under <strong>Schools → New school</strong>,
          then bulk-import candidates or add them one-by-one.
        </Alert>
      )}

      <Grid container spacing={2} sx={{ mb: 4 }}>
        {stats.map((s) => (
          <Grid item xs={12} sm={6} md={3} key={s.label}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Stack direction="row" alignItems="center" spacing={2}>
                  <Box
                    sx={{
                      width: 44, height: 44, borderRadius: 2,
                      display: 'grid', placeItems: 'center',
                      bgcolor: `${s.color}14`, color: s.color,
                    }}
                  >
                    {s.icon}
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">{s.label}</Typography>
                    <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                      {s.value}
                    </Typography>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Typography variant="h6" sx={{ mb: 2 }}>Quick actions</Typography>
      <Grid container spacing={2}>
        {quickActions.map((a) => (
          <Grid item xs={12} md={4} key={a.to}>
            <Card
              component={Link} to={a.to}
              sx={{
                textDecoration: 'none', color: 'inherit', display: 'block', height: '100%',
                transition: 'transform 120ms, box-shadow 120ms',
                '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 4px 12px rgba(15,23,42,0.08)' },
              }}
            >
              <CardContent>
                <Box sx={{
                  width: 40, height: 40, borderRadius: 2, mb: 1.5,
                  bgcolor: 'primary.main', color: 'white',
                  display: 'grid', placeItems: 'center',
                }}>
                  {a.icon}
                </Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{a.title}</Typography>
                <Typography variant="body2">{a.body}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
