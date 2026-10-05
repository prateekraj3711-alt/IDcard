import { createFileRoute } from "@tanstack/react-router";
import { LoginPage } from "@/app/pages/LoginPage";

export const Route = createFileRoute("/login")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — Tirhut Technologies ID" },
      { name: "description", content: "Sign in to manage organizations, candidates, photos and ID cards." },
      { property: "og:title", content: "Sign in — Tirhut Technologies ID" },
      { property: "og:description", content: "Sign in to manage organizations, candidates, photos and ID cards." },
    ],
  }),
  component: LoginPage,
});
