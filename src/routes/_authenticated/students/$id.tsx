import { createFileRoute } from "@tanstack/react-router";
import { StudentProfilePage } from "@/app/pages/StudentProfilePage";

export const Route = createFileRoute("/_authenticated/students/$id")({
  head: () => ({
    meta: [
      { title: "Candidate profile — Tirhut Technologies ID" },
      { name: "description", content: "Candidate profile in the Tirhut Technologies ID candidate ID card platform." },
      { property: "og:title", content: "Candidate profile — Tirhut Technologies ID" },
      { property: "og:description", content: "Candidate profile in the Tirhut Technologies ID candidate ID card platform." },
    ],
  }),
  component: StudentProfilePage,
});
