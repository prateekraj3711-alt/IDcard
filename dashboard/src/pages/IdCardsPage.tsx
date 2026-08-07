import { Box, Card, CardActionArea, CardContent, Grid, Typography } from '@mui/material';
import DesignServicesIcon from '@mui/icons-material/DesignServices';
import PrintIcon from '@mui/icons-material/Print';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { Link } from 'react-router-dom';

const tiles = [
  {
    to: '/bulk-import', title: 'Bulk Import',
    body: 'Upload a spreadsheet of students, attach a photos folder, and commit in one flow.',
    icon: <UploadFileIcon fontSize="large" />,
  },
  {
    to: '/templates', title: 'Templates',
    body: 'Design ID cards visually. Choose Student or Employee module, drop in fields, save.',
    icon: <DesignServicesIcon fontSize="large" />,
  },
  {
    to: '/generate', title: 'Generate',
    body: 'Pick a template + population; queue a bulk render (PDF, PNG, or A4 sheet).',
    icon: <PrintIcon fontSize="large" />,
  },
];

export function IdCardsPage() {
  return (
    <Box>
      <Typography variant="h4" gutterBottom>ID Cards</Typography>
      <Grid container spacing={2}>
        {tiles.map((t) => (
          <Grid item xs={12} md={4} key={t.to}>
            <Card>
              <CardActionArea component={Link} to={t.to} sx={{ p: 2 }}>
                <CardContent>
                  {t.icon}
                  <Typography variant="h6" sx={{ mt: 1 }}>{t.title}</Typography>
                  <Typography variant="body2" color="text.secondary">{t.body}</Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
