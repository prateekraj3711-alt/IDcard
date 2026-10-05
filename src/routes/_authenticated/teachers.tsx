import { createFileRoute } from "@tanstack/react-router";
import { TeachersPage } from "@/app/pages/TeachersPage";

export const Route = createFileRoute("/_authenticated/teachers")({
  head: () => ({
    meta: [
      { title: "Users — Tirhut-Tech Bhardwaj ID" },
      { name: "description", content: "Users in the Tirhut-Tech Bhardwaj ID candidate ID card platform." },
      { property: "og:title", content: "Users — Tirhut-Tech Bhardwaj ID" },
      { property: "og:description", content: "Users in the Tirhut-Tech Bhardwaj ID candidate ID card platform." },
    ],
  }),
  component: TeachersPage,
});
