import { createFileRoute } from "@tanstack/react-router";
import { TeachersPage } from "@/app/pages/TeachersPage";

export const Route = createFileRoute("/_authenticated/teachers")({
  head: () => ({
    meta: [
      { title: "Users — Stark Industries ID" },
      { name: "description", content: "Users in the Stark Industries ID candidate ID card platform." },
      { property: "og:title", content: "Users — Stark Industries ID" },
      { property: "og:description", content: "Users in the Stark Industries ID candidate ID card platform." },
    ],
  }),
  component: TeachersPage,
});
