import { createFileRoute, redirect } from "@tanstack/react-router";
import { GenerateIdCardsPage } from "@/app/pages/GenerateIdCardsPage";

function GenerateRoute() {
  const { ids, school } = Route.useSearch();
  const idList = ids ? ids.split(',').filter(Boolean) : undefined;
  return <GenerateIdCardsPage initialIds={idList} initialSchool={school} />;
}

export const Route = createFileRoute("/_authenticated/generate")({
  validateSearch: (search: Record<string, unknown>) => ({
    ids: typeof search.ids === "string" ? search.ids : undefined,
    school: typeof search.school === "string" && search.school ? search.school : undefined,
  }),
  beforeLoad: ({ context }) => {
    const user = (context as { user?: { role?: string } }).user;
    if (user?.role !== "super_admin") throw redirect({ to: "/students" });
  },
  head: () => ({
    meta: [
      { title: "Generate ID Cards — Stark Industries ID" },
      { name: "description", content: "Generate ID Cards in the Stark Industries ID candidate ID card platform." },
      { property: "og:title", content: "Generate ID Cards — Stark Industries ID" },
      { property: "og:description", content: "Generate ID Cards in the Stark Industries ID candidate ID card platform." },
    ],
  }),
  component: GenerateRoute,
});
