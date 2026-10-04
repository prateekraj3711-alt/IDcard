import { useEffect, useRef, useState } from 'react';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack,
} from '@mui/material';
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

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    // Portrait 3:4 center crop, capped at 720x960 (pipeline resizes anyway).
    const srcW = video.videoWidth;
    const srcH = video.videoHeight;
    const targetRatio = 3 / 4;
    let cropW = srcW;
    let cropH = Math.round(srcW / targetRatio);
    if (cropH > srcH) { cropH = srcH; cropW = Math.round(srcH * targetRatio); }
    const sx = Math.round((srcW - cropW) / 2);
    const sy = Math.round((srcH - cropH) / 2);
    const scale = Math.min(1, 720 / cropW);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(cropW * scale);
    canvas.height = Math.round(cropH * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, sx, sy, cropW, cropH, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) { setError('Capture failed — please try again.'); return; }
      onCapture(new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' }));
      onClose();
    }, 'image/jpeg', 0.9);
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Take photo</DialogTitle>
      <DialogContent>
        {error ? (
          <Alert severity="error">{error}</Alert>
        ) : (
          <Box
            component="video"
            ref={videoRef}
            playsInline
            muted
            sx={{ width: '100%', borderRadius: 1, bgcolor: 'black', aspectRatio: '4 / 3', objectFit: 'cover' }}
          />
        )}
      </DialogContent>
      <DialogActions>
        <Stack direction="row" spacing={1} sx={{ flexGrow: 1 }}>
          <Button startIcon={<CameraswitchIcon />} onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}>
            Flip camera
          </Button>
        </Stack>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" startIcon={<PhotoCameraIcon />} disabled={!!error} onClick={capture}>
          Capture
        </Button>
      </DialogActions>
    </Dialog>
  );
}
