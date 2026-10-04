import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Box, Button, Card, CardContent, Checkbox, Chip, LinearProgress, MenuItem, Stack, Table, TableBody,
  TableCell, TableHead, TablePagination, TableRow, TextField, Typography,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import PrintIcon from '@mui/icons-material/Print';
import { ClassesApi, IdCardJobsApi, SchoolsApi, StudentsApi, TemplatesApi } from '@/app/api/endpoints';
import { CARD_BUCKET, downloadFromStorage, friendlyError } from '@/app/media';
import type { IdCardJob, TemplateModule } from '@/app/types';

export function GenerateIdCardsPage({ initialIds, initialSchool }: { initialIds?: string[]; initialSchool?: string }) {
  const qc = useQueryClient();
  const [module, setModule] = useState<TemplateModule>('student');
  const [schoolId, setSchoolId] = useState(initialSchool ?? '');
  const [classId, setClassId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [status, setStatus] = useState('active');
  const [templateId, setTemplateId] = useState('');
  const [layout, setLayout] = useState<'single' | 'a4-sheet'>('a4-sheet');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [progress, setProgress] = useState({ msg: '', done: 0, total: 0 });
  const [dl, setDl] = useState<string | null>(null);
  const [dlError, setDlError] = useState<string | null>(null);

  const { data: schools } = useQuery({ queryKey: ['schools', 'select'], queryFn: () => SchoolsApi.list({ page: 1, page_size: 200 }) });
  const { data: classes } = useQuery({ queryKey: ['classes', schoolId], queryFn: () => ClassesApi.list(schoolId), enabled: !!schoolId });
  const { data: templates } = useQuery({
    queryKey: ['templates', module, schoolId],
    queryFn: () => TemplatesApi.list({ module, school_id: schoolId || undefined }),
  });
  // Auto-map to the school's own saved template, else the shared one.
  useEffect(() => {
    if (!templates?.length) { setTemplateId(''); return; }
    if (templates.some((t) => t.id === templateId)) return;
    const own = templates.find((t) => t.school_id && t.school_id === schoolId);
    setTemplateId((own ?? templates[0]).id);
  }, [templates, schoolId, templateId]);
  const { data: jobs } = useQuery({ queryKey: ['id-card-jobs'], queryFn: () => IdCardJobsApi.list() });

  const { data: candidates, isLoading: loadingCandidates } = useQuery({
    queryKey: ['generate-candidates', schoolId, classId, sectionId, status],
    queryFn: () => StudentsApi.list({
      school_id: schoolId, class_id: classId || undefined, section_id: sectionId || undefined,
      status: status || undefined, page: 1, page_size: 500, with_photos: false,
    }),
    enabled: !!schoolId,
  });
  const items = candidates?.items ?? [];

  // Selection resets with the filters: IDs pre-chosen on the Candidates page if any,
  // otherwise everything currently listed (uncheck what you don't want).
  useEffect(() => {
    if (initialIds?.length) {
      const allowed = new Set(initialIds);
      setSelected(new Set(items.filter((s) => allowed.has(s.id)).map((s) => s.id)));
    } else {
      setSelected(new Set(items.map((s) => s.id)));
    }
    setPage(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates, initialIds]);

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const run = useMutation({
    mutationFn: () => IdCardJobsApi.run({
      school_id: schoolId, template_id: templateId, class_id: classId || undefined,
      section_id: sectionId || undefined, status: status || undefined, layout,
      student_ids: [...selected],
    }, setProgress),
    onSettled: () => qc.invalidateQueries({ queryKey: ['id-card-jobs'] }),
  });

  const download = async (job: IdCardJob) => {
    if (!job.output_key) return;
    setDl(job.id); setDlError(null);
    try { await downloadFromStorage(CARD_BUCKET, job.output_key, `id-cards-${job.id.slice(0, 8)}.pdf`); }
    catch (e) { setDlError(friendlyError(e, 'Download failed')); }
    finally { setDl(null); }
  };

  const sections = classes?.find((c) => c.id === classId)?.sections ?? [];
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const schoolName = (id: string) => schools?.items.find((s) => s.id === id)?.name ?? '—';
  const pageItems = items.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  const allSelected = items.length > 0 && selected.size === items.length;

  return (
    <Box>
      <Typography variant="h4" gutterBottom>Generate ID Cards</Typography>
      <Alert severity="info" sx={{ mb: 2 }}>
        Pick the candidates to include, then render. Cards are generated in your browser at 500 DPI or higher on
        standard 54 × 86 mm cards (10 per A4 page), saved as one PDF in the organization's ID-card storage, and stay available for download below.
      </Alert>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Stack spacing={2} maxWidth={560}>
            <TextField select label="Module" value={module} onChange={(e) => { setModule(e.target.value as TemplateModule); setTemplateId(''); }}>
              <MenuItem value="student">Student</MenuItem>
              <MenuItem value="employee">Employee</MenuItem>
            </TextField>
            <TextField select label="Organization" value={schoolId} onChange={(e) => { setSchoolId(e.target.value); setClassId(''); setSectionId(''); }}>
              {(schools?.items ?? []).map((s) => <MenuItem key={s.id} value={s.id}>{s.code} — {s.name}</MenuItem>)}
            </TextField>
            <Stack direction="row" spacing={2}>
              <TextField select fullWidth label="Class" value={classId} disabled={!schoolId} onChange={(e) => { setClassId(e.target.value); setSectionId(''); }}>
                <MenuItem value="">All classes</MenuItem>
                {(classes ?? []).map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
              </TextField>
              <TextField select fullWidth label="Section" value={sectionId} disabled={!classId} onChange={(e) => setSectionId(e.target.value)}>
                <MenuItem value="">All sections</MenuItem>
                {sections.map((s) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
              </TextField>
              <TextField select fullWidth label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
                <MenuItem value="">Any</MenuItem>
                {['draft', 'submitted', 'active'].map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </TextField>
            </Stack>
            <TextField select label="Template" value={templateId} onChange={(e) => setTemplateId(e.target.value)}
              helperText={(templates ?? []).length === 0 ? `No ${module} templates yet. Create one first.` : ''}>
              {(templates ?? []).map((t) => <MenuItem key={t.id} value={t.id}>{t.name} (v{t.version})</MenuItem>)}
            </TextField>
            <TextField select label="Layout" value={layout} onChange={(e) => setLayout(e.target.value as 'single' | 'a4-sheet')}>
              <MenuItem value="single">Single card per page</MenuItem>
              <MenuItem value="a4-sheet">A4 sheet — 10 cards per page</MenuItem>
            </TextField>
            <Button variant="contained" size="large" startIcon={<PrintIcon />}
              disabled={!schoolId || !templateId || selected.size === 0 || run.isPending} onClick={() => run.mutate()}>
              {run.isPending ? 'Working…' : `Generate PDF (${selected.size} selected)`}
            </Button>
            {schoolId && !run.isPending && selected.size === 0 && (
              <Alert severity="warning">Select at least one candidate below.</Alert>
            )}
            {run.isPending && (
              <Box>
                <Typography variant="body2">{progress.msg}</Typography>
                <LinearProgress variant={progress.total ? 'determinate' : 'indeterminate'} value={pct} sx={{ mt: 1 }} />
              </Box>
            )}
            {run.isError && <Alert severity="error">{friendlyError(run.error, 'Generation failed')}</Alert>}
            {run.isSuccess && (
              <Alert severity="success" action={
                <Button color="inherit" size="small" startIcon={<DownloadIcon />} onClick={() => download(run.data)}>Download</Button>
              }>
                {run.data.total} cards generated.
              </Alert>
            )}
          </Stack>
        </CardContent>
      </Card>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1, flexWrap: 'wrap', gap: 1 }}>
            <Typography variant="h6">Candidates</Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="body2" color="text.secondary">
                {selected.size} of {items.length} selected
              </Typography>
              <Button size="small" disabled={allSelected} onClick={() => setSelected(new Set(items.map((s) => s.id)))}>Select all</Button>
              <Button size="small" disabled={selected.size === 0} onClick={() => setSelected(new Set())}>Clear</Button>
            </Stack>
          </Stack>
          {schoolId ? (
            <>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox">
                      <Checkbox
                        indeterminate={selected.size > 0 && !allSelected}
                        checked={allSelected}
                        onChange={(e) => setSelected(e.target.checked ? new Set(items.map((s) => s.id)) : new Set())}
                      />
                    </TableCell>
                    <TableCell>Enrollment</TableCell>
                    <TableCell>Name</TableCell>
                    <TableCell>Class</TableCell>
                    <TableCell>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pageItems.map((s) => (
                    <TableRow key={s.id} hover onClick={() => toggle(s.id)} sx={{ cursor: 'pointer' }}>
                      <TableCell padding="checkbox"><Checkbox checked={selected.has(s.id)} /></TableCell>
                      <TableCell>{s.enrollment_no}</TableCell>
                      <TableCell>{s.name}</TableCell>
                      <TableCell>{[s.class_name, s.section_name].filter(Boolean).join(' - ') || '—'}</TableCell>
                      <TableCell><Chip size="small" label={s.status} /></TableCell>
                    </TableRow>
                  ))}
                  {items.length === 0 && (
                    <TableRow><TableCell colSpan={5}>{loadingCandidates ? 'Loading…' : 'No candidates match these filters.'}</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
              <TablePagination
                component="div"
                count={items.length}
                page={page}
                onPageChange={(_e, p) => setPage(p)}
                rowsPerPage={rowsPerPage}
                onRowsPerPageChange={(e) => { setRowsPerPage(Number(e.target.value)); setPage(0); }}
                rowsPerPageOptions={[10, 25, 50]}
              />
            </>
          ) : (
            <Typography variant="body2" color="text.secondary">Choose a school/org above to list its candidates.</Typography>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>Recent batches</Typography>
          {dlError && <Alert severity="error" sx={{ mb: 2 }}>{dlError}</Alert>}
          <Table size="small">
            <TableHead>
              <TableRow><TableCell>Created</TableCell><TableCell>Organization</TableCell><TableCell>Cards</TableCell><TableCell>Layout</TableCell><TableCell>Status</TableCell><TableCell /></TableRow>
            </TableHead>
            <TableBody>
              {(jobs ?? []).map((j) => (
                <TableRow key={j.id}>
                  <TableCell>{new Date(j.created_at).toLocaleString()}</TableCell>
                  <TableCell>{schoolName(j.school_id)}</TableCell>
                  <TableCell>{j.processed}/{j.total}</TableCell>
                  <TableCell>{j.layout}</TableCell>
                  <TableCell><Chip size="small" label={j.status} color={j.status === 'done' ? 'success' : j.status === 'failed' ? 'error' : 'default'} /></TableCell>
                  <TableCell align="right">
                    {j.status === 'done' && j.output_key && (
                      <Button size="small" startIcon={<DownloadIcon />} disabled={dl === j.id} onClick={() => download(j)}>
                        {dl === j.id ? 'Downloading…' : 'Download'}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {(jobs ?? []).length === 0 && <TableRow><TableCell colSpan={6}>No batches yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </Box>
  );
}
