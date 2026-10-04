import { createFileRoute } from "@tanstack/react-router";
import { LoginPage } from "@/app/pages/LoginPage";

export const Route = createFileRoute("/login")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — Stark Industries ID" },
      { name: "description", content: "Sign in to manage organizations, candidates, photos and ID cards." },
      { property: "og:title", content: "Sign in — Stark Industries ID" },
      { property: "og:description", content: "Sign in to manage organizations, candidates, photos and ID cards." },
    ],
  }),
  component: LoginPage,
});
