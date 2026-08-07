import { Box, Typography, Card, CardContent } from '@mui/material';

export function AnalyticsPage() {
  return (
    <Box>
      <Typography variant="h4" gutterBottom>Analytics</Typography>
      <Card><CardContent>
        <Typography>Reports and cross-school analytics render here. Backed by <code>/analytics/overview</code>.</Typography>
      </CardContent></Card>
    </Box>
  );
}
