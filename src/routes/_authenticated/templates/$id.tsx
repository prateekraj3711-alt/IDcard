import { createFileRoute, redirect } from "@tanstack/react-router";
import { TemplateEditorPage } from "@/app/pages/TemplateEditorPage";

export const Route = createFileRoute("/_authenticated/templates/$id")({
  beforeLoad: ({ context }) => {
    const user = (context as { user?: { role?: string } }).user;
    if (user?.role !== "super_admin") throw redirect({ to: "/students" });
  },
  head: () => ({
    meta: [
      { title: "Template editor — B&S Group ID" },
      { name: "description", content: "Template editor in the B&S Group ID candidate ID card platform." },
      { property: "og:title", content: "Template editor — B&S Group ID" },
      { property: "og:description", content: "Template editor in the B&S Group ID candidate ID card platform." },
    ],
  }),
  component: TemplateEditorPage,
});
