import { createFileRoute, redirect } from "@tanstack/react-router";
import { BulkImportPage } from "@/app/pages/BulkImportPage";

export const Route = createFileRoute("/_authenticated/bulk-import")({
  beforeLoad: ({ context }) => {
    const user = (context as { user?: { role?: string } }).user;
    if (user?.role !== "super_admin") throw redirect({ to: "/students" });
  },
  head: () => ({
    meta: [
      { title: "Bulk Generate — Tirhut Technologies ID" },
      { name: "description", content: "Bulk ID card generation in the Tirhut Technologies ID candidate ID card platform." },
      { property: "og:title", content: "Bulk Generate — Tirhut Technologies ID" },
      { property: "og:description", content: "Bulk ID card generation in the Tirhut Technologies ID candidate ID card platform." },
    ],
  }),
  component: BulkImportPage,
});
