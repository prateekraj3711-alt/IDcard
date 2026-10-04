// Candidate details a super admin can ask users to fill in, per organization (schools.entry_fields).
// Built-in keys map to student columns; "extra.<key>" keys live in students.extra.
export const ENTRY_FIELDS: Array<{ key: string; label: string; date?: boolean }> = [
  { key: 'enrollment_no', label: 'ID / Enrollment No' },
  { key: 'roll_no', label: 'Roll No' },
  { key: 'section_name', label: 'Section / Team' },
  { key: 'father_name', label: "Father's name" },
  { key: 'mother_name', label: "Mother's name" },
  { key: 'dob', label: 'Date of birth', date: true },
  { key: 'blood_group', label: 'Blood group' },
  { key: 'gender', label: 'Gender' },
  { key: 'mobile', label: 'Mobile' },
  { key: 'address', label: 'Address' },
  { key: 'extra.designation', label: 'Designation' },
  { key: 'extra.department', label: 'Department' },
  { key: 'extra.doj', label: 'Date of joining', date: true },
  { key: 'extra.valid_till', label: 'Valid till', date: true },
  { key: 'extra.email', label: 'Email' },
  { key: 'extra.emergency_contact', label: 'Emergency contact' },
];

export const DATE_EXTRA_KEYS = new Set(['doj', 'valid_till']);

/** Normalise a stored config: null/invalid → null (meaning "ask everything"). */
export function parseEntryFields(v: unknown): string[] | null {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : null;
}

export function customKey(label: string): string {
  return 'extra.' + label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
}
