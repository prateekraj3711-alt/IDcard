import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Alert, Box, Button, Card, CardContent, Chip, LinearProgress, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import ComputerIcon from '@mui/icons-material/Computer';
import SaveAltIcon from '@mui/icons-material/SaveAlt';
import {
  SchoolsApi, TemplatesApi, IdCardJobsApi, StudentsApi,
} from '@/api/endpoints';
import type {
  IdCardJob, TemplateModule, Student, TemplateLayout,
} from '@/types';
import { isDesktop, pickSaveTarget, writeBytesBase64 } from '@/desktopBridge';
import { bytesToBase64, renderBundlePdf, type RenderSubject } from '@/localRender';

export function GenerateIdCardsPage() {
  const desktop = isDesktop();
  const [module, setModule] = useState<TemplateModule>('student');
  const [schoolId, setSchoolId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [layout, setLayout] = useState<'single' | 'a4-sheet'>('a4-sheet');
  const [format, setFormat] = useState<'pdf' | 'png' | 'zip'>('pdf');
  const [job, setJob] = useState<IdCardJob | null>(null);

  // Local (desktop) generation state
  const [localBusy, setLocalBusy] = useState(false);
  const [localMsg, setLocalMsg] = useState('');
  const [localProgress, setLocalProgress] = useState({ done: 0, total: 0 });
  const [localSavedTo, setLocalSavedTo] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const { data: schools } = useQuery({
    queryKey: ['schools', 'select'],
    queryFn: () => SchoolsApi.list({ page: 1, page_size: 100 }),
  });
  const { data: templates } = useQuery({
    queryKey: ['templates', module],
    queryFn: () => TemplatesApi.list({ module }),
  });

  const pollQuery = useQuery({
    queryKey: ['id-card-job', job?.id],
    queryFn: () => IdCardJobsApi.get(job!.id),
    enabled: !!job && job.status !== 'done' && job.status !== 'failed',
    refetchInterval: 2000,
  });

  useEffect(() => {
    if (pollQuery.data) setJob(pollQuery.data);
  }, [pollQuery.data]);

  const create = useMutation({
    mutationFn: () => IdCardJobsApi.create({
      school_id: schoolId, template_id: templateId,
      output_format: format, layout,
    }),
    onSuccess: setJob,
  });

  const progress = job ? Math.round((job.processed / Math.max(job.total, 1)) * 100) : 0;

  async function runLocalGeneration() {
    setLocalBusy(true);
    setLocalError(null);
    setLocalSavedTo(null);
    setLocalMsg('Fetching template…');
    setLocalProgress({ done: 0, total: 0 });

    try {
      const template = await TemplatesApi.get(templateId);
      if (!template.layout_json) throw new Error('Template has no layout — open it in the editor and save first.');
      const tplLayout = template.layout_json as TemplateLayout;

      setLocalMsg('Fetching student list…');
      const students = await fetchAllStudents(schoolId);
      if (students.length === 0) throw new Error('No students found for this school.');
      setLocalProgress({ done: 0, total: students.length });

      // Ask where to save before we start the render loop.
      const savePath = await pickSaveTarget(
        `id-cards-${new Date().toISOString().slice(0, 10)}.pdf`,
        'pdf',
      );
      if (!savePath) {
        setLocalMsg('Cancelled.');
        setLocalBusy(false);
        return;
      }

      setLocalMsg('Rendering cards…');
      const subjects: RenderSubject[] = [];
      for (let i = 0; i < students.length; i++) {
        const s = students[i];
        const bindings = studentBindings(s);
        let photoDataUrl: string | undefined;
        if (s.primary_photo_url) {
          try {
            photoDataUrl = await urlToDataUrl(s.primary_photo_url);
          } catch {
            // Missing photo shouldn't abort the whole batch — the render
            // will draw a placeholder box for that card.
          }
        }
        subjects.push({
          bindings,
          photoDataUrl,
          qrPayload: {
            enrollment_no: s.enrollment_no,
            name: s.name,
            school_id: s.school_id,
          },
        });
        setLocalProgress({ done: i + 1, total: students.length });
        setLocalMsg(`Prepared ${i + 1} / ${students.length}`);
      }

      setLocalMsg('Composing PDF…');
      const pdfBytes = await renderBundlePdf(tplLayout, subjects, {
        mode: layout,
        dpi: tplLayout.dpi,
      });

      setLocalMsg('Writing to disk…');
      await writeBytesBase64(savePath, bytesToBase64(pdfBytes));
      setLocalSavedTo(savePath);
      setLocalMsg(`Saved ${subjects.length} cards.`);
    } catch (e) {
      setLocalError((e as Error).message ?? 'Local generation failed.');
    } finally {
      setLocalBusy(false);
    }
  }

  const disabled = !schoolId || !templateId || localBusy || create.isPending;

  return (
    <Box>
      <Typography variant="h4" gutterBottom>Generate ID Cards</Typography>

      {desktop && (
        <Alert severity="success" sx={{ mb: 2 }} icon={<ComputerIcon />}>
          Desktop mode — cards will render on this machine at native template
          DPI and save straight to disk. The backend is only used to pull the
          student list and photo URLs; no bytes flow back through it.
        </Alert>
      )}

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
                <MenuItem value="a4-sheet">A4 print-ready sheet</MenuItem>
              </TextField>
              {!desktop && (
                <TextField
                  select label="Format" value={format}
                  onChange={(e) => setFormat(e.target.value as 'pdf' | 'png' | 'zip')}
                  fullWidth
                >
                  <MenuItem value="pdf">PDF</MenuItem>
                  <MenuItem value="png">PNG images (ZIP)</MenuItem>
                  <MenuItem value="zip">ZIP bundle (PDF + PNGs)</MenuItem>
                </TextField>
              )}
            </Stack>

            {desktop ? (
              <Button
                variant="contained" size="large" startIcon={<SaveAltIcon />}
                disabled={disabled}
                onClick={runLocalGeneration}
              >
                {localBusy ? 'Working…' : 'Render locally & save PDF'}
              </Button>
            ) : (
              <Button
                variant="contained" size="large"
                disabled={disabled}
                onClick={() => create.mutate()}
              >
                {create.isPending ? 'Queuing…' : 'Queue generation'}
              </Button>
            )}
          </Stack>
        </CardContent>
      </Card>

      {desktop && (localBusy || localSavedTo || localError) && (
        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Typography variant="h6">Local render</Typography>
              {localBusy && (
                <>
                  <Typography variant="body2">{localMsg}</Typography>
                  <LinearProgress
                    variant={localProgress.total > 0 ? 'determinate' : 'indeterminate'}
                    value={localProgress.total > 0
                      ? Math.round((localProgress.done / localProgress.total) * 100)
                      : 0}
                  />
                </>
              )}
              {localSavedTo && !localBusy && (
                <Alert severity="success">
                  {localMsg} — saved to <code>{localSavedTo}</code>
                </Alert>
              )}
              {localError && <Alert severity="error">{localError}</Alert>}
            </Stack>
          </CardContent>
        </Card>
      )}

      {!desktop && job && (
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

/** Paginate through every student for a school. */
async function fetchAllStudents(schoolId: string): Promise<Student[]> {
  const all: Student[] = [];
  let page = 1;
  const pageSize = 100;
  while (true) {
    const res = await StudentsApi.list({ school_id: schoolId, page, page_size: pageSize, status: 'active' });
    all.push(...res.items);
    if (all.length >= res.total || res.items.length === 0) break;
    page += 1;
  }
  return all;
}

/** Map a student row into the { field → value } bag the template renderer uses. */
function studentBindings(s: Student): Record<string, string | undefined> {
  return {
    'student.name': s.name,
    'student.enrollment_no': s.enrollment_no,
    'student.roll_no': s.roll_no ?? undefined,
    'student.father_name': s.father_name ?? undefined,
    'student.mother_name': s.mother_name ?? undefined,
    'student.dob': s.dob ?? undefined,
    'student.blood_group': s.blood_group ?? undefined,
    'student.gender': s.gender ?? undefined,
    'student.address': s.address ?? undefined,
    'student.mobile': s.mobile ?? undefined,
    'student.enrolled_on': s.enrolled_on ?? undefined,
    // Flat aliases so templates authored with short binding names still work.
    'name': s.name,
    'enrollment_no': s.enrollment_no,
    'roll_no': s.roll_no ?? undefined,
    'father_name': s.father_name ?? undefined,
    'mother_name': s.mother_name ?? undefined,
    'dob': s.dob ?? undefined,
    'blood_group': s.blood_group ?? undefined,
    'address': s.address ?? undefined,
    'mobile': s.mobile ?? undefined,
  };
}

/** Fetch a URL and convert its bytes to a data: URL so <img> / Canvas can load
 *  it without hitting a CORS-tainted-canvas exception. */
async function urlToDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`photo fetch ${res.status}`);
  const blob = await res.blob();
  return await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('photo read failed'));
    r.readAsDataURL(blob);
  });
}
