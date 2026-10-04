import { friendlyError } from '@/app/media';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, LinearProgress, ListSubheader, MenuItem, Paper, Stack, Step, StepLabel, Stepper, Table, TableBody,
  TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import FolderZipIcon from '@mui/icons-material/FolderZip';
import PhotoLibraryIcon from '@mui/icons-material/PhotoLibrary';
import PrintIcon from '@mui/icons-material/Print';
import AddIcon from '@mui/icons-material/Add';
import { SchoolsApi, BulkImportsApi, TemplatesApi } from '@/app/api/endpoints';
import { useNavigate } from '@/app/router-shim';
import type { BulkImportPreview, BulkImportCommitResult, School, Template } from '@/app/types';

/** Candidate fields a data column can fill. `extra:*` are free-form details printed by templates. */
const FIELD_OPTIONS: Array<[string, string]> = [
  ['name', 'Name'], ['enrollment_no', 'ID / Enrollment No'], ['dob', 'Date of birth'], ['gender', 'Gender'],
  ['blood_group', 'Blood group'], ['mobile', 'Mobile'], ['address', 'Address'],
  ['father_name', "Father's name"], ['mother_name', "Mother's name"], ['roll_no', 'Roll No'],
  ['class_name', 'Class / Group'], ['section_name', 'Section / Team'], ['enrolled_on', 'Enrolled / joined on'],
  ['enrolled_year', 'Year / batch'], ['photo_hint', 'Photo file name'],
  ['extra:designation', 'Designation'], ['extra:department', 'Department'], ['extra:doj', 'Date of joining'],
  ['extra:age', 'Age'], ['extra:email', 'Email'], ['extra:emergency_contact', 'Emergency contact'],
  ['extra:valid_till', 'Valid till'],
];
const FIELD_LABEL = Object.fromEntries(FIELD_OPTIONS);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

/** What candidate field a template binding needs (null = filled automatically / not from data). */
function bindingTarget(binding: string): string | null {
  const key = binding.replace(/^(student|employee|extra)\./, '');
  if (/^(school|org|principal|authority)\./.test(binding) || ['photo', 'qr', 'barcode'].includes(binding)) return null;
  const direct: Record<string, string> = {
    name: 'name', enrollment_no: 'enrollment_no', employee_id: 'enrollment_no', roll_no: 'roll_no',
    dob: 'dob', blood_group: 'blood_group', gender: 'gender', address: 'address', mobile: 'mobile',
    father_name: 'father_name', mother_name: 'mother_name', class_section: 'class_name', enrolled_on: 'enrolled_on',
    age: 'age',
  };
  return direct[key] ?? `extra:${key}`;
}

const STEPS = ['Choose organization', 'Data & photos', 'Match fields', 'Import & generate'];

export function BulkImportPage() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [schoolId, setSchoolId] = useState('');
  const [preview, setPreview] = useState<BulkImportPreview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [photoStats, setPhotoStats] = useState<{ photos_uploaded: number; photos_matched: number } | null>(null);
  const [commitResult, setCommitResult] = useState<BulkImportCommitResult | null>(null);
  const [newSchoolOpen, setNewSchoolOpen] = useState(false);
  const [commitProgress, setCommitProgress] = useState({ done: 0, total: 0 });

  const { data: schools } = useQuery({
    queryKey: ['schools', 'select'],
    queryFn: () => SchoolsApi.list({ page: 1, page_size: 100 }),
  });
  const { data: templates } = useQuery({
    queryKey: ['templates', 'all', schoolId],
    queryFn: () => TemplatesApi.list({ school_id: schoolId || undefined }),
    enabled: !!schoolId,
  });
  const template: Template | undefined = useMemo(
    () => templates?.find((t) => t.school_id === schoolId) ?? templates?.[0],
    [templates, schoolId],
  );
  const templateNeeds = useMemo(() => {
    const out = new Map<string, string>();
    for (const el of template?.layout_json?.elements ?? []) {
      if (el.kind !== 'text' || !el.binding) continue;
      const t = bindingTarget(el.binding);
      if (t) out.set(t, el.prefix?.replace(/:$/, '') || el.label || FIELD_LABEL[t] || t.replace(/^extra:/, ''));
    }
    return out;
  }, [template]);

  const onPreview = (p: BulkImportPreview & { photos_found?: number; photos_matched?: number }) => {
    setPreview(p); setMapping(p.suggested_mapping);
    if (p.photos_found !== undefined) setPhotoStats({ photos_uploaded: p.photos_found, photos_matched: p.photos_matched ?? 0 });
    else setPhotoStats(null);
    setStep(2);
  };
  const bundle = useMutation({
    mutationFn: (src: File | File[]) => BulkImportsApi.uploadBundle(schoolId, src),
    onSuccess: onPreview,
  });
  const sheetOnly = useMutation({
    mutationFn: (file: File) => BulkImportsApi.uploadSpreadsheet(schoolId, file),
    onSuccess: onPreview,
  });
  const uploadPhotos = useMutation({
    mutationFn: (file: File) => BulkImportsApi.attachPhotos(preview!.import_id, file),
    onSuccess: setPhotoStats,
  });
  const commit = useMutation({
    mutationFn: () => BulkImportsApi.commit(preview!.import_id, { column_mapping: mapping },
      (done, total) => setCommitProgress({ done, total })),
    onSuccess: (r) => { setCommitResult(r); qc.invalidateQueries({ queryKey: ['students'] }); },
  });

  // Re-count photo matches when the mapping changes (photo name / ID / name columns).
  useEffect(() => {
    if (!preview || !photoStats?.photos_uploaded) return;
    let live = true;
    BulkImportsApi.photoMatches(preview.import_id, mapping).then((n) => {
      if (live) setPhotoStats((s) => (s ? { ...s, photos_matched: n } : s));
    }).catch(() => {});
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapping, preview]);

  const mappedTargets = new Set(Object.values(mapping).filter(Boolean));
  const satisfied = (t: string) =>
    mappedTargets.has(t) || (t === 'age' && (mappedTargets.has('dob') || mappedTargets.has('extra:age')))
    || (t === 'extra:doj' && mappedTargets.has('enrolled_on'));
  const missingRequired = !mappedTargets.has('name') || !mappedTargets.has('enrollment_no');
  const busy = bundle.isPending || sheetOnly.isPending;
  const noSchools = (schools?.items?.length ?? 0) === 0;
  const extraTargets = Array.from(new Set(Object.values(mapping).filter((v) => v?.startsWith('extra:') && !FIELD_LABEL[v])));

  return (
    <Box>
      <Typography variant="h4">Bulk generate</Typography>
      <Typography variant="body2" sx={{ mb: 3 }}>
        Give a ZIP or a folder containing your data sheet and photos. Fields are matched to your card template automatically.
      </Typography>

      <Stepper activeStep={step} sx={{ my: 3 }} alternativeLabel>
        {STEPS.map((s) => <Step key={s}><StepLabel>{s}</StepLabel></Step>)}
      </Stepper>

      {step === 0 && (
        <Card>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 2 }}>Which organization are these candidates for?</Typography>
            {noSchools && <Alert severity="info" sx={{ mb: 2 }}>No organizations yet. Create one now.</Alert>}
            <Stack direction="row" spacing={2} alignItems="flex-start" flexWrap="wrap" useFlexGap>
              <TextField select label="Organization" value={schoolId} onChange={(e) => setSchoolId(e.target.value)}
                sx={{ minWidth: 320 }} disabled={noSchools}>
                {(schools?.items ?? []).map((s) => <MenuItem key={s.id} value={s.id}>{s.code} — {s.name}</MenuItem>)}
              </TextField>
              <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setNewSchoolOpen(true)}>New organization</Button>
              <Box sx={{ flexGrow: 1 }} />
              <Button variant="contained" size="large" disabled={!schoolId} onClick={() => setStep(1)}>Continue</Button>
            </Stack>
          </CardContent>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 2 }}>Give us the data and photos</Typography>
            <Alert severity="info" sx={{ mb: 2 }}>
              Put one Excel (.xlsx) or CSV sheet and the photos together, as a ZIP file or a folder. The first row of the sheet must be
              the column names (for example <em>Name, Employee ID, DOB, Designation, Address, Photo</em>). Photos are matched by a photo
              file name column, by ID number, or by name. Browsers can't open a typed folder path, so pick the folder instead — it works the same way.
            </Alert>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <Button variant="contained" component="label" size="large" startIcon={<FolderZipIcon />} disabled={busy}>
                Choose ZIP
                <input hidden type="file" accept=".zip,application/zip"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) bundle.mutate(f); e.target.value = ''; }} />
              </Button>
              <Button variant="contained" component="label" size="large" startIcon={<FolderOpenIcon />} disabled={busy}>
                Choose folder
                <input hidden type="file" multiple
                  {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
                  onChange={(e) => { const fs = Array.from(e.target.files ?? []); if (fs.length) bundle.mutate(fs); e.target.value = ''; }} />
              </Button>
              <Button variant="outlined" component="label" size="large" startIcon={<CloudUploadIcon />} disabled={busy}>
                Data sheet only
                <input hidden type="file" accept=".xlsx,.xls,.csv"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) sheetOnly.mutate(f); e.target.value = ''; }} />
              </Button>
              <Box sx={{ flexGrow: 1 }} />
              <Button onClick={() => setStep(0)}>Back</Button>
            </Stack>
            {busy && <Box sx={{ mt: 2 }}><Typography variant="body2">Reading files…</Typography><LinearProgress sx={{ mt: 1 }} /></Box>}
            {(bundle.isError || sheetOnly.isError) && (
              <Alert severity="error" sx={{ mt: 2 }}>{friendlyError(bundle.error ?? sheetOnly.error, 'Could not read the files')}</Alert>
            )}
          </CardContent>
        </Card>
      )}

      {step === 2 && preview && (
        <Card>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 1 }}>Match fields</Typography>
            <Typography variant="body2" sx={{ mb: 2 }}>
              {preview.total_rows} rows found. Each column was matched to a card field automatically — change any that look wrong.
            </Typography>

            {template ? (
              <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Fields on template “{template.name}”</Typography>
                {templateNeeds.size === 0 ? (
                  <Typography variant="body2" color="text.secondary">This template has no data fields yet.</Typography>
                ) : (
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {Array.from(templateNeeds).map(([t, label]) => (
                      <Chip key={t} label={label} size="small" color={satisfied(t) ? 'success' : 'warning'}
                        variant={satisfied(t) ? 'filled' : 'outlined'} />
                    ))}
                  </Stack>
                )}
                {Array.from(templateNeeds.keys()).some((t) => !satisfied(t)) && (
                  <Typography variant="caption" color="warning.main" sx={{ display: 'block', mt: 1 }}>
                    Orange fields have no column yet — pick one below, or they will print empty.
                  </Typography>
                )}
              </Paper>
            ) : (
              <Alert severity="warning" sx={{ mb: 2 }}>No card template found for this organization. You can still import now and add a template later.</Alert>
            )}

            {photoStats && (
              <Alert severity={photoStats.photos_matched ? 'success' : 'warning'} sx={{ mb: 2 }}>
                {photoStats.photos_uploaded} photos found · {photoStats.photos_matched} matched to rows
              </Alert>
            )}

            <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Column in your sheet</TableCell>
                    <TableCell>Example</TableCell>
                    <TableCell>Card field</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {preview.columns_detected.map((col) => (
                    <TableRow key={col}>
                      <TableCell><strong>{col}</strong></TableCell>
                      <TableCell sx={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {String(preview.sample[0]?.raw?.[col] ?? '')}
                      </TableCell>
                      <TableCell>
                        <TextField select size="small" value={mapping[col] ?? ''} sx={{ minWidth: 240 }}
                          onChange={(e) => setMapping({ ...mapping, [col]: e.target.value })}>
                          <MenuItem value="">— skip —</MenuItem>
                          <ListSubheader>Card fields</ListSubheader>
                          {FIELD_OPTIONS.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
                          <ListSubheader>Other details</ListSubheader>
                          <MenuItem value={`extra:${slug(col)}`}>Keep as “{col}”</MenuItem>
                          {extraTargets.filter((v) => v !== `extra:${slug(col)}`).map((v) => (
                            <MenuItem key={v} value={v}>{v.slice(6)}</MenuItem>
                          ))}
                        </TextField>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
            {missingRequired && <Alert severity="warning" sx={{ mt: 2 }}>Pick a column for both Name and ID / Enrollment No.</Alert>}

            {!photoStats?.photos_uploaded && (
              <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 2 }}>
                <Button variant="outlined" component="label" startIcon={<PhotoLibraryIcon />} disabled={uploadPhotos.isPending}>
                  {uploadPhotos.isPending ? 'Reading photos…' : 'Add photos (ZIP)'}
                  <input hidden type="file" accept=".zip"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhotos.mutate(f); e.target.value = ''; }} />
                </Button>
                {uploadPhotos.isError && <Alert severity="error">{friendlyError(uploadPhotos.error, 'Photo ZIP failed')}</Alert>}
              </Stack>
            )}

            <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
              <Button onClick={() => setStep(1)}>Back</Button>
              <Button variant="contained" disabled={missingRequired} onClick={() => setStep(3)}>Next</Button>
            </Stack>
          </CardContent>
        </Card>
      )}

      {step === 3 && preview && (
        <Card>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 2 }}>Import & generate</Typography>
            <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
              <Stack direction="row" spacing={4} flexWrap="wrap" useFlexGap>
                <Metric label="Rows" value={preview.total_rows} />
                <Divider orientation="vertical" flexItem />
                <Metric label="Photos matched" value={photoStats?.photos_matched ?? '—'} />
                <Divider orientation="vertical" flexItem />
                <Metric label="Matched columns" value={Object.values(mapping).filter(Boolean).length} />
              </Stack>
            </Paper>
            {!commitResult && (
              <Stack direction="row" spacing={2}>
                <Button onClick={() => setStep(2)} disabled={commit.isPending}>Back</Button>
                <Button variant="contained" size="large" disabled={commit.isPending} onClick={() => commit.mutate()}>
                  {commit.isPending ? 'Importing…' : `Import ${preview.total_rows} candidates`}
                </Button>
              </Stack>
            )}
            {commit.isPending && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2">Saving candidates and photos… {commitProgress.done} / {commitProgress.total}</Typography>
                <LinearProgress variant="determinate" sx={{ mt: 1 }}
                  value={commitProgress.total ? (commitProgress.done / commitProgress.total) * 100 : 0} />
              </Box>
            )}
            {commit.isError && <Alert severity="error" sx={{ mt: 2 }}>{friendlyError(commit.error, 'Import failed')}</Alert>}
            {commitResult && (
              <Stack spacing={2}>
                <Alert severity={commitResult.failed > 0 ? 'warning' : 'success'}>
                  Imported {commitResult.imported} · Failed {commitResult.failed} · Photos matched {commitResult.photos_matched}
                </Alert>
                <Stack direction="row" spacing={2}>
                  <Button variant="contained" size="large" startIcon={<PrintIcon />}
                    disabled={!commitResult.student_ids?.length}
                    onClick={() => nav('/generate', { search: { ids: commitResult.student_ids!.join(','), school: schoolId } })}>
                    Generate ID cards ({commitResult.student_ids?.length ?? 0})
                  </Button>
                  <Button onClick={() => { setStep(1); setPreview(null); setCommitResult(null); setPhotoStats(null); }}>Import another</Button>
                </Stack>
              </Stack>
            )}
          </CardContent>
        </Card>
      )}

      <NewSchoolDialog
        open={newSchoolOpen}
        onClose={() => setNewSchoolOpen(false)}
        onCreated={(s) => { qc.invalidateQueries({ queryKey: ['schools'] }); setSchoolId(s.id); setNewSchoolOpen(false); }}
      />
    </Box>
  );
}

function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="h5" sx={{ fontWeight: 700 }}>{value}</Typography>
    </Box>
  );
}

function NewSchoolDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (s: School) => void }) {
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
      <DialogTitle>Create organization</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField label="Organization code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
            helperText="Short unique code users will use to sign in. Uppercase letters, digits, dashes." required />
          <TextField label="Organization name" value={name} onChange={(e) => setName(e.target.value)} required />
          <Stack direction="row" spacing={2}>
            <TextField label="City" value={city} onChange={(e) => setCity(e.target.value)} fullWidth />
            <TextField label="State" value={state} onChange={(e) => setState(e.target.value)} fullWidth />
          </Stack>
          {mut.isError && <Alert severity="error">{friendlyError(mut.error, 'Create failed')}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!code || !name || mut.isPending} onClick={() => mut.mutate()}>
          {mut.isPending ? 'Creating…' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
