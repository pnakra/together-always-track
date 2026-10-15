import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { coupleQuery, nameOf } from "@/lib/couple";

export const Route = createFileRoute("/_authenticated/map")({
  head: () => ({
    meta: [
      { title: "Map | Together" },
      { name: "description", content: "Where your partner has been this week." },
      { property: "og:title", content: "Map | Together" },
      { property: "og:description", content: "Where your partner has been this week." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MapPage,
});

function MapPage() {
  const { data } = useQuery(coupleQuery);
  const partnerId = data?.partner?.id ?? null;

  const points = useQuery({
    queryKey: ["points", partnerId],
    enabled: !!partnerId,
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: rows, error } = await supabase
        .from("location_points")
        .select("id, lat, lng, recorded_at")
        .eq("user_id", partnerId!)
        .gte("recorded_at", since)
        .order("recorded_at", { ascending: false });
      if (error) throw error;
      return rows;
    },
  });

  return (
    <main className="space-y-6">
      <section className="rounded-3xl border bg-card p-6 shadow-sm">
        <h1 className="text-lg font-semibold">Where they've been this week</h1>
        <p className="text-sm text-muted-foreground">
          {data?.partner ? `${nameOf(data.partner)}'s last 7 days.` : "Pair up to see this."}
        </p>

        <ul className="mt-4 space-y-2" data-testid="point-list">
          {points.data?.length ? (
            points.data.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded-2xl bg-secondary px-4 py-3 text-sm"
              >
                <span>{new Date(p.recorded_at).toLocaleString()}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {p.lat.toFixed(4)}, {p.lng.toFixed(4)}
                </span>
              </li>
            ))
          ) : (
            <li className="text-sm text-muted-foreground">
              {points.isLoading ? "Loading…" : "No places recorded this week."}
            </li>
          )}
        </ul>
      </section>
    </main>
  );
}
