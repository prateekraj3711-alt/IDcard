import { createFileRoute } from "@tanstack/react-router";
import { StudentProfilePage } from "@/app/pages/StudentProfilePage";

export const Route = createFileRoute("/_authenticated/students/$id")({
  head: () => ({
    meta: [
      { title: "Candidate profile — B&S Group ID" },
      { name: "description", content: "Candidate profile in the B&S Group ID candidate ID card platform." },
      { property: "og:title", content: "Candidate profile — B&S Group ID" },
      { property: "og:description", content: "Candidate profile in the B&S Group ID candidate ID card platform." },
    ],
  }),
  component: StudentProfilePage,
});
