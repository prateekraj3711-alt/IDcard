import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from '@/app/router-shim';
import {
  Alert, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Grid,
  IconButton, LinearProgress, List, ListItem, ListItemText, MenuItem, Stack, TextField, Tooltip, Typography, Avatar,
} from '@mui/material';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import BadgeIcon from '@mui/icons-material/Badge';
import DownloadIcon from '@mui/icons-material/Download';
import VisibilityIcon from '@mui/icons-material/Visibility';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import { QRCodeSVG as QRCode } from 'qrcode.react';
import { IdCardsApi, StudentsApi, TemplatesApi, type CardStage, cardPreviewPath } from '@/app/api/endpoints';
import { CARD_BUCKET, PHOTO_ACCEPT, downloadFromStorage, friendlyError, signedUrl } from '@/app/media';
import { StudentFormDialog } from '@/app/components/StudentFormDialog';
import { CameraCaptureDialog } from '@/app/components/CameraCaptureDialog';
import type { IdCard } from '@/app/types';
import { useAuth } from '@/app/auth/store';
import { Watermark } from '@/app/components/Watermark';
import { ExportMenu } from '@/app/components/ExportMenu';

const PHOTO_STAGE: Record<string, string> = {
  processing: 'Resizing & compressing photo…', checking: 'Checking for duplicates…',
  uploading: 'Uploading photo…', saving: 'Saving photo details…',
};
const CARD_STAGE: Record<CardStage, string> = {
  preparing: 'Loading candidate, photo and template…', rendering: 'Rendering ID card PDF…',
  uploading: 'Uploading PDF…', saving: 'Saving card record…',
};

export function StudentProfilePage() {
  const { id = '' } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const nav = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [photoStage, setPhotoStage] = useState<string | null>(null);
  const [cardStage, setCardStage] = useState<CardStage | null>(null);
  const [templateId, setTemplateId] = useState('');
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [preview, setPreview] = useState<{ url: string; card: IdCard; isImage: boolean } | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [dlError, setDlError] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const isAdmin = useAuth((st) => st.user?.role === 'super_admin');

  const { data: student, isLoading, error } = useQuery({
    queryKey: ['student', id], queryFn: () => StudentsApi.get(id), enabled: !!id,
  });
  const { data: templates } = useQuery({
    queryKey: ['templates', 'student', student?.school_id],
    queryFn: () => TemplatesApi.list({ module: 'student', school_id: student!.school_id }),
    enabled: !!student,
  });
  const { data: cards, isLoading: cardsLoading } = useQuery({
    queryKey: ['id-cards', id], queryFn: () => IdCardsApi.listForStudent(id), enabled: !!id,
  });

  // Auto-map: prefer the template the super admin saved for this school, else the shared one.
  useEffect(() => {
    if (templateId || !templates?.length) return;
    const own = templates.find((t) => t.school_id && t.school_id === student?.school_id);
    setTemplateId((own ?? templates[0]).id);
  }, [templates, templateId, student?.school_id]);

  const upload = useMutation({
    mutationFn: (file: File) => StudentsApi.uploadPhoto(student!, file, (s) => setPhotoStage(s)),
    onSettled: () => setPhotoStage(null),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['student', id] }); qc.invalidateQueries({ queryKey: ['students'] }); },
  });

  const generate = useMutation({
    mutationFn: () => IdCardsApi.generateForStudent(id, templateId, setCardStage),
    onSettled: () => setCardStage(null),
    onSuccess: async (card) => {
      qc.invalidateQueries({ queryKey: ['id-cards', id] });
      await openPreview(card);
    },
  });

  const delStudent = useMutation({
    mutationFn: () => StudentsApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['students'] }); nav('/students'); },
  });

  const delCard = useMutation({
    mutationFn: (c: IdCard) => IdCardsApi.delete(c),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['id-cards', id] }),
  });

  const openPreview = async (card: IdCard) => {
    setDlError(null);
    const [png, pdf] = await Promise.all([
      signedUrl(CARD_BUCKET, cardPreviewPath(card.storage_path), 600),
      signedUrl(CARD_BUCKET, card.storage_path, 600),
    ]);
    // Users always get a watermarked view: PNG preview when present, PDF otherwise.
    if (png || pdf) setPreview({ url: png ?? pdf!, card, isImage: !!png });
    else setDlError('Could not open this card. Please try again.');
  };
  const download = async (card: IdCard) => {
    setDownloading(card.id); setDlError(null);
    try { await downloadFromStorage(CARD_BUCKET, card.storage_path, card.file_name); }
    catch (e) { setDlError(friendlyError(e, 'Download failed')); }
    finally { setDownloading(null); }
  };

  if (isLoading) return <LinearProgress />;
  if (error || !student) return <Alert severity="error">{friendlyError(error, 'Candidate not found.')}</Alert>;

  const qrPayload = JSON.stringify({ student_id: student.id, enrollment_no: student.enrollment_no, school_id: student.school_id });

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <Typography variant="h4" sx={{ flexGrow: 1 }}>{student.name}</Typography>
        <Button startIcon={<EditIcon />} onClick={() => setEditing(true)}>Edit</Button>
        {isAdmin && id && <ExportMenu scope={{ ids: [id] }} label="Export" filename="candidate" size="medium" />}
        {isAdmin && <Button color="error" startIcon={<DeleteIcon />} onClick={() => setConfirmDelete(true)}>Delete</Button>}
      </Stack>
      <Grid container spacing={2}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Stack alignItems="center" spacing={2}>
                <Avatar src={student.primary_photo_url ?? undefined} sx={{ width: 180, height: 240 }} variant="rounded" />
                <input ref={fileRef} type="file" hidden accept={PHOTO_ACCEPT.join(',')}
                  onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload.mutate(f); }} />
                <Stack direction="row" spacing={1}>
                  <Button variant="contained" startIcon={<PhotoCameraIcon />} disabled={upload.isPending} onClick={() => setCameraOpen(true)}>
                    Take photo
                  </Button>
                  <Button variant="outlined" disabled={upload.isPending} onClick={() => fileRef.current?.click()}>
                    {student.photo_path ? 'Replace photo' : 'Upload photo'}
                  </Button>
                </Stack>
                <CameraCaptureDialog
                  open={cameraOpen}
                  onClose={() => setCameraOpen(false)}
                  onCapture={(file) => upload.mutate(file)}
                />
                {photoStage && (
                  <Box sx={{ width: '100%' }}>
                    <Typography variant="caption">{PHOTO_STAGE[photoStage]}</Typography>
                    <LinearProgress />
                  </Box>
                )}
                {upload.isError && <Alert severity="error" sx={{ width: '100%' }}>{friendlyError(upload.error, 'Photo upload failed')}</Alert>}
                {upload.isSuccess && !photoStage && (
                  <Alert severity="success" sx={{ width: '100%' }}
                    action={
                      <Stack direction="row" spacing={1}>
                        <Button size="small" onClick={() => nav('/students')}>Done</Button>
                        <Button size="small" variant="contained" onClick={() => nav('/students', { search: { new: 1 } })}>Add next</Button>
                      </Stack>
                    }>
                    Photo saved.
                  </Alert>
                )}
                <Typography variant="caption" color="text.secondary">JPG/PNG/WEBP · saved as 720×960 JPEG (~300 KB)</Typography>
                <QRCode value={qrPayload} size={120} />
              </Stack>
            </CardContent>
          </Card>

          <Card sx={{ mt: 2 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>ID cards</Typography>
              {isAdmin && <Stack spacing={1.5}>
                <TextField select size="small" label="Template" value={templateId} onChange={(e) => setTemplateId(e.target.value)}
                  helperText={templates && templates.length === 0 ? 'No templates available — ask a super admin to create one.' : ' '}>
                  {(templates ?? []).map((t) => <MenuItem key={t.id} value={t.id}>{t.name} (v{t.version})</MenuItem>)}
                </TextField>
                <Button variant="contained" startIcon={<BadgeIcon />} disabled={!templateId || generate.isPending} onClick={() => generate.mutate()}>
                  {generate.isPending ? 'Generating…' : 'Generate ID card'}
                </Button>
                {!student.photo_path && <Alert severity="warning">No photo yet — the card will show an empty photo box.</Alert>}
                {cardStage && <Box><Typography variant="caption">{CARD_STAGE[cardStage]}</Typography><LinearProgress /></Box>}
                {generate.isError && <Alert severity="error">{friendlyError(generate.error, 'ID card generation failed')}</Alert>}
              </Stack>}
              {dlError && <Alert severity="error" sx={{ mt: 1 }}>{dlError}</Alert>}
              <Divider sx={{ my: 2 }} />
              {cardsLoading ? <LinearProgress /> : (cards ?? []).length === 0 ? (
                <Typography variant="body2" color="text.secondary">No ID cards generated yet.</Typography>
              ) : (
                <List dense disablePadding>
                  {(cards ?? []).map((c) => (
                    <ListItem key={c.id} disableGutters secondaryAction={
                      <Stack direction="row">
                        <Tooltip title="Preview"><IconButton size="small" onClick={() => openPreview(c)}><VisibilityIcon fontSize="small" /></IconButton></Tooltip>
                        {isAdmin && <><Tooltip title="Download"><span><IconButton size="small" disabled={downloading === c.id} onClick={() => download(c)}><DownloadIcon fontSize="small" /></IconButton></span></Tooltip>
                        <Tooltip title="Delete"><IconButton size="small" disabled={delCard.isPending} onClick={() => delCard.mutate(c)}><DeleteIcon fontSize="small" /></IconButton></Tooltip></>}
                      </Stack>
                    }>
                      <ListItemText
                        primary={c.id_card_templates?.name ?? 'ID card'}
                        secondary={`${new Date(c.created_at).toLocaleString()} · ${Math.round(c.file_size / 1024)} KB`}
                      />
                    </ListItem>
                  ))}
                </List>
              )}
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <DetailRow label="Organization" value={student.school_name} />
              <DetailRow label="ID / Enrollment" value={student.enrollment_no} />
              <DetailRow label="Class & Section" value={[student.class_name, student.section_name].filter(Boolean).join(' - ') || null} />
              <DetailRow label="Roll No" value={student.roll_no} />
              <DetailRow label="Father's Name" value={student.father_name} />
              <DetailRow label="Mother's Name" value={student.mother_name} />
              <DetailRow label="DOB" value={student.dob} />
              <DetailRow label="Blood Group" value={student.blood_group} />
              <DetailRow label="Gender" value={student.gender} />
              <DetailRow label="Mobile" value={student.mobile} />
              <DetailRow label="Address" value={student.address} />
              <DetailRow label="Enrolled On" value={student.enrolled_on ? student.enrolled_on.slice(0, 10).split("-").reverse().join("/") : null} />
              {Object.entries(student.extra ?? {}).map(([k, v]) => (
                <DetailRow key={k} label={k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())} value={v || null} />
              ))}
              <DetailRow label="Status" value={student.status} />
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {editing && <StudentFormDialog student={student} onClose={() => setEditing(false)} />}

      <Dialog open={!!preview} onClose={() => setPreview(null)} fullWidth maxWidth="md">
        <DialogTitle>ID card preview</DialogTitle>
        <DialogContent>
          {preview && !isAdmin && <Watermark src={preview.url} kind={preview.isImage ? 'image' : 'pdf'} />}
          {preview && isAdmin && (preview.isImage
            ? <Box component="img" src={preview.url} alt="ID card preview" sx={{ display: 'block', maxWidth: '100%', maxHeight: '70vh', mx: 'auto', boxShadow: 3, borderRadius: 1 }} />
            : <iframe title="ID card" src={preview.url} style={{ width: '100%', height: '70vh', border: 0 }} />)}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreview(null)}>Close</Button>
          {isAdmin && <Button variant="contained" startIcon={<DownloadIcon />} disabled={!!downloading}
            onClick={() => preview && download(preview.card)}>
            {downloading ? 'Downloading…' : 'Download PDF'}
          </Button>}
        </DialogActions>
      </Dialog>

      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)}>
        <DialogTitle>Delete candidate?</DialogTitle>
        <DialogContent>
          <Typography>{student.name} will be archived and removed from lists.</Typography>
          {delStudent.isError && <Alert severity="error" sx={{ mt: 2 }}>{friendlyError(delStudent.error)}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(false)}>Cancel</Button>
          <Button color="error" variant="contained" disabled={delStudent.isPending} onClick={() => delStudent.mutate()}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <Box sx={{ py: 1 }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography>{value || '—'}</Typography>
      <Divider sx={{ mt: 1 }} />
    </Box>
  );
}
