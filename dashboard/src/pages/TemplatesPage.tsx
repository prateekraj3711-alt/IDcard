import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, ButtonGroup, Card, CardActions, CardContent, Chip, Dialog, DialogActions,
  DialogContent, DialogTitle, Grid, IconButton, MenuItem, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import UploadIcon from '@mui/icons-material/Upload';
import DownloadIcon from '@mui/icons-material/Download';
import { SchoolsApi, TemplatesApi } from '@/api/endpoints';
import type { TemplateModule } from '@/types';
import { api } from '@/api/client';

export function TemplatesPage() {
  const nav = useNavigate();
  const [module, setModule] = useState<TemplateModule | ''>('');
  const [importOpen, setImportOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ['templates', module],
    queryFn: () => TemplatesApi.list({ module: (module || undefined) as TemplateModule | undefined }),
  });

  const downloadExport = async (id: string, name: string) => {
    const resp = await api.get(`/templates/${id}/export`);
    const blob = new Blob([JSON.stringify(resp.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.template.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
        <ButtonGroup variant="contained">
          <Button startIcon={<AddIcon />} onClick={() => nav('/templates/new')}>
            New template
          </Button>
          <Button startIcon={<UploadIcon />} onClick={() => setImportOpen(true)}>
            Import
          </Button>
        </ButtonGroup>
      </Stack>

      <Grid container spacing={2}>
        {(data ?? []).map((t) => (
          <Grid item xs={12} sm={6} md={4} key={t.id}>
            <Card>
              <CardContent component={Link} to={`/templates/${t.id}`} sx={{ textDecoration: 'none', display: 'block', color: 'inherit' }}>
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
              <CardActions>
                <Tooltip title="Export as JSON">
                  <IconButton size="small" onClick={() => downloadExport(t.id, t.name)}>
                    <DownloadIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </CardActions>
            </Card>
          </Grid>
        ))}
        {(data ?? []).length === 0 && (
          <Grid item xs={12}>
            <Card><CardContent>
              <Typography color="text.secondary">
                No templates yet. Create one from scratch, or import a JSON export or an existing card image
                (PNG / JPG) to use as an editable background.
              </Typography>
            </CardContent></Card>
          </Grid>
        )}
      </Grid>

      <ImportTemplateDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={(id) => { setImportOpen(false); nav(`/templates/${id}`); }}
      />
    </Box>
  );
}

function ImportTemplateDialog({
  open, onClose, onImported,
}: { open: boolean; onClose: () => void; onImported: (id: string) => void }) {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [module, setModule] = useState<TemplateModule>('student');
  const [schoolId, setSchoolId] = useState<string>('');

  const { data: schools } = useQuery({
    queryKey: ['schools', 'select'],
    queryFn: () => SchoolsApi.list({ page: 1, page_size: 100 }),
    enabled: open,
  });

  const mut = useMutation({
    mutationFn: () => TemplatesApi.import({
      file: file!,
      name: name || (file?.name.replace(/\.[^.]+$/, '') ?? 'Imported template'),
      module,
      school_id: schoolId || undefined,
    }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['templates'] });
      onImported(r.template.id);
    },
  });

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Import template</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Alert severity="info">
            Import a <strong>JSON export</strong> to round-trip a template between orgs, or a
            <strong> PNG / JPG</strong> of an existing card. Uploaded images become a locked
            background layer so you can drop editable fields on top and reposition them.
          </Alert>
          <Button
            variant="outlined" component="label"
            startIcon={<UploadIcon />}
          >
            {file ? file.name : 'Choose .json, .png, or .jpg'}
            <input hidden type="file" accept=".json,.png,.jpg,.jpeg,application/json,image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </Button>
          <TextField
            label="Template name" value={name} onChange={(e) => setName(e.target.value)}
            placeholder={file?.name.replace(/\.[^.]+$/, '') ?? ''}
          />
          <TextField
            select label="Module" value={module}
            onChange={(e) => setModule(e.target.value as TemplateModule)}
          >
            <MenuItem value="student">Student</MenuItem>
            <MenuItem value="employee">Employee</MenuItem>
          </TextField>
          <TextField
            select label="School (optional)" value={schoolId}
            onChange={(e) => setSchoolId(e.target.value)}
            helperText="Leave blank to make this a system-wide template"
          >
            <MenuItem value="">— System-wide —</MenuItem>
            {(schools?.items ?? []).map((s) => (
              <MenuItem key={s.id} value={s.id}>{s.code} — {s.name}</MenuItem>
            ))}
          </TextField>
          {mut.isError && <Alert severity="error">
            {(mut.error as { response?: { data?: { detail?: string } } }).response?.data?.detail ?? 'Import failed'}
          </Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!file || mut.isPending} onClick={() => mut.mutate()}>
          {mut.isPending ? 'Importing…' : 'Import'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
