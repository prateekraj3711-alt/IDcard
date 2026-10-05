import { Box } from '@mui/material';

/** View-only ID card preview with a repeated TIRHUT-TECH BHARDWAJ · A UNIT OF B&S GROUP watermark; blocks save/drag/right-click. */
export function Watermark({ src, kind = 'image' }: { src: string; kind?: 'image' | 'pdf' }) {
  const block = (e: React.SyntheticEvent) => e.preventDefault();
  return (
    <Box
      onContextMenu={block}
      onDragStart={block}
      sx={{ position: 'relative', width: 'fit-content', maxWidth: '100%', mx: 'auto', userSelect: 'none', overflow: 'hidden', borderRadius: 1, boxShadow: 3 }}
    >
      {kind === 'image' ? (
        <Box component="img" src={src} alt="ID card preview (view only)" draggable={false}
          sx={{ display: 'block', maxWidth: '100%', maxHeight: '70vh', pointerEvents: 'none' }} />
      ) : (
        <iframe title="ID card preview (view only)" src={src}
          style={{ display: 'block', width: 'min(86mm, 80vw)', height: '70vh', border: 0, pointerEvents: 'none' }} />
      )}
      <Box aria-hidden sx={{
        position: 'absolute', inset: '-50%', display: 'flex', flexWrap: 'wrap', alignContent: 'space-around',
        justifyContent: 'space-around', transform: 'rotate(-30deg)', pointerEvents: 'none',
      }}>
        {Array.from({ length: 40 }).map((_, i) => (
          <Box key={i} component="span" sx={{
            fontWeight: 800, fontSize: { xs: 16, sm: 22 }, letterSpacing: 2, color: 'error.main', opacity: 0.35, p: 2, whiteSpace: 'nowrap',
          }}>TIRHUT-TECH BHARDWAJ · A UNIT OF B&S GROUP</Box>
        ))}
      </Box>
    </Box>
  );
}
