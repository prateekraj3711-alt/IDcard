# ID Card Template Editor

A visual, drag-and-drop editor that produces a portable `layout_json`. The server-side renderer converts the layout to a rasterized card at generation time.

## Modules

Every template belongs to one **module**:

- **Student** — bindings pull from the `students` table (name, enrollment number, class, section, DOB, blood group, parents, photo, QR).
- **Employee** — bindings pull from a future `employees` table (name, employee ID, designation, department, DOJ, photo, QR, barcode). Same template engine, different binding vocabulary.

The generate UI shows templates filtered by module — an ID card job for students can only pick from student templates.

## Editor UX

- **Left palette** — field catalog for the selected module. Click a field to add it to the canvas. Kinds: `text`, `image`, `qr`, `barcode`.
- **Center canvas** — Konva stage sized to the card dimensions (default CR80 credit-card, 86 × 54 mm). Elements are draggable and resizable.
- **Right inspector** — edit the selected element's `binding`, `label`, size, position, font, alignment, color.
- **Header** — module toggle (Student / Employee), template name, save.

## `layout_json` Schema

```jsonc
{
  "width": 340,               // px on canvas
  "height": 214,
  "background": "#ffffff",
  "elements": [
    {
      "id": "01H…",
      "kind": "text",         // "text" | "image" | "qr" | "barcode"
      "binding": "student.name",
      "label": "Name",
      "x": 20, "y": 24,
      "width": 200, "height": 22,
      "fontSize": 16, "fontFamily": "Inter",
      "fill": "#111", "align": "left"
    },
    {
      "id": "01H…",
      "kind": "image",
      "binding": "photo",
      "x": 220, "y": 24,
      "width": 100, "height": 130
    },
    {
      "id": "01H…",
      "kind": "qr",
      "binding": "qr",         // renderer generates QR from student/employee id
      "x": 220, "y": 160, "width": 44, "height": 44
    }
  ]
}
```

## Canonical Bindings

`GET /templates/fields/catalog?module=student` returns the full list. Highlights:

**Student**
- `student.name`, `student.enrollment_no`, `student.class_section`, `student.roll_no`, `student.dob`, `student.blood_group`, `student.father_name`, `student.mother_name`, `student.address`, `student.mobile`
- `photo`, `qr`, `barcode`
- `school.logo`, `school.name`
- `principal.signature`

**Employee**
- `employee.name`, `employee.employee_id`, `employee.designation`, `employee.department`, `employee.doj`, `employee.blood_group`, `employee.address`, `employee.mobile`
- `photo`, `qr`, `barcode`
- `org.logo`, `org.name`
- `authority.signature`

Custom static text can be added by leaving `binding` empty and setting `text` on the element (e.g. a header like `STUDENT IDENTITY CARD`).

## Rendering

The `id_card_render` Celery worker consumes `layout_json` + a student/employee record:

1. Fetches the primary photo (S3 signed URL).
2. Generates the QR payload — `{"student_id", "enrollment_no", "school_id"}` or the employee equivalent — via `qrcode` (PNG data URL).
3. Generates the barcode via `python-barcode` if used.
4. Feeds `layout_json` and the resolved values into a Jinja template that emits absolute-positioned HTML/CSS.
5. Playwright headless Chromium rasterizes to PDF and PNG at the requested DPI.
6. For `layout=a4-sheet`, ReportLab composes 10 cards on a 210 × 297 mm sheet with cut marks.
7. Multi-card jobs are packaged as a ZIP and uploaded to `s3://idcard-cards/…`; the job's `output_key` is stored.

## Choosing the Right Template at Generation Time

The Generate ID Cards page:

1. Module toggle — Student vs Employee.
2. School / Org selector.
3. Templates dropdown scoped to the selected module (multiple templates supported per module).
4. Layout (single or A4 sheet).
5. Format (PDF, PNG-in-ZIP, or a bundle).
6. Queue → poll job → download signed URL.

Because templates are versioned (`version` bumps on every save), an audit can trace which template + version produced any batch.
