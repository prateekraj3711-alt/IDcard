import { Grid, Card, CardContent, Typography, Box } from '@mui/material';

const stats = [
  { label: 'Schools', value: '—' },
  { label: 'Students', value: '—' },
  { label: 'Uploads today', value: '—' },
  { label: 'Sync failures', value: '—' },
];

export function DashboardPage() {
  return (
    <Box>
      <Typography variant="h4" gutterBottom>Dashboard</Typography>
      <Grid container spacing={2}>
        {stats.map((s) => (
          <Grid item xs={12} sm={6} md={3} key={s.label}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" variant="body2">{s.label}</Typography>
                <Typography variant="h4" sx={{ mt: 1 }}>{s.value}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
