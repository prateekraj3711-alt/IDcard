import { useState, type ReactNode } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Alert, Box, Button, Card, CardContent, Chip, MenuItem, Paper, Stack, Step, StepLabel, Stepper,
  Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography, LinearProgress,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import PhotoLibraryIcon from '@mui/icons-material/PhotoLibrary';
import { SchoolsApi, BulkImportsApi } from '@/api/endpoints';
import type { BulkImportPreview, BulkImportCommitResult } from '@/types';

const STUDENT_FIELDS = [
  '', 'name', 'father_name', 'mother_name', 'enrollment_no', 'roll_no',
  'dob', 'blood_group', 'gender', 'address', 'mobile', 'enrolled_year', 'photo_hint',
];

const STEPS = ['Upload spreadsheet', 'Map columns', 'Upload photos', 'Review & commit'];

export function BulkImportPage() {
  const [step, setStep] = useState(0);
  const [schoolId, setSchoolId] = useState('');
  const [preview, setPreview] = useState<BulkImportPreview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [photoStats, setPhotoStats] = useState<{ photos_uploaded: number; photos_matched: number } | null>(null);
  const [commitResult, setCommitResult] = useState<BulkImportCommitResult | null>(null);

  const { data: schools } = useQuery({
    queryKey: ['schools', 'select'],
    queryFn: () => SchoolsApi.list({ page: 1, page_size: 100 }),
  });

  const upload = useMutation({
    mutationFn: (file: File) => BulkImportsApi.uploadSpreadsheet(schoolId, file),
    onSuccess: (p) => { setPreview(p); setMapping(p.suggested_mapping); setStep(1); },
  });

  const uploadPhotos = useMutation({
    mutationFn: (file: File) => BulkImportsApi.attachPhotos(preview!.import_id, file),
    onSuccess: (r) => { setPhotoStats(r); setStep(3); },
  });

  const commit = useMutation({
    mutationFn: () => BulkImportsApi.commit(preview!.import_id, { column_mapping: mapping }),
    onSuccess: setCommitResult,
  });

  return (
    <Box>
      <Typography variant="h4" gutterBottom>Bulk Import — Students</Typography>

      <Stepper activeStep={step} sx={{ my: 3 }}>
        {STEPS.map((s) => <Step key={s}><StepLabel>{s}</StepLabel></Step>)}
      </Stepper>

      {step === 0 && (
        <Card><CardContent>
          <Stack spacing={2} maxWidth={480}>
            <TextField
              select label="School" value={schoolId}
              onChange={(e) => setSchoolId(e.target.value)}
            >
              {(schools?.items ?? []).map((s) => (
                <MenuItem key={s.id} value={s.id}>{s.code} — {s.name}</MenuItem>
              ))}
            </TextField>
            <Button
              variant="contained" component="label"
              disabled={!schoolId || upload.isPending}
              startIcon={<CloudUploadIcon />}
            >
              {upload.isPending ? 'Parsing…' : 'Choose .xlsx or .csv'}
              <input hidden type="file" accept=".xlsx,.csv" onChange={(e) => {
                const f = e.target.files?.[0]; if (f) upload.mutate(f);
              }} />
            </Button>
            <Typography variant="body2" color="text.secondary">
              First row is treated as headers. Server parses up to 10 sample rows for a live preview
              and auto-suggests a column mapping.
            </Typography>
            {upload.isError && <Alert severity="error">Upload failed. See server logs.</Alert>}
          </Stack>
        </CardContent></Card>
      )}

      {step === 1 && preview && (
        <Card><CardContent>
          <Typography variant="h6" gutterBottom>Map columns</Typography>
          <Alert severity="info" sx={{ mb: 2 }}>
            {preview.total_rows} rows detected. Assign each spreadsheet column to a student field, or leave blank to skip.
          </Alert>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Spreadsheet column</TableCell>
                <TableCell>Sample</TableCell>
                <TableCell>Student field</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {preview.columns_detected.map((col) => (
                <TableRow key={col}>
                  <TableCell><strong>{col}</strong></TableCell>
                  <TableCell>{String(preview.sample[0]?.raw?.[col] ?? '')}</TableCell>
                  <TableCell>
                    <TextField
                      select size="small" value={mapping[col] ?? ''}
                      onChange={(e) => setMapping({ ...mapping, [col]: e.target.value })}
                      sx={{ minWidth: 200 }}
                    >
                      {STUDENT_FIELDS.map((f) => (
                        <MenuItem key={f} value={f}>{f || '— skip —'}</MenuItem>
                      ))}
                    </TextField>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
            <Button onClick={() => setStep(0)}>Back</Button>
            <Button variant="contained" onClick={() => setStep(2)}>Next</Button>
          </Stack>
        </CardContent></Card>
      )}

      {step === 2 && preview && (
        <Card><CardContent>
          <Typography variant="h6" gutterBottom>Upload photo folder (ZIP)</Typography>
          <Alert severity="info" sx={{ mb: 2 }}>
            ZIP up the school's photo folder. Each file's name (without extension) must match the enrollment number.
            <br /><em>Example: <code>DPS2025-0421.jpg</code> → matches student <code>DPS2025-0421</code>.</em>
          </Alert>
          <Stack direction="row" spacing={2}>
            <Button
              variant="contained" component="label" startIcon={<PhotoLibraryIcon />}
              disabled={uploadPhotos.isPending}
            >
              {uploadPhotos.isPending ? 'Uploading…' : 'Choose ZIP'}
              <input hidden type="file" accept=".zip" onChange={(e) => {
                const f = e.target.files?.[0]; if (f) uploadPhotos.mutate(f);
              }} />
            </Button>
            <Button onClick={() => setStep(3)}>Skip</Button>
          </Stack>
          {uploadPhotos.isPending && <LinearProgress sx={{ mt: 2 }} />}
        </CardContent></Card>
      )}

      {step === 3 && preview && (
        <Card><CardContent>
          <Typography variant="h6" gutterBottom>Review & commit</Typography>
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Stack direction="row" spacing={4} flexWrap="wrap">
              <Metric label="Total rows" value={preview.total_rows} />
              <Metric label="Photos matched" value={photoStats?.photos_matched ?? '—'} />
              <Metric label="Mapped columns" value={Object.values(mapping).filter(Boolean).length} />
            </Stack>
          </Paper>

          {!commitResult ? (
            <Button
              variant="contained" size="large"
              disabled={commit.isPending}
              onClick={() => commit.mutate()}
            >
              {commit.isPending ? 'Committing…' : `Import ${preview.total_rows} students`}
            </Button>
          ) : (
            <Stack spacing={2}>
              <Alert severity={commitResult.failed > 0 ? 'warning' : 'success'}>
                Imported {commitResult.imported} · Failed {commitResult.failed} · Photos matched {commitResult.photos_matched}
              </Alert>
              <Stack direction="row" spacing={2}>
                <Chip label={`Imported: ${commitResult.imported}`} color="success" />
                <Chip label={`Failed: ${commitResult.failed}`} color={commitResult.failed ? 'error' : 'default'} />
              </Stack>
            </Stack>
          )}
        </CardContent></Card>
      )}
    </Box>
  );
}

function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="h5">{value}</Typography>
    </Box>
  );
}
