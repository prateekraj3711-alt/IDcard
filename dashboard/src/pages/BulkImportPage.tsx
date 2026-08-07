import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, LinearProgress, MenuItem, Paper, Stack, Step, StepLabel, Stepper, Table, TableBody,
  TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import PhotoLibraryIcon from '@mui/icons-material/PhotoLibrary';
import AddIcon from '@mui/icons-material/Add';
import ComputerIcon from '@mui/icons-material/Computer';
import { SchoolsApi, BulkImportsApi } from '@/api/endpoints';
import { isDesktop, pickFolder, listFolder, readBytes, type LocalFileEntry } from '@/desktopBridge';
import type { BulkImportPreview, BulkImportCommitResult, School } from '@/types';

const STUDENT_FIELDS = [
  '', 'name', 'father_name', 'mother_name', 'enrollment_no', 'roll_no',
  'class_name', 'section_name',
  'dob', 'blood_group', 'gender', 'address', 'mobile', 'enrolled_year', 'photo_hint',
];

const STEPS = ['Choose school', 'Upload spreadsheet', 'Map columns', 'Upload photos', 'Review & commit'];

export function BulkImportPage() {
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [schoolId, setSchoolId] = useState('');
  const [preview, setPreview] = useState<BulkImportPreview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [photoStats, setPhotoStats] = useState<{ photos_uploaded: number; photos_matched: number } | null>(null);
  const [commitResult, setCommitResult] = useState<BulkImportCommitResult | null>(null);
  const [newSchoolOpen, setNewSchoolOpen] = useState(false);
  const desktop = isDesktop();
  const [localFolder, setLocalFolder] = useState<string | null>(null);
  const [localFiles, setLocalFiles] = useState<LocalFileEntry[]>([]);
  const [localUpload, setLocalUpload] = useState<{
    busy: boolean;
    done: number;
    total: number;
    msg: string;
    matched: number | null;
    error: string | null;
  }>({ busy: false, done: 0, total: 0, msg: '', matched: null, error: null });

  const { data: schools } = useQuery({
    queryKey: ['schools', 'select'],
    queryFn: () => SchoolsApi.list({ page: 1, page_size: 100 }),
  });

  const upload = useMutation({
    mutationFn: (file: File) => BulkImportsApi.uploadSpreadsheet(schoolId, file),
    onSuccess: (p) => { setPreview(p); setMapping(p.suggested_mapping); setStep(2); },
  });

  const uploadPhotos = useMutation({
    mutationFn: (file: File) => BulkImportsApi.attachPhotos(preview!.import_id, file),
    onSuccess: (r) => { setPhotoStats(r); setStep(4); },
  });

  const commit = useMutation({
    mutationFn: () => BulkImportsApi.commit(preview!.import_id, { column_mapping: mapping }),
    onSuccess: setCommitResult,
  });

  const noSchools = (schools?.items?.length ?? 0) === 0;

  return (
    <Box>
      <Typography variant="h4">Bulk Import — Candidates</Typography>
      <Typography variant="body2" sx={{ mb: 3 }}>
        Upload a spreadsheet, drop a photo folder, and commit hundreds of candidates in one flow.
      </Typography>

      <Stepper activeStep={step} sx={{ my: 3 }} alternativeLabel>
        {STEPS.map((s) => <Step key={s}><StepLabel>{s}</StepLabel></Step>)}
      </Stepper>

      {/* Step 0 — school selection with inline "New school" action */}
      {step === 0 && (
        <Card>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 2 }}>Which school are these candidates for?</Typography>
            {noSchools && (
              <Alert severity="info" sx={{ mb: 2 }}>
                No schools yet. Create one now — you only need to do this once per school.
              </Alert>
            )}
            <Stack direction="row" spacing={2} alignItems="flex-start" flexWrap="wrap">
              <TextField
                select label="School" value={schoolId}
                onChange={(e) => setSchoolId(e.target.value)}
                sx={{ minWidth: 320 }}
                disabled={noSchools}
              >
                {(schools?.items ?? []).map((s) => (
                  <MenuItem key={s.id} value={s.id}>{s.code} — {s.name}</MenuItem>
                ))}
              </TextField>
              <Button
                variant="outlined" startIcon={<AddIcon />}
                onClick={() => setNewSchoolOpen(true)}
              >
                New school
              </Button>
              <Box sx={{ flexGrow: 1 }} />
              <Button
                variant="contained" size="large"
                disabled={!schoolId}
                onClick={() => setStep(1)}
              >
                Continue
              </Button>
            </Stack>
          </CardContent>
        </Card>
      )}

      {/* Step 1 — upload spreadsheet */}
      {step === 1 && (
        <Card>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 2 }}>Upload the candidate spreadsheet</Typography>
            <Alert severity="info" sx={{ mb: 2 }}>
              Excel (.xlsx) or CSV. The first row is treated as headers. Suggested columns:
              <em> Student Name, Enr No., DOB, Father's Name, Mother's Name, Address, Mobile</em>.
              The server auto-suggests a column mapping — you can adjust in the next step.
            </Alert>
            <Stack direction="row" spacing={2} alignItems="center">
              <Button
                variant="contained" component="label" size="large"
                startIcon={<CloudUploadIcon />} disabled={upload.isPending}
              >
                {upload.isPending ? 'Parsing…' : 'Choose .xlsx or .csv'}
                <input
                  hidden type="file" accept=".xlsx,.csv"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); }}
                />
              </Button>
              <Button onClick={() => setStep(0)}>Back</Button>
            </Stack>
            {upload.isError && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {(upload.error as { response?: { data?: { detail?: string } } }).response?.data?.detail ?? 'Upload failed'}
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 2 — column mapping */}
      {step === 2 && preview && (
        <Card>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 1 }}>Map columns</Typography>
            <Typography variant="body2" sx={{ mb: 2 }}>
              {preview.total_rows} rows detected. Assign each column to a candidate field, or leave blank to skip.
            </Typography>
            <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Spreadsheet column</TableCell>
                    <TableCell>Sample</TableCell>
                    <TableCell>Candidate field</TableCell>
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
                          sx={{ minWidth: 220 }}
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
            </Paper>
            <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
              <Button onClick={() => setStep(1)}>Back</Button>
              <Button variant="contained" onClick={() => setStep(3)}>Next</Button>
            </Stack>
          </CardContent>
        </Card>
      )}

      {/* Step 3 — photos */}
      {step === 3 && preview && (
        <Card>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 1 }}>Attach photos</Typography>
            <Alert severity="info" sx={{ mb: 2 }}>
              Each photo's filename (without extension) must match the enrollment number.
              <br /><em>Example: <code>DPS2025-0421.jpg</code> → matches candidate <code>DPS2025-0421</code>.</em>
            </Alert>

            {desktop && (
              <Alert severity="success" sx={{ mb: 2 }}>
                Desktop mode — photos stream directly from your machine to R2 via
                presigned URLs. Bytes never pass through the backend.
              </Alert>
            )}

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              {desktop && (
                <Button
                  variant="contained" size="large" startIcon={<ComputerIcon />}
                  onClick={async () => {
                    const folder = await pickFolder();
                    if (!folder) return;
                    setLocalFolder(folder);
                    const files = await listFolder(folder, ['jpg', 'jpeg', 'png']);
                    setLocalFiles(files);
                    setLocalUpload({ busy: false, done: 0, total: 0, msg: '', matched: null, error: null });
                  }}
                >
                  {localFolder ? 'Change folder' : 'Pick photo folder'}
                </Button>
              )}
              <Button
                variant={desktop ? 'outlined' : 'contained'} component="label" size="large"
                startIcon={<PhotoLibraryIcon />} disabled={uploadPhotos.isPending}
              >
                {uploadPhotos.isPending ? 'Uploading…' : desktop ? 'Or upload a ZIP' : 'Choose ZIP'}
                <input
                  hidden type="file" accept=".zip"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhotos.mutate(f); }}
                />
              </Button>
              <Button onClick={() => setStep(4)}>Skip — no photos this time</Button>
              <Box sx={{ flexGrow: 1 }} />
              <Button onClick={() => setStep(2)}>Back</Button>
            </Stack>

            {localFolder && localFiles.length > 0 && (
              <Box sx={{ mt: 2 }}>
                <Alert severity="info" sx={{ mb: 2 }}>
                  Selected: <code>{localFolder}</code> — {localFiles.length} image files found.
                </Alert>
                <Button
                  variant="contained" color="primary"
                  disabled={localUpload.busy}
                  onClick={async () => {
                    setLocalUpload({
                      busy: true, done: 0, total: localFiles.length,
                      msg: 'Requesting presigned URLs…', matched: null, error: null,
                    });
                    try {
                      const enrollmentByStem = new Map<string, LocalFileEntry>();
                      for (const f of localFiles) {
                        enrollmentByStem.set(normalizeStem(f.stem), f);
                      }
                      const presignRequests = Array.from(enrollmentByStem.values()).map((f) => ({
                        enrollment_no: f.stem,
                        content_type: mimeForExt(f.extension),
                      }));
                      const urls = await BulkImportsApi.presignLocalPhotos(
                        preview!.import_id, presignRequests,
                      );

                      const recorded: Array<{ enrollment_no: string; storage_key: string }> = [];
                      for (let i = 0; i < urls.length; i++) {
                        const u = urls[i];
                        const file = enrollmentByStem.get(normalizeStem(u.enrollment_no));
                        if (!file) continue;
                        setLocalUpload((s) => ({
                          ...s, done: i, msg: `Uploading ${file.name}…`,
                        }));
                        const bytes = await readBytes(file.path);
                        // TS's DOM BlobPart requires ArrayBufferView<ArrayBuffer>, but a
                        // Uint8Array's backing buffer is ArrayBufferLike (could be a
                        // SharedArrayBuffer). Copy into a fresh ArrayBuffer to satisfy
                        // the type checker; the copy is O(n) but only happens once per
                        // photo, so it's fine.
                        const ab = new ArrayBuffer(bytes.byteLength);
                        new Uint8Array(ab).set(bytes);
                        const resp = await fetch(u.put_url, {
                          method: 'PUT',
                          headers: u.required_headers,
                          body: new Blob([ab], {
                            type: u.required_headers['Content-Type'] ?? 'application/octet-stream',
                          }),
                        });
                        if (!resp.ok) throw new Error(`PUT ${file.name} failed (${resp.status})`);
                        recorded.push({
                          enrollment_no: u.enrollment_no,
                          storage_key: u.storage_key,
                        });
                      }

                      setLocalUpload((s) => ({
                        ...s, done: urls.length, msg: 'Recording matches…',
                      }));
                      const rec = await BulkImportsApi.recordLocalPhotos(preview!.import_id, recorded);
                      setLocalUpload({
                        busy: false, done: urls.length, total: urls.length,
                        msg: `Uploaded ${rec.photos_uploaded}, matched ${rec.photos_matched}.`,
                        matched: rec.photos_matched, error: null,
                      });
                      setPhotoStats({
                        photos_uploaded: rec.photos_uploaded,
                        photos_matched: rec.photos_matched,
                      });
                    } catch (e) {
                      setLocalUpload((s) => ({
                        ...s, busy: false, error: (e as Error).message ?? 'Local upload failed',
                      }));
                    }
                  }}
                >
                  {localUpload.busy ? `Uploading ${localUpload.done}/${localUpload.total}…` : 'Upload photos directly to storage'}
                </Button>
                {localUpload.busy && (
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="body2">{localUpload.msg}</Typography>
                    <LinearProgress
                      variant={localUpload.total > 0 ? 'determinate' : 'indeterminate'}
                      value={localUpload.total > 0
                        ? Math.round((localUpload.done / localUpload.total) * 100)
                        : 0}
                    />
                  </Box>
                )}
                {!localUpload.busy && localUpload.matched !== null && (
                  <Alert severity="success" sx={{ mt: 2 }}>
                    {localUpload.msg} Ready to commit.
                  </Alert>
                )}
                {localUpload.error && (
                  <Alert severity="error" sx={{ mt: 2 }}>{localUpload.error}</Alert>
                )}
                {!localUpload.busy && localUpload.matched !== null && (
                  <Button sx={{ mt: 2 }} onClick={() => setStep(4)} variant="contained">
                    Continue to commit
                  </Button>
                )}
              </Box>
            )}

            {uploadPhotos.isPending && <LinearProgress sx={{ mt: 2 }} />}
          </CardContent>
        </Card>
      )}

      {/* Step 4 — review + commit */}
      {step === 4 && preview && (
        <Card>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 2 }}>Review & commit</Typography>
            <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
              <Stack direction="row" spacing={4} flexWrap="wrap">
                <Metric label="Total rows" value={preview.total_rows} />
                <Divider orientation="vertical" flexItem />
                <Metric label="Photos matched" value={photoStats?.photos_matched ?? '—'} />
                <Divider orientation="vertical" flexItem />
                <Metric label="Mapped columns" value={Object.values(mapping).filter(Boolean).length} />
              </Stack>
            </Paper>
            {!commitResult ? (
              <Stack direction="row" spacing={2}>
                <Button onClick={() => setStep(3)}>Back</Button>
                <Button
                  variant="contained" size="large" disabled={commit.isPending}
                  onClick={() => commit.mutate()}
                >
                  {commit.isPending ? 'Committing…' : `Import ${preview.total_rows} candidates`}
                </Button>
              </Stack>
            ) : (
              <Stack spacing={2}>
                <Alert severity={commitResult.failed > 0 ? 'warning' : 'success'}>
                  Imported {commitResult.imported} · Failed {commitResult.failed} · Photos matched {commitResult.photos_matched}
                </Alert>
                <Stack direction="row" spacing={1}>
                  <Chip label={`Imported: ${commitResult.imported}`} color="success" />
                  <Chip label={`Failed: ${commitResult.failed}`} color={commitResult.failed ? 'error' : 'default'} />
                </Stack>
              </Stack>
            )}
          </CardContent>
        </Card>
      )}

      <NewSchoolDialog
        open={newSchoolOpen}
        onClose={() => setNewSchoolOpen(false)}
        onCreated={(s) => {
          qc.invalidateQueries({ queryKey: ['schools'] });
          setSchoolId(s.id);
          setNewSchoolOpen(false);
        }}
      />
    </Box>
  );
}

function normalizeStem(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function mimeForExt(ext: string): string {
  const e = ext.toLowerCase().replace(/^\./, '');
  if (e === 'png') return 'image/png';
  if (e === 'jpg' || e === 'jpeg') return 'image/jpeg';
  return 'application/octet-stream';
}

function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="h5" sx={{ fontWeight: 700 }}>{value}</Typography>
    </Box>
  );
}

function NewSchoolDialog({
  open, onClose, onCreated,
}: { open: boolean; onClose: () => void; onCreated: (s: School) => void }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');

  const mut = useMutation({
    mutationFn: () => SchoolsApi.create({ code: code.toUpperCase(), name, city, state }),
    onSuccess: onCreated,
  });

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Create school</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="School code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
            helperText="Short unique code teachers will use to log in. Uppercase letters, digits, dashes."
            required
          />
          <TextField label="School name" value={name} onChange={(e) => setName(e.target.value)} required />
          <Stack direction="row" spacing={2}>
            <TextField label="City" value={city} onChange={(e) => setCity(e.target.value)} fullWidth />
            <TextField label="State" value={state} onChange={(e) => setState(e.target.value)} fullWidth />
          </Stack>
          {mut.isError && (
            <Alert severity="error">
              {(mut.error as { response?: { data?: { detail?: string } } }).response?.data?.detail ?? 'Create failed'}
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained" disabled={!code || !name || mut.isPending}
          onClick={() => mut.mutate()}
        >
          {mut.isPending ? 'Creating…' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
