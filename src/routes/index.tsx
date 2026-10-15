import { useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { DemoFooter } from "@/components/DemoFooter";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Together — stay close with your partner" },
      {
        name: "description",
        content: "Together is a sweet, simple app for couples to share plans and places.",
      },
      { property: "og:title", content: "Together — stay close with your partner" },
      {
        property: "og:description",
        content: "Together is a sweet, simple app for couples to share plans and places.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) void navigate({ to: "/home" });
    });
  }, [navigate]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10 text-center">
      <div className="text-5xl">💞</div>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Together</h1>
      <p className="mt-3 text-muted-foreground">
        A sweet little place for the two of you — your dates, and where you've been.
      </p>
      <Button asChild className="mx-auto mt-8 w-full rounded-full">
        <Link to="/auth">Get started</Link>
      </Button>
      <DemoFooter />
    </main>
  );
}
