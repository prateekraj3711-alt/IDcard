import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "@/app/pages/DashboardPage";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Stark Industries ID" },
      { name: "description", content: "Dashboard in the Stark Industries ID candidate ID card platform." },
      { property: "og:title", content: "Dashboard — Stark Industries ID" },
      { property: "og:description", content: "Dashboard in the Stark Industries ID candidate ID card platform." },
    ],
  }),
  component: DashboardPage,
});
