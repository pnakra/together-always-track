import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { coupleQuery, nameOf } from "@/lib/couple";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({
    meta: [
      { title: "Home | Together" },
      { name: "description", content: "Your couple's home: names and shared date ideas." },
      { property: "og:title", content: "Home | Together" },
      { property: "og:description", content: "Your couple's home: names and shared date ideas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

function Home() {
  const qc = useQueryClient();
  const { data } = useQuery(coupleQuery);
  const coupleId = data?.couple?.id ?? null;
  const [title, setTitle] = useState("");

  const dates = useQuery({
    queryKey: ["dates", coupleId],
    enabled: !!coupleId,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("dates")
        .select("id, title, created_at")
        .eq("couple_id", coupleId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return rows;
    },
  });

  const addDate = useMutation({
    mutationFn: async (value: string) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("dates")
        .insert({ couple_id: coupleId!, created_by: auth.user!.id, title: value });
      if (error) throw error;
    },
    onSuccess: () => {
      setTitle("");
      qc.invalidateQueries({ queryKey: ["dates", coupleId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not add"),
  });

  return (
    <main className="space-y-6">
      <section className="rounded-3xl border bg-card p-6 text-center shadow-sm">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Us</p>
        <h1 className="mt-2 text-2xl font-semibold">
          {nameOf(data?.me)}
          {data?.partner ? ` & ${nameOf(data.partner)}` : ""}
        </h1>
        {!data?.partner && (
          <p className="mt-2 text-sm text-muted-foreground">
            You haven't paired yet — add your partner on the Partner tab.
          </p>
        )}
      </section>

      <section className="rounded-3xl border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Our dates</h2>
        <p className="text-sm text-muted-foreground">Little plans for the two of you.</p>

        {coupleId ? (
          <>
            <form
              className="mt-4 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (title.trim()) addDate.mutate(title.trim());
              }}
            >
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Picnic by the lake"
              />
              <Button type="submit" className="rounded-full" disabled={addDate.isPending}>
                Add
              </Button>
            </form>

            <ul className="mt-4 space-y-2">
              {dates.data?.length ? (
                dates.data.map((d) => (
                  <li key={d.id} className="rounded-2xl bg-secondary px-4 py-3 text-sm">
                    {d.title}
                  </li>
                ))
              ) : (
                <li className="text-sm text-muted-foreground">No date ideas yet.</li>
              )}
            </ul>
          </>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">Pair up first to plan dates.</p>
        )}
      </section>
    </main>
  );
}
