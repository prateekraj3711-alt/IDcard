<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Storage is Lovable Cloud private buckets only (`student-photos`, `id-cards`) with school-id first path segment; never add S3/R2/external object storage — per-school RLS relies on the path.
- Web dashboard talks to the database directly via the browser client under RLS; only account admin and login resolution use server code — keeps the service role server-side.
- Android uses the compatibility API under `/api/public/v1/*`, acting as the caller's token (RLS applies) — preserves the existing app contract without a separate backend.
- ID cards render in the browser (canvas + pdf-lib) and store a PDF plus a PNG preview — Workers cannot run native renderers and mobile browsers can't preview PDFs inline.

- Every third-party client library the app imports is listed in `optimizeDeps.include` in vite.config.ts; add new ones there too — stops the preview re-bundling mid-session, which caused blank "Failed to fetch dynamically imported module" screens.
- UI says Organization/User/Candidate while the database, storage paths and Android API keep `schools`/`school_id`/teacher role/`students` — renaming storage would break RLS paths and the Android contract.
- Candidate details without a dedicated column live in `students.extra` (jsonb) and bind in templates as `extra.<key>` (also `student.<key>`/`employee.<key>`) — lets any data sheet column or form field print without schema changes.
- Card rendering always outputs 54x86 mm at >= 500 DPI (template coords scaled), A4 sheets hold exactly 10 cards, and text elements wrap and push lower overlapping elements down — print size/quality is fixed regardless of template pixel size.
- Imported card images get fields auto-placed by an AI layout server function (super-admin checked) and those text fields are `pinned`: they never move and shrink/wrap within the gap to the next field — printed labels on the design can't shift, unlike free-layout fields which push lower ones down.
- Class scoping for users is enforced in the database (`profiles.class_id`, restrictive RLS on students/photos/id_cards, and a trigger forcing a class-bound user's candidates into their class) — covers web and Android without client checks.
- Per-organization data-entry fields live in `schools.entry_fields` (null = ask all; `extra.<key>` for custom details) — super admin configures, user form reads it.
- Per-user entry fields live in `profiles.entry_fields` and override `schools.entry_fields` for that user's candidate form (null = fall back to organization) — lets each user be asked different details.
