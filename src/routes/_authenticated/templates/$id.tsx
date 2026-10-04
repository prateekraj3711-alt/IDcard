import { createFileRoute, redirect } from "@tanstack/react-router";
import { TemplateEditorPage } from "@/app/pages/TemplateEditorPage";

export const Route = createFileRoute("/_authenticated/templates/$id")({
  beforeLoad: ({ context }) => {
    const user = (context as { user?: { role?: string } }).user;
    if (user?.role !== "super_admin") throw redirect({ to: "/students" });
  },
  head: () => ({
    meta: [
      { title: "Template editor — Stark Industries ID" },
      { name: "description", content: "Template editor in the Stark Industries ID candidate ID card platform." },
      { property: "og:title", content: "Template editor — Stark Industries ID" },
      { property: "og:description", content: "Template editor in the Stark Industries ID candidate ID card platform." },
    ],
  }),
  component: TemplateEditorPage,
});
