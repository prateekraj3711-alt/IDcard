import { useEffect, useRef, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel,
  Slider, Stack, Switch, Typography,
} from '@mui/material';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import { makePassportPhoto, preloadPassportModels } from '@/app/passport';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import CameraswitchIcon from '@mui/icons-material/Cameraswitch';

/**
 * In-browser camera capture. Opens the device camera via getUserMedia,
 * captures a frame to a JPEG File (portrait 3:4 crop, max 720x960 to match
 * the photo pipeline), and hands it to onCapture.
 */
export function CameraCaptureDialog({
  open, onClose, onCapture,
}: { open: boolean; onClose: () => void; onCapture: (file: File) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [facing, setFacing] = useState<'user' | 'environment'>('environment');
  const [zoom, setZoom] = useState(1);
  const [hwZoom, setHwZoom] = useState<{ min: number; max: number } | null>(null);
  const [autoCrop, setAutoCrop] = useState(true);
  const [whiteBg, setWhiteBg] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) preloadPassportModels(); }, [open]);
  // Use the camera's own zoom when it has one (sharper); otherwise zoom digitally.
  useEffect(() => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (hwZoom && track) track.applyConstraints({ advanced: [{ zoom } as MediaTrackConstraintSet] }).catch(() => undefined);
  }, [zoom, hwZoom]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);

    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setError('This browser does not support camera capture. Please use Upload instead.');
          return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 960 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        setZoom(1);
        const caps = (stream.getVideoTracks()[0]?.getCapabilities?.() ?? {}) as { zoom?: { min: number; max: number } };
        setHwZoom(caps.zoom && caps.zoom.max > caps.zoom.min ? { min: caps.zoom.min, max: caps.zoom.max } : null);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
      } catch {
        if (!cancelled) {
          setError('Could not open the camera. Check the browser permission prompt and try again, or use Upload instead.');
        }
      }
    };
    start();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [open, facing]);

  const digital = hwZoom ? 1 : zoom;
  const capture = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    // Grab the (digitally zoomed) frame, then crop to a passport photo.
    const cw = video.videoWidth / digital, ch = video.videoHeight / digital;
    const frame = document.createElement('canvas');
    frame.width = Math.round(cw); frame.height = Math.round(ch);
    frame.getContext('2d')!.drawImage(video, (video.videoWidth - cw) / 2, (video.videoHeight - ch) / 2, cw, ch, 0, 0, frame.width, frame.height);
    setBusy(true);
    try {
      const canvas = await makePassportPhoto(frame, { autoCrop, whiteBackground: whiteBg });
      canvas.toBlob((blob) => {
        setBusy(false);
        if (!blob) { setError('Capture failed — please try again.'); return; }
        onCapture(new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' }));
        onClose();
      }, 'image/jpeg', 0.9);
    } catch { setBusy(false); setError('Capture failed — please try again.'); }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Take photo</DialogTitle>
      <DialogContent>
        {error ? (
          <Alert severity="error">{error}</Alert>
        ) : (
          <Box sx={{ overflow: 'hidden', borderRadius: 1 }}><Box
            component="video"
            ref={videoRef}
            playsInline
            muted
            sx={{ width: '100%', borderRadius: 1, bgcolor: 'black', aspectRatio: '4 / 3', objectFit: 'cover', transform: `scale(${digital})` }}
          /></Box>
        )}
        {!error && (
          <Stack spacing={1} sx={{ mt: 2 }}>
            <Stack direction="row" spacing={2} alignItems="center">
              <ZoomInIcon color="action" />
              <Slider size="small" value={zoom} step={0.1}
                min={hwZoom?.min ?? 1} max={hwZoom ? Math.min(hwZoom.max, 8) : 4}
                onChange={(_e, v) => setZoom(v as number)} valueLabelDisplay="auto" valueLabelFormat={(v) => `${v.toFixed(1)}x`} />
            </Stack>
            <Stack direction="row" spacing={2} flexWrap="wrap">
              <FormControlLabel control={<Switch checked={autoCrop} onChange={(e) => setAutoCrop(e.target.checked)} />} label="Auto passport crop" />
              <FormControlLabel control={<Switch checked={whiteBg} onChange={(e) => setWhiteBg(e.target.checked)} />} label="White background" />
            </Stack>
            <Typography variant="caption" color="text.secondary">Auto crop centres the face head-and-shoulders, like a passport photo.</Typography>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Stack direction="row" spacing={1} sx={{ flexGrow: 1 }}>
          <Button startIcon={<CameraswitchIcon />} onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}>
            Flip camera
          </Button>
        </Stack>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!!error || busy} onClick={capture} startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <PhotoCameraIcon />}>
          {busy ? 'Processing…' : 'Capture'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
