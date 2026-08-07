import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  Box, Button, Card, CardContent, Chip, Grid, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { TemplatesApi } from '@/api/endpoints';
import type { TemplateModule } from '@/types';

export function TemplatesPage() {
  const nav = useNavigate();
  const [module, setModule] = useState<TemplateModule | ''>('');

  const { data } = useQuery({
    queryKey: ['templates', module],
    queryFn: () => TemplatesApi.list({ module: (module || undefined) as TemplateModule | undefined }),
  });

  return (
    <Box>
      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h4" sx={{ flexGrow: 1 }}>ID Card Templates</Typography>
        <TextField
          select size="small" label="Module" value={module}
          onChange={(e) => setModule(e.target.value as TemplateModule | '')}
          sx={{ minWidth: 180 }}
        >
          <MenuItem value="">All</MenuItem>
          <MenuItem value="student">Student</MenuItem>
          <MenuItem value="employee">Employee</MenuItem>
        </TextField>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => nav('/templates/new')}>
          New template
        </Button>
      </Stack>

      <Grid container spacing={2}>
        {(data ?? []).map((t) => (
          <Grid item xs={12} sm={6} md={4} key={t.id}>
            <Card component={Link} to={`/templates/${t.id}`} sx={{ textDecoration: 'none', display: 'block' }}>
              <CardContent>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                  <Chip
                    size="small"
                    label={t.module}
                    color={t.module === 'student' ? 'primary' : 'secondary'}
                  />
                  <Chip size="small" label={`v${t.version}`} />
                </Stack>
                <Typography variant="h6">{t.name}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {t.paper_size} · {t.card_width_mm}×{t.card_height_mm} mm
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
        {(data ?? []).length === 0 && (
          <Grid item xs={12}>
            <Card><CardContent>
              <Typography color="text.secondary">
                No templates yet. Create one to design the ID card layout with drag-and-drop fields.
              </Typography>
            </CardContent></Card>
          </Grid>
        )}
      </Grid>
    </Box>
  );
}
