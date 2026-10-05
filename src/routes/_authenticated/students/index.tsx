import { createFileRoute } from "@tanstack/react-router";
import { StudentsPage } from "@/app/pages/StudentsPage";

export const Route = createFileRoute("/_authenticated/students/")({
  head: () => ({
    meta: [
      { title: "Candidates — B&S Group ID" },
      { name: "description", content: "Candidates in the B&S Group ID candidate ID card platform." },
      { property: "og:title", content: "Candidates — B&S Group ID" },
      { property: "og:description", content: "Candidates in the B&S Group ID candidate ID card platform." },
    ],
  }),
  component: StudentsPage,
});
