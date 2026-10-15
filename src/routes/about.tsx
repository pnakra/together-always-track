import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About this demo | Together" },
      {
        name: "description",
        content:
          "Together is a test app with planted misuse patterns, built to demonstrate Misuse Check.",
      },
      { property: "og:title", content: "About this demo | Together" },
      {
        property: "og:description",
        content:
          "Together is a test app with planted misuse patterns, built to demonstrate Misuse Check.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: About,
});

function About() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-5 py-12">
      <h1 className="text-2xl font-semibold">About this demo</h1>
      <div className="rounded-3xl border bg-card p-6 text-sm leading-relaxed text-card-foreground shadow-sm">
        Together is a test app with planted misuse patterns, built to demonstrate Misuse Check.
        Don't use it with real people.
      </div>
      <Link to="/" className="text-sm text-primary underline underline-offset-4">
        Back
      </Link>
    </main>
  );
}
