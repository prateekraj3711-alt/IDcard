import { createFileRoute } from "@tanstack/react-router";
import { SchoolsPage } from "@/app/pages/SchoolsPage";

export const Route = createFileRoute("/_authenticated/schools")({
  head: () => ({
    meta: [
      { title: "Organizations — Stark Industries ID" },
      { name: "description", content: "Organizations in the Stark Industries ID candidate ID card platform." },
      { property: "og:title", content: "Organizations — Stark Industries ID" },
      { property: "og:description", content: "Organizations in the Stark Industries ID candidate ID card platform." },
    ],
  }),
  component: SchoolsPage,
});
