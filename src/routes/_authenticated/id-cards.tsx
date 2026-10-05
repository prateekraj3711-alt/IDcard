import { createFileRoute, redirect } from "@tanstack/react-router";
import { IdCardsPage } from "@/app/pages/IdCardsPage";

export const Route = createFileRoute("/_authenticated/id-cards")({
  // Super-admin only: users work from Candidates and must not see organization-wide data.
  beforeLoad: ({ context }) => {
    const user = (context as { user?: { role?: string } }).user;
    if (user?.role !== "super_admin") throw redirect({ to: "/students" });
  },
  head: () => ({
    meta: [
      { title: "ID Cards — B&S Group ID" },
      { name: "description", content: "ID Cards in the B&S Group ID candidate ID card platform." },
      { property: "og:title", content: "ID Cards — B&S Group ID" },
      { property: "og:description", content: "ID Cards in the B&S Group ID candidate ID card platform." },
    ],
  }),
  component: IdCardsPage,
});
