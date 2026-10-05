import { createFileRoute } from "@tanstack/react-router";
import { TeachersPage } from "@/app/pages/TeachersPage";

export const Route = createFileRoute("/_authenticated/teachers")({
  head: () => ({
    meta: [
      { title: "Users — B&S Group ID" },
      { name: "description", content: "Users in the B&S Group ID candidate ID card platform." },
      { property: "og:title", content: "Users — B&S Group ID" },
      { property: "og:description", content: "Users in the B&S Group ID candidate ID card platform." },
    ],
  }),
  component: TeachersPage,
});
