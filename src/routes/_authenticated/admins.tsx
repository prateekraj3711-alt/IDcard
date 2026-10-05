import { createFileRoute } from "@tanstack/react-router";
import { AdminsPage } from "@/app/pages/AdminsPage";

export const Route = createFileRoute("/_authenticated/admins")({
  head: () => ({
    meta: [
      { title: "Super Admins — B&S Group ID" },
      { name: "description", content: "Super Admins in the B&S Group ID candidate ID card platform." },
      { property: "og:title", content: "Super Admins — B&S Group ID" },
      { property: "og:description", content: "Super Admins in the B&S Group ID candidate ID card platform." },
    ],
  }),
  component: AdminsPage,
});
