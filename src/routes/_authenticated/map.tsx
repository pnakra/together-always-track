import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { coupleQuery, nameOf } from "@/lib/couple";

export const Route = createFileRoute("/_authenticated/map")({
  head: () => ({
    meta: [
      { title: "Right now | Together" },
      { name: "description", content: "Your partner's approximate location, only while they share it." },
      { property: "og:title", content: "Right now | Together" },
      { property: "og:description", content: "Your partner's approximate location, only while they share it." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MapPage,
});

function MapPage() {
  const { data } = useQuery(coupleQuery);
  const paired = !!data?.couple;

  const current = useQuery({
    queryKey: ["partner-location"],
    enabled: paired,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data: rows, error } = await supabase.rpc("get_partner_current_location");
      if (error) throw error;
      return rows?.[0] ?? null;
    },
  });

  return (
    <main className="space-y-6">
      <section className="rounded-3xl border bg-card p-6 shadow-sm">
        <h1 className="text-lg font-semibold">Right now</h1>
        {!paired ? (
          <p className="mt-2 text-sm text-muted-foreground">Pair up to see this.</p>
        ) : current.data ? (
          <div className="mt-4 rounded-2xl bg-secondary px-4 py-3 text-sm">
            <p>
              {nameOf(data.partner)} is around{" "}
              <span className="font-mono">
                {current.data.lat.toFixed(2)}, {current.data.lng.toFixed(2)}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              Approximate, updated {new Date(current.data.recorded_at).toLocaleTimeString()}
            </p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            {current.isLoading ? "Loading…" : `${nameOf(data.partner)} isn't sharing their location right now.`}
          </p>
        )}
      </section>
    </main>
  );
}
