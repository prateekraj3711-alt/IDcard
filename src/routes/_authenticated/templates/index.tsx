import { createFileRoute, redirect } from "@tanstack/react-router";
import { TemplatesPage } from "@/app/pages/TemplatesPage";

export const Route = createFileRoute("/_authenticated/templates/")({
  beforeLoad: ({ context }) => {
    const user = (context as { user?: { role?: string } }).user;
    if (user?.role !== "super_admin") throw redirect({ to: "/students" });
  },
  head: () => ({
    meta: [
      { title: "ID Card Templates — Stark Industries ID" },
      { name: "description", content: "ID Card Templates in the Stark Industries ID candidate ID card platform." },
      { property: "og:title", content: "ID Card Templates — Stark Industries ID" },
      { property: "og:description", content: "ID Card Templates in the Stark Industries ID candidate ID card platform." },
    ],
  }),
  component: TemplatesPage,
});
