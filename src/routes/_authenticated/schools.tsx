import { createFileRoute } from "@tanstack/react-router";
import { SchoolsPage } from "@/app/pages/SchoolsPage";

export const Route = createFileRoute("/_authenticated/schools")({
  head: () => ({
    meta: [
      { title: "Organizations — Tirhut-Tech Bhardwaj ID" },
      { name: "description", content: "Organizations in the Tirhut-Tech Bhardwaj ID candidate ID card platform." },
      { property: "og:title", content: "Organizations — Tirhut-Tech Bhardwaj ID" },
      { property: "og:description", content: "Organizations in the Tirhut-Tech Bhardwaj ID candidate ID card platform." },
    ],
  }),
  component: SchoolsPage,
});
