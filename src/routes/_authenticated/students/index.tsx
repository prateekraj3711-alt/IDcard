import { createFileRoute } from "@tanstack/react-router";
import { StudentsPage } from "@/app/pages/StudentsPage";

export const Route = createFileRoute("/_authenticated/students/")({
  head: () => ({
    meta: [
      { title: "Candidates — Tirhut-Tech Bhardwaj ID" },
      { name: "description", content: "Candidates in the Tirhut-Tech Bhardwaj ID candidate ID card platform." },
      { property: "og:title", content: "Candidates — Tirhut-Tech Bhardwaj ID" },
      { property: "og:description", content: "Candidates in the Tirhut-Tech Bhardwaj ID candidate ID card platform." },
    ],
  }),
  component: StudentsPage,
});
