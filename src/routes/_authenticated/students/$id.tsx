import { createFileRoute } from "@tanstack/react-router";
import { StudentProfilePage } from "@/app/pages/StudentProfilePage";

export const Route = createFileRoute("/_authenticated/students/$id")({
  head: () => ({
    meta: [
      { title: "Candidate profile — Stark Industries ID" },
      { name: "description", content: "Candidate profile in the Stark Industries ID candidate ID card platform." },
      { property: "og:title", content: "Candidate profile — Stark Industries ID" },
      { property: "og:description", content: "Candidate profile in the Stark Industries ID candidate ID card platform." },
    ],
  }),
  component: StudentProfilePage,
});
