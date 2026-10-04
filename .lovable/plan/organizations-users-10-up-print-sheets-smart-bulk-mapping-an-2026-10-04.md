# Organizations, Users, 10-up print sheets, smart bulk mapping and text wrapping

## 1. Rename for offices and shops
- Everywhere on screen: "School" becomes "Organization", "Teacher" becomes "User". "Candidate" stays.
- Menu items, page titles, buttons, forms, messages, filters, empty states and the sign-in page all use the new words.
- Stored data and the Android app's connection stay the same, so nothing already saved breaks and the Android app keeps working.

## 2. Print sheet: 10 cards per page, at least 500 DPI
- Every card is exactly 54 x 86 mm (standard ID card size).
- Each A4 page holds exactly 10 cards with thin cut marks:
  - upright cards: A4 turned sideways, 5 across x 2 down
  - sideways cards: A4 upright, 2 across x 5 down
- Cards are drawn at 500 DPI or higher (1063 x 1693 px for an upright card). New templates start at 500 DPI. Older lower-resolution templates are scaled up when drawn, so the printout is never below 500.
- Single-card downloads use the same size and resolution.

## 3. Bulk generate from a ZIP or a folder (super admin only)
- On the Bulk page, the super admin can choose either:
  - one ZIP file holding the data sheet (Excel or CSV) and the photos, or
  - a folder on their computer (folder picker), containing the same files.
- Note: browsers can't open a typed folder path for security reasons. Choosing the folder from a picker gives the same result.
- Photos are matched to rows by a photo filename column, or by enrollment/employee ID, or by name.
- **Automatic field matching:** each column in the data sheet is matched to the template's fields (Name, Age, DOB, Address, Phone, Blood group, Department, ID number and so on). Different spellings and synonyms count, e.g. "Full Name", "Employee Name", "D.O.B", "Date of Birth", "Addr".
- A mapping screen shows each template field and the column picked for it. The super admin can change any pick before continuing. Unmatched fields are highlighted.
- Next comes a preview of the first cards. Then candidates are created, photos stored, and a print-ready PDF made (10 per page).
- Details typed in for a single candidate fill the same template fields the same way.

## 4. Layout editing and text wrapping
- In the template editor, each text field gets:
  - a label option (for example "Name:") shown before the value
  - a fixed box width, line spacing, letter size, bold, alignment
  - a "wrap to new lines" setting, on by default
- Long values like "Name: Prateek Raj Kumar Singh" move onto a new line inside their box instead of running off the edge.
- Wrapped text never overlaps the field below it. Fields underneath in the same column move down automatically to make room. If there is still no room, the text shrinks slightly as a last resort.
- The editor preview shows the wrapping live with sample long text, so spacing can be adjusted before printing.
- After mapping, the super admin can open any generated card's template, move fields or change spacing, and generate again.

## Technical details
- Renaming: only labels and copy in pages, AppShell, dialogs and routes change. Tables and columns (`schools`, `school_id`, teacher role), storage paths and `/api/public/v1/*` stay as they are. The shared wording lives in one terms module.
- `localRender.ts`: new `wrapLines()` helper using `measureText`. Text elements get `prefix`, `wrap`, `lineHeight`, `fontWeight` and `maxLines`. Rendering happens in two passes: first measure the extra height each block needs, then push down later elements that overlap it horizontally and sit below it.
- `renderBundlePdf`: the card size is fixed at 54 x 86 mm (orientation comes from the template's aspect ratio), with a fixed 10-up grid laid out to centre on A4. Render DPI is `max(500, layout.dpi)`, scaling element coordinates.
- Bulk: use `jszip` for ZIP files and `<input webkitdirectory>` for folders. Find the first .xlsx/.csv and match images by filename stem. The new `fieldMatcher.ts` normalizes headers and checks a synonym table against the template's bindings, plus the catalog. The mapping is stored on the import, and it reuses the existing bulk import commit plus the `IdCardJobsApi.run({ student_ids })` path.
- Any new client libraries get added to `optimizeDeps.include`.
