import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Alert, Box, Button, Card, CardContent, Chip, LinearProgress, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import { SchoolsApi, TemplatesApi, IdCardJobsApi } from '@/api/endpoints';
import type { IdCardJob, TemplateModule } from '@/types';

export function GenerateIdCardsPage() {
  const [module, setModule] = useState<TemplateModule>('student');
  const [schoolId, setSchoolId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [layout, setLayout] = useState<'single' | 'a4-sheet'>('a4-sheet');
  const [format, setFormat] = useState<'pdf' | 'png' | 'zip'>('pdf');
  const [job, setJob] = useState<IdCardJob | null>(null);

  const { data: schools } = useQuery({
    queryKey: ['schools', 'select'],
    queryFn: () => SchoolsApi.list({ page: 1, page_size: 100 }),
  });
  const { data: templates } = useQuery({
    queryKey: ['templates', module],
    queryFn: () => TemplatesApi.list({ module }),
  });

  useQuery({
    queryKey: ['id-card-job', job?.id],
    queryFn: () => IdCardJobsApi.get(job!.id),
    enabled: !!job && job.status !== 'done' && job.status !== 'failed',
    refetchInterval: 2000,
    onSuccess: (j) => setJob(j),
  } as never);

  const create = useMutation({
    mutationFn: () => IdCardJobsApi.create({
      school_id: schoolId, template_id: templateId,
      output_format: format, layout,
    }),
    onSuccess: setJob,
  });

  const progress = job ? Math.round((job.processed / Math.max(job.total, 1)) * 100) : 0;

  return (
    <Box>
      <Typography variant="h4" gutterBottom>Generate ID Cards</Typography>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Stack spacing={2} maxWidth={520}>
            <TextField
              select label="Module" value={module}
              onChange={(e) => { setModule(e.target.value as TemplateModule); setTemplateId(''); }}
            >
              <MenuItem value="student">Student</MenuItem>
              <MenuItem value="employee">Employee</MenuItem>
            </TextField>

            <TextField
              select label="School / Org" value={schoolId}
              onChange={(e) => setSchoolId(e.target.value)}
            >
              {(schools?.items ?? []).map((s) => (
                <MenuItem key={s.id} value={s.id}>{s.code} — {s.name}</MenuItem>
              ))}
            </TextField>

            <TextField
              select label="Template" value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              helperText={(templates ?? []).length === 0 ? `No ${module} templates yet. Create one first.` : ''}
            >
              {(templates ?? []).map((t) => (
                <MenuItem key={t.id} value={t.id}>{t.name} (v{t.version})</MenuItem>
              ))}
            </TextField>

            <Stack direction="row" spacing={2}>
              <TextField
                select label="Layout" value={layout}
                onChange={(e) => setLayout(e.target.value as 'single' | 'a4-sheet')}
                fullWidth
              >
                <MenuItem value="single">Single card per page</MenuItem>
                <MenuItem value="a4-sheet">A4 print-ready sheet (10 cards)</MenuItem>
              </TextField>
              <TextField
                select label="Format" value={format}
                onChange={(e) => setFormat(e.target.value as 'pdf' | 'png' | 'zip')}
                fullWidth
              >
                <MenuItem value="pdf">PDF</MenuItem>
                <MenuItem value="png">PNG images (ZIP)</MenuItem>
                <MenuItem value="zip">ZIP bundle (PDF + PNGs)</MenuItem>
              </TextField>
            </Stack>

            <Button
              variant="contained" size="large"
              disabled={!schoolId || !templateId || create.isPending}
              onClick={() => create.mutate()}
            >
              {create.isPending ? 'Queuing…' : 'Queue generation'}
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {job && (
        <Card>
          <CardContent>
            <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
              <Typography variant="h6">Job {job.id.slice(0, 8)}…</Typography>
              <Chip
                label={job.status}
                color={
                  job.status === 'done' ? 'success' :
                  job.status === 'failed' ? 'error' :
                  job.status === 'running' ? 'primary' : 'default'
                }
              />
            </Stack>
            <LinearProgress variant="determinate" value={progress} sx={{ mb: 2 }} />
            <Typography variant="body2">
              {job.processed} / {job.total} cards rendered · {job.output_format.toUpperCase()} · {job.layout}
            </Typography>
            {job.error && <Alert severity="error" sx={{ mt: 2 }}>{job.error}</Alert>}
            {job.status === 'done' && job.download_url && (
              <Button
                variant="contained" startIcon={<DownloadIcon />}
                sx={{ mt: 2 }} href={job.download_url} target="_blank" rel="noreferrer"
              >
                Download output
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </Box>
  );
}
