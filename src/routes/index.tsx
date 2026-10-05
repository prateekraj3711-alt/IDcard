import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Tirhut Technologies ID — Candidate ID Card Platform" },
      { name: "description", content: "Enroll candidates, capture photos and generate print-ready ID cards." },
      { property: "og:title", content: "Tirhut Technologies ID — Candidate ID Card Platform" },
      { property: "og:description", content: "Enroll candidates, capture photos and generate print-ready ID cards." },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
