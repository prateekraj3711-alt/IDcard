// AI layout detection for card background images: finds printed labels
// ("Class :", "D.O.B.:", "Address :") and the photo box, and returns where
// each candidate value should be drawn. Super admin only.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const DETECT_BINDINGS: Record<string, string> = {
  "student.name": "Candidate full name",
  "student.class": "Class / standard / grade",
  "student.section": "Section (Sec.)",
  "student.roll_no": "Roll number",
  "student.enrollment_no": "Enrollment / admission / employee / ID number",
  "student.father_name": "Father's name (F. Name)",
  "student.mother_name": "Mother's name (M. Name)",
  "student.dob": "Date of birth (D.O.B.)",
  "student.age": "Age",
  "student.gender": "Gender",
  "student.blood_group": "Blood group",
  "student.mobile": "Mobile / phone / contact number of the candidate",
  "student.address": "Candidate's address",
  "extra.designation": "Designation / post",
  "extra.department": "Department",
  "extra.doj": "Date of joining",
  "extra.valid_till": "Valid till / validity",
  "extra.emergency_contact": "Emergency contact",
  "extra.email": "Email",
};

const Box = z.tuple([z.number(), z.number(), z.number(), z.number()]);
export const FONT_FAMILIES = ["Arial", "Arial Narrow", "Verdana", "Tahoma", "Times New Roman", "Georgia", "Courier New", "Impact"] as const;
const Result = z.object({
  fields: z.array(z.object({
    binding: z.string(), label_text: z.string().optional(), value_box: Box,
    label_box: Box.nullable().optional(), bold: z.boolean().optional(), italic: z.boolean().optional(),
    color: z.string().optional(), font_family: z.string().optional(),
  })).default([]),
  photo_box: Box.nullable().optional(),
  signature_box: Box.nullable().optional(),
});
export type DetectResult = z.infer<typeof Result>;

const PROMPT = `You are laying out an ID card template. The image is an empty card design with printed labels.
Find every printed label that expects a per-person value (for example "Class :", "Sec.:", "Roll No.:", "F. Name :", "Mob. No.:", "D.O.B.:", "Address :").
Ignore the organization's own name, address, phone numbers, logo, session/year text, "IDENTITY CARD" and "Principal"/signature captions — those are fixed artwork.
For each label return the EMPTY area where the value should be written: it starts just right of the label's colon and extends to the right until the next label on the same line or the card edge (minus a small margin). Its height equals the label's text height. For "Address" make the box tall enough for 2 lines.
If the card has no "Name" label, add a "student.name" box: a single line centered directly below the photo box, the photo's width or wider, spanning the empty band below the photo.
Also report how each label is typeset so the value can match it exactly: label_box = a TIGHT box around the label's glyphs (top of tallest letter to baseline/bottom of lowest letter), bold (true if the label is bold), italic, color (hex like #222222 of the label text), and font_family = the closest match from: ${FONT_FAMILIES.join(", ")}.
For the added student.name box (no printed label) use the style of the most prominent nearby text, bold, slightly larger than the labels, and set label_box to null.
Also return the photo box (the empty rectangle/frame for the person's photo), or null.
Also return signature_box: the empty area just ABOVE the authorised-signatory caption (e.g. "Principal", "Authorised Signatory", "Director", "Manager", "Signature"), as wide as the caption or a bit wider and about 2-3x its text height, where a signature image should be placed; or null if there is no such caption.
Coordinates: [x0, y0, x1, y1] normalized to 0-1000 of image width and height, origin top-left.
Allowed bindings (use exactly one per label):
${Object.entries(DETECT_BINDINGS).map(([k, v]) => `- ${k}: ${v}`).join("\n")}`;

export const detectTemplateFields = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ image: z.string().startsWith("data:image/").max(8_000_000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await (context.supabase as unknown as {
      rpc: (f: string, a: Record<string, unknown>) => PromiseLike<{ data: unknown }>;
    }).rpc("has_role", { _user_id: context.userId, _role: "super_admin" });
    if (!isAdmin) throw new Error("Only super admins can set up templates.");
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("AI is not configured.");

    const box = { type: "array", items: { type: "number" } };
    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: { "Lovable-API-Key": key, "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        stream: true,
        store: false,
        reasoning: { effort: "medium", summary: "auto" },
        include: ["reasoning.encrypted_content"],
        input: [{ role: "user", content: [
          { type: "input_text", text: PROMPT },
          { type: "input_image", image_url: data.image, detail: "high" },
        ] }],
        text: { format: { type: "json_schema", name: "card_layout", strict: true, schema: {
          type: "object", additionalProperties: false, required: ["fields", "photo_box", "signature_box"],
          properties: {
            fields: { type: "array", items: {
              type: "object", additionalProperties: false, required: ["binding", "label_text", "value_box", "label_box", "bold", "italic", "color", "font_family"],
              properties: {
                binding: { type: "string", enum: Object.keys(DETECT_BINDINGS) },
                label_text: { type: "string" },
                value_box: box,
                label_box: { anyOf: [box, { type: "null" }] },
                bold: { type: "boolean" },
                italic: { type: "boolean" },
                color: { type: "string" },
                font_family: { type: "string", enum: [...FONT_FAMILIES] },
              },
            } },
            photo_box: { anyOf: [box, { type: "null" }] },
            signature_box: { anyOf: [box, { type: "null" }] },
          },
        } } },
      }),
    });
    if (res.status === 429) throw new Error("Too many requests right now — try again in a minute.");
    if (res.status === 402) throw new Error("AI credits are used up. Add credits in Settings → Workspace → Usage.");
    if (!res.ok || !res.body) throw new Error(`Field detection failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
    let out = "", buf = "", done = "";
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    for (;;) {
      const { value, done: end } = await reader.read();
      if (end) break;
      buf += value;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line.startsWith("data:")) continue;
        const raw = line.slice(5).trim();
        if (!raw || raw === "[DONE]") continue;
        let ev: { type?: string; delta?: string; text?: string; error?: { message?: string }; response?: { error?: { message?: string } } };
        try { ev = JSON.parse(raw); } catch { continue; }
        if (ev.type === "response.output_text.delta" && ev.delta) out += ev.delta;
        else if (ev.type === "response.output_text.done" && ev.text) done = ev.text;
        else if (ev.type === "error" || ev.type === "response.failed")
          throw new Error(`Field detection failed: ${ev.error?.message ?? ev.response?.error?.message ?? "unknown error"}`);
      }
    }
    const args = done || out;
    if (!args) throw new Error("Field detection returned no layout.");
    const parsed = Result.parse(JSON.parse(args));
    const seen = new Set<string>();
    parsed.fields = parsed.fields.filter((f) => DETECT_BINDINGS[f.binding] && !seen.has(f.binding) && seen.add(f.binding));
    return parsed;
  });
