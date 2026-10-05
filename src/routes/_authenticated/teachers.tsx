import { createFileRoute } from "@tanstack/react-router";
import { TeachersPage } from "@/app/pages/TeachersPage";

export const Route = createFileRoute("/_authenticated/teachers")({
  head: () => ({
    meta: [
      { title: "Users — Tirhut Technologies ID" },
      { name: "description", content: "Users in the Tirhut Technologies ID candidate ID card platform." },
      { property: "og:title", content: "Users — Tirhut Technologies ID" },
      { property: "og:description", content: "Users in the Tirhut Technologies ID candidate ID card platform." },
    ],
  }),
  component: TeachersPage,
});
