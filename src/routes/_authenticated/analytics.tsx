import { createFileRoute, redirect } from "@tanstack/react-router";
import { AnalyticsPage } from "@/app/pages/AnalyticsPage";

export const Route = createFileRoute("/_authenticated/analytics")({
  // Super-admin only: users work from Candidates and must not see organization-wide data.
  beforeLoad: ({ context }) => {
    const user = (context as { user?: { role?: string } }).user;
    if (user?.role !== "super_admin") throw redirect({ to: "/students" });
  },
  head: () => ({
    meta: [
      { title: "Analytics — Tirhut-Tech Bhardwaj ID" },
      { name: "description", content: "Analytics in the Tirhut-Tech Bhardwaj ID candidate ID card platform." },
      { property: "og:title", content: "Analytics — Tirhut-Tech Bhardwaj ID" },
      { property: "og:description", content: "Analytics in the Tirhut-Tech Bhardwaj ID candidate ID card platform." },
    ],
  }),
  component: AnalyticsPage,
});
