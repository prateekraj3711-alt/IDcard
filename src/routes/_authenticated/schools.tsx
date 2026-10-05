import { createFileRoute } from "@tanstack/react-router";
import { SchoolsPage } from "@/app/pages/SchoolsPage";

export const Route = createFileRoute("/_authenticated/schools")({
  head: () => ({
    meta: [
      { title: "Organizations — Tirhut Technologies ID" },
      { name: "description", content: "Organizations in the Tirhut Technologies ID candidate ID card platform." },
      { property: "og:title", content: "Organizations — Tirhut Technologies ID" },
      { property: "og:description", content: "Organizations in the Tirhut Technologies ID candidate ID card platform." },
    ],
  }),
  component: SchoolsPage,
});
