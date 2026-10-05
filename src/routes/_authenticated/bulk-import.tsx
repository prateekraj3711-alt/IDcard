import { createFileRoute, redirect } from "@tanstack/react-router";
import { BulkImportPage } from "@/app/pages/BulkImportPage";

export const Route = createFileRoute("/_authenticated/bulk-import")({
  beforeLoad: ({ context }) => {
    const user = (context as { user?: { role?: string } }).user;
    if (user?.role !== "super_admin") throw redirect({ to: "/students" });
  },
  head: () => ({
    meta: [
      { title: "Bulk Generate — B&S Group ID" },
      { name: "description", content: "Bulk ID card generation in the B&S Group ID candidate ID card platform." },
      { property: "og:title", content: "Bulk Generate — B&S Group ID" },
      { property: "og:description", content: "Bulk ID card generation in the B&S Group ID candidate ID card platform." },
    ],
  }),
  component: BulkImportPage,
});
