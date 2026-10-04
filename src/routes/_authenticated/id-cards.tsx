import { createFileRoute } from "@tanstack/react-router";
import { IdCardsPage } from "@/app/pages/IdCardsPage";

export const Route = createFileRoute("/_authenticated/id-cards")({
  head: () => ({
    meta: [
      { title: "ID Cards — Stark Industries ID" },
      { name: "description", content: "ID Cards in the Stark Industries ID candidate ID card platform." },
      { property: "og:title", content: "ID Cards — Stark Industries ID" },
      { property: "og:description", content: "ID Cards in the Stark Industries ID candidate ID card platform." },
    ],
  }),
  component: IdCardsPage,
});
