import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Button, Card, CardContent, Divider, IconButton, MenuItem, Paper, Stack, TextField,
  ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import { Stage, Layer, Rect, Text as KText, Image as KImage, Transformer } from 'react-konva';
import Konva from 'konva';
import { TemplatesApi } from '@/api/endpoints';
import type { FieldCatalogEntry, Template, TemplateElement, TemplateLayout, TemplateModule } from '@/types';

const DEFAULT_CARD_W = 340;   // px on canvas ~= 86mm
const DEFAULT_CARD_H = 214;   // px ~= 54mm
const PALETTE_KIND_COLOR: Record<string, string> = {
  text: '#EAF1FF', image: '#FFF4E0', qr: '#E7F8EA', barcode: '#F0E7FA',
};

export function TemplateEditorPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const isNew = !id || id === 'new';

  const [module, setModule] = useState<TemplateModule>('student');
  const [name, setName] = useState('');
  const [layout, setLayout] = useState<TemplateLayout>({
    width: DEFAULT_CARD_W, height: DEFAULT_CARD_H, background: '#ffffff', elements: [],
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: template } = useQuery({
    queryKey: ['template', id],
    queryFn: () => TemplatesApi.get(id!),
    enabled: !isNew,
  });

  useEffect(() => {
    if (template) {
      setModule(template.module);
      setName(template.name);
      if (template.layout_json) setLayout(template.layout_json);
    }
  }, [template]);

  const { data: catalog } = useQuery({
    queryKey: ['template-fields', module],
    queryFn: () => TemplatesApi.fieldCatalog(module),
  });

  const save = useMutation({
    mutationFn: () => {
      const body: Partial<Template> = { name, module, layout_json: layout };
      return isNew ? TemplatesApi.create(body) : TemplatesApi.update(id!, body);
    },
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ['templates'] });
      nav(`/templates/${t.id}`, { replace: true });
    },
  });

  const addFromCatalog = (entry: FieldCatalogEntry) => {
    setLayout((l) => ({
      ...l,
      elements: [
        ...l.elements,
        {
          id: crypto.randomUUID(),
          kind: entry.kind,
          binding: entry.field,
          label: entry.label,
          x: 20, y: 20,
          width: entry.kind === 'text' ? 160 : 80,
          height: entry.kind === 'text' ? 24 : 80,
          fontSize: 14,
          fontFamily: 'Inter',
          fill: '#111',
          align: 'left',
        },
      ],
    }));
  };

  const updateElement = (elId: string, patch: Partial<TemplateElement>) => {
    setLayout((l) => ({
      ...l,
      elements: l.elements.map((e) => (e.id === elId ? { ...e, ...patch } : e)),
    }));
  };

  const removeElement = (elId: string) => {
    setLayout((l) => ({ ...l, elements: l.elements.filter((e) => e.id !== elId) }));
    setSelectedId(null);
  };

  const selectedEl = layout.elements.find((e) => e.id === selectedId) ?? null;

  return (
    <Box>
      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h4" sx={{ flexGrow: 1 }}>
          {isNew ? 'New template' : `Edit — ${template?.name ?? ''}`}
        </Typography>
        <ToggleButtonGroup
          size="small" exclusive value={module}
          onChange={(_, v) => v && setModule(v)}
        >
          <ToggleButton value="student">Student</ToggleButton>
          <ToggleButton value="employee">Employee</ToggleButton>
        </ToggleButtonGroup>
        <Button
          variant="contained" startIcon={<SaveIcon />}
          disabled={!name || save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? 'Saving…' : 'Save template'}
        </Button>
      </Stack>

      <Stack direction="row" spacing={2}>
        <Card sx={{ width: 260, alignSelf: 'flex-start' }}>
          <CardContent>
            <Typography variant="subtitle2" gutterBottom>Fields</Typography>
            <Stack spacing={1}>
              {(catalog?.fields ?? []).map((f) => (
                <Paper
                  key={f.field} variant="outlined" onClick={() => addFromCatalog(f)}
                  sx={{
                    p: 1, cursor: 'pointer',
                    bgcolor: PALETTE_KIND_COLOR[f.kind] ?? '#f5f5f5',
                    '&:hover': { boxShadow: 2 },
                  }}
                >
                  <Typography variant="body2">{f.label}</Typography>
                  <Typography variant="caption" color="text.secondary">{f.field}</Typography>
                </Paper>
              ))}
            </Stack>
          </CardContent>
        </Card>

        <Card sx={{ flexGrow: 1 }}>
          <CardContent>
            <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
              <TextField label="Template name" size="small" value={name} onChange={(e) => setName(e.target.value)} />
              <TextField
                label="Width (px)" size="small" type="number" value={layout.width}
                onChange={(e) => setLayout((l) => ({ ...l, width: Number(e.target.value) }))}
                sx={{ width: 120 }}
              />
              <TextField
                label="Height (px)" size="small" type="number" value={layout.height}
                onChange={(e) => setLayout((l) => ({ ...l, height: Number(e.target.value) }))}
                sx={{ width: 120 }}
              />
            </Stack>
            <CanvasEditor
              layout={layout}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onUpdate={updateElement}
            />
          </CardContent>
        </Card>

        <Card sx={{ width: 260, alignSelf: 'flex-start' }}>
          <CardContent>
            <Typography variant="subtitle2" gutterBottom>Inspector</Typography>
            {selectedEl ? (
              <Stack spacing={1.5}>
                <TextField
                  label="Binding" size="small" value={selectedEl.binding ?? ''}
                  onChange={(e) => updateElement(selectedEl.id, { binding: e.target.value })}
                />
                <TextField
                  label="Static label" size="small" value={selectedEl.label ?? ''}
                  onChange={(e) => updateElement(selectedEl.id, { label: e.target.value })}
                />
                {selectedEl.kind === 'text' && (
                  <>
                    <TextField
                      label="Font size" size="small" type="number" value={selectedEl.fontSize ?? 14}
                      onChange={(e) => updateElement(selectedEl.id, { fontSize: Number(e.target.value) })}
                    />
                    <TextField
                      select label="Align" size="small" value={selectedEl.align ?? 'left'}
                      onChange={(e) => updateElement(selectedEl.id, { align: e.target.value as 'left' | 'center' | 'right' })}
                    >
                      {['left', 'center', 'right'].map((a) => <MenuItem key={a} value={a}>{a}</MenuItem>)}
                    </TextField>
                    <TextField
                      label="Color" size="small" value={selectedEl.fill ?? '#111'}
                      onChange={(e) => updateElement(selectedEl.id, { fill: e.target.value })}
                    />
                  </>
                )}
                <Divider />
                <Stack direction="row" spacing={1}>
                  <TextField label="X" size="small" type="number" value={selectedEl.x}
                    onChange={(e) => updateElement(selectedEl.id, { x: Number(e.target.value) })} />
                  <TextField label="Y" size="small" type="number" value={selectedEl.y}
                    onChange={(e) => updateElement(selectedEl.id, { y: Number(e.target.value) })} />
                </Stack>
                <Stack direction="row" spacing={1}>
                  <TextField label="W" size="small" type="number" value={selectedEl.width}
                    onChange={(e) => updateElement(selectedEl.id, { width: Number(e.target.value) })} />
                  <TextField label="H" size="small" type="number" value={selectedEl.height}
                    onChange={(e) => updateElement(selectedEl.id, { height: Number(e.target.value) })} />
                </Stack>
                <Divider />
                <Tooltip title="Remove element">
                  <IconButton color="error" onClick={() => removeElement(selectedEl.id)}>
                    <DeleteIcon />
                  </IconButton>
                </Tooltip>
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">
                Click an element on the canvas to edit its properties. Click a field in the left palette to add it.
              </Typography>
            )}
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
}

function CanvasEditor({
  layout, selectedId, onSelect, onUpdate,
}: {
  layout: TemplateLayout;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onUpdate: (id: string, patch: Partial<TemplateElement>) => void;
}) {
  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);

  useEffect(() => {
    const tr = trRef.current; const stage = stageRef.current;
    if (!tr || !stage) return;
    if (selectedId) {
      const node = stage.findOne(`#${selectedId}`);
      if (node) tr.nodes([node]);
      else tr.nodes([]);
    } else tr.nodes([]);
    tr.getLayer()?.batchDraw();
  }, [selectedId, layout.elements]);

  return (
    <Paper variant="outlined" sx={{ display: 'inline-block', bgcolor: '#f0f2f5' }}>
      <Stage
        width={layout.width + 40}
        height={layout.height + 40}
        ref={stageRef}
        onMouseDown={(e) => {
          if (e.target === e.target.getStage()) onSelect(null);
        }}
      >
        <Layer>
          <Rect
            x={20} y={20}
            width={layout.width} height={layout.height}
            fill={layout.background} stroke="#bbb" strokeWidth={1}
            cornerRadius={6}
            shadowColor="black" shadowBlur={6} shadowOpacity={0.08}
          />
          {layout.elements.map((el) => (
            <ElementNode
              key={el.id} el={el}
              onSelect={() => onSelect(el.id)}
              onChange={(p) => onUpdate(el.id, p)}
              offsetX={20} offsetY={20}
            />
          ))}
          <Transformer ref={trRef} rotateEnabled={false} borderStroke="#1F5DF9" anchorStroke="#1F5DF9" />
        </Layer>
      </Stage>
    </Paper>
  );
}

function ElementNode({
  el, onSelect, onChange, offsetX, offsetY,
}: {
  el: TemplateElement;
  onSelect: () => void;
  onChange: (patch: Partial<TemplateElement>) => void;
  offsetX: number; offsetY: number;
}) {
  const common = {
    id: el.id,
    x: el.x + offsetX,
    y: el.y + offsetY,
    draggable: true,
    onClick: onSelect,
    onTap: onSelect,
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => onChange({ x: e.target.x() - offsetX, y: e.target.y() - offsetY }),
    onTransformEnd: (e: Konva.KonvaEventObject<Event>) => {
      const node = e.target as Konva.Node;
      const scaleX = node.scaleX(); const scaleY = node.scaleY();
      node.scaleX(1); node.scaleY(1);
      onChange({
        x: node.x() - offsetX, y: node.y() - offsetY,
        width: Math.max(20, node.width() * scaleX),
        height: Math.max(20, node.height() * scaleY),
      });
    },
  } as const;

  if (el.kind === 'text') {
    return (
      <KText
        {...common}
        text={el.text ?? el.label ?? el.binding ?? ''}
        width={el.width}
        height={el.height}
        fontSize={el.fontSize ?? 14}
        fontFamily={el.fontFamily ?? 'Inter'}
        fill={el.fill ?? '#111'}
        align={el.align ?? 'left'}
      />
    );
  }

  // For image / qr / barcode we render a placeholder rectangle with label.
  return (
    <>
      <Rect {...common}
        width={el.width} height={el.height}
        stroke="#888" dash={[4, 3]} fill={PALETTE_KIND_COLOR[el.kind]}
        cornerRadius={4}
      />
      <KText
        listening={false}
        x={el.x + offsetX} y={el.y + offsetY + el.height / 2 - 8}
        width={el.width} height={16}
        text={el.label ?? el.binding ?? el.kind.toUpperCase()}
        align="center" fontSize={12} fill="#555"
      />
    </>
  );
}
