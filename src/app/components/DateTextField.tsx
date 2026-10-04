import { useEffect, useState } from 'react';
import { TextField, type TextFieldProps } from '@mui/material';

// Typed date entry (DD/MM/YYYY) instead of a calendar. Emits YYYY-MM-DD when complete and valid, '' when empty.
function toDisplay(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso ?? '');
}
function toIso(text: string): string | null {
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text.trim());
  if (!m) return null;
  const d = +m[1], mo = +m[2], y = +m[3];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
function autoSlash(raw: string) {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (/[/.-]/.test(raw)) return raw.slice(0, 10);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean).join('/');
}

export function DateTextField({ value, onChange, ...rest }: Omit<TextFieldProps, 'value' | 'onChange'> & { value: string; onChange: (iso: string) => void }) {
  const [text, setText] = useState(toDisplay(value));
  useEffect(() => { if (toIso(text) !== value && !(value === '' && text === '')) setText(toDisplay(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const iso = toIso(text);
  const bad = text.length > 0 && !iso;
  return (
    <TextField {...rest} value={text} placeholder="DD/MM/YYYY" inputProps={{ inputMode: 'numeric', maxLength: 10 }}
      error={bad} helperText={bad ? 'Type the date as DD/MM/YYYY' : rest.helperText}
      onChange={(e) => {
        const t = autoSlash(e.target.value);
        setText(t);
        const v = toIso(t);
        if (v) onChange(v); else if (!t) onChange('');
      }} />
  );
}
