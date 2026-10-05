import { createFileRoute, redirect } from "@tanstack/react-router";
import { DashboardPage } from "@/app/pages/DashboardPage";

export const Route = createFileRoute("/_authenticated/dashboard")({
  // Super-admin only: users work from Candidates and must not see organization-wide data.
  beforeLoad: ({ context }) => {
    const user = (context as { user?: { role?: string } }).user;
    if (user?.role !== "super_admin") throw redirect({ to: "/students" });
  },
  head: () => ({
    meta: [
      { title: "Dashboard — Tirhut Technologies ID" },
      { name: "description", content: "Dashboard in the Tirhut Technologies ID candidate ID card platform." },
      { property: "og:title", content: "Dashboard — Tirhut Technologies ID" },
      { property: "og:description", content: "Dashboard in the Tirhut Technologies ID candidate ID card platform." },
    ],
  }),
  component: DashboardPage,
});
