import { Box, Card, CardContent, Typography, Button, Stack } from '@mui/material';

export function IdCardsPage() {
  return (
    <Box>
      <Typography variant="h4" gutterBottom>ID Cards</Typography>
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography>Choose a template and target set, then queue a bulk render job.</Typography>
            <Stack direction="row" spacing={2}>
              <Button variant="contained">Single card</Button>
              <Button variant="outlined">Class-wise</Button>
              <Button variant="outlined">School-wise (A4 sheet)</Button>
            </Stack>
            <Typography variant="body2" color="text.secondary">
              Generation runs asynchronously — a job id is returned; the download URL appears once ready.
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
