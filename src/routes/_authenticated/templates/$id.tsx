import { createFileRoute, redirect } from "@tanstack/react-router";
import { TemplateEditorPage } from "@/app/pages/TemplateEditorPage";

export const Route = createFileRoute("/_authenticated/templates/$id")({
  beforeLoad: ({ context }) => {
    const user = (context as { user?: { role?: string } }).user;
    if (user?.role !== "super_admin") throw redirect({ to: "/students" });
  },
  head: () => ({
    meta: [
      { title: "Template editor — Tirhut Technologies ID" },
      { name: "description", content: "Template editor in the Tirhut Technologies ID candidate ID card platform." },
      { property: "og:title", content: "Template editor — Tirhut Technologies ID" },
      { property: "og:description", content: "Template editor in the Tirhut Technologies ID candidate ID card platform." },
    ],
  }),
  component: TemplateEditorPage,
});
