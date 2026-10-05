import { createFileRoute } from "@tanstack/react-router";
import { SchoolsPage } from "@/app/pages/SchoolsPage";

export const Route = createFileRoute("/_authenticated/schools")({
  head: () => ({
    meta: [
      { title: "Organizations — B&S Group ID" },
      { name: "description", content: "Organizations in the B&S Group ID candidate ID card platform." },
      { property: "og:title", content: "Organizations — B&S Group ID" },
      { property: "og:description", content: "Organizations in the B&S Group ID candidate ID card platform." },
    ],
  }),
  component: SchoolsPage,
});
