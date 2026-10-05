import { useState } from 'react';
import { Button, CircularProgress, Menu, MenuItem } from '@mui/material';
import DownloadIcon from '@mui/icons-material/FileDownloadOutlined';
import * as XLSX from 'xlsx';
import { StudentsApi } from '@/app/api/endpoints';
import type { Student } from '@/app/types';

export type ExportScope = { ids?: string[]; schoolIds?: string[] };

const BASE: [string, (s: Student) => unknown][] = [
  ['Organization', (s) => s.school_name],
  ['ID / Enrollment', (s) => s.enrollment_no],
  ['Name', (s) => s.name],
  ['Class', (s) => s.class_name],
  ['Section', (s) => s.section_name],
  ['Roll no', (s) => s.roll_no],
  ["Father's name", (s) => s.father_name],
  ["Mother's name", (s) => s.mother_name],
  ['Date of birth', (s) => s.dob],
  ['Gender', (s) => s.gender],
  ['Blood group', (s) => s.blood_group],
  ['Mobile', (s) => s.mobile],
  ['Address', (s) => s.address],
  ['Status', (s) => s.status],
  ['Photo', (s) => (s.photo_path ? 'Yes' : 'No')],
  ['Added on', (s) => s.created_at?.slice(0, 10)],
];

async function fetchAll(scope: ExportScope): Promise<Student[]> {
  const out: Student[] = [];
  const groups = scope.schoolIds?.length ? scope.schoolIds.map((id) => ({ school_id: id })) : [{}];
  for (const g of groups) {
    for (let page = 1; ; page++) {
      const r = await StudentsApi.list({ ...g, ids: scope.ids, page, page_size: 500, with_photos: false });
      out.push(...r.items);
      if (r.items.length < 500) break;
    }
  }
  return out;
}

export async function exportCandidates(scope: ExportScope, format: 'xlsx' | 'csv', filename = 'candidates') {
  const rows = await fetchAll(scope);
  const extraKeys = [...new Set(rows.flatMap((r) => Object.keys(r.extra ?? {})))];
  const label = (k: string) => k.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
  const data = rows.map((s) => {
    const o: Record<string, unknown> = {};
    for (const [h, f] of BASE) o[h] = f(s) ?? '';
    for (const k of extraKeys) o[label(k)] = s.extra?.[k] ?? '';
    return o;
  });
  const ws = XLSX.utils.json_to_sheet(data, { header: [...BASE.map(([h]) => h), ...extraKeys.map(label)] });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Candidates');
  XLSX.writeFile(wb, `${filename}-${new Date().toISOString().slice(0, 10)}.${format}`, { bookType: format });
  return rows.length;
}

export function ExportMenu({ scope, label = 'Export', filename, size = 'small' }: {
  scope: ExportScope; label?: string; filename?: string; size?: 'small' | 'medium';
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (f: 'xlsx' | 'csv') => {
    setAnchor(null); setBusy(true);
    try {
      const n = await exportCandidates(scope, f, filename);
      if (!n) alert('No candidates to export.');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Export failed');
    } finally { setBusy(false); }
  };
  return (
    <>
      <Button color="inherit" size={size} disabled={busy}
        startIcon={busy ? <CircularProgress size={14} /> : <DownloadIcon />}
        onClick={(e) => setAnchor(e.currentTarget)}>{label}</Button>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        <MenuItem onClick={() => run('xlsx')}>Excel (.xlsx)</MenuItem>
        <MenuItem onClick={() => run('csv')}>CSV (.csv)</MenuItem>
      </Menu>
    </>
  );
}
