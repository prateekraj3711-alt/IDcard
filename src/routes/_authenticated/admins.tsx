import { createFileRoute } from "@tanstack/react-router";
import { AdminsPage } from "@/app/pages/AdminsPage";

export const Route = createFileRoute("/_authenticated/admins")({
  head: () => ({
    meta: [
      { title: "Super Admins — Tirhut Technologies ID" },
      { name: "description", content: "Super Admins in the Tirhut Technologies ID candidate ID card platform." },
      { property: "og:title", content: "Super Admins — Tirhut Technologies ID" },
      { property: "og:description", content: "Super Admins in the Tirhut Technologies ID candidate ID card platform." },
    ],
  }),
  component: AdminsPage,
});
