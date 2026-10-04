import { createFileRoute } from "@tanstack/react-router";
import { AnalyticsPage } from "@/app/pages/AnalyticsPage";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — Stark Industries ID" },
      { name: "description", content: "Analytics in the Stark Industries ID candidate ID card platform." },
      { property: "og:title", content: "Analytics — Stark Industries ID" },
      { property: "og:description", content: "Analytics in the Stark Industries ID candidate ID card platform." },
    ],
  }),
  component: AnalyticsPage,
});
