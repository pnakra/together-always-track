import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { coupleQuery, nameOf } from "@/lib/couple";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/partner")({
  head: () => ({
    meta: [
      { title: "Partner | Together" },
      { name: "description", content: "Pair with your partner and manage location sharing." },
      { property: "og:title", content: "Partner | Together" },
      {
        property: "og:description",
        content: "Pair with your partner and manage location sharing.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Partner,
});

function Partner() {
  const qc = useQueryClient();
  const { data } = useQuery(coupleQuery);
  const [email, setEmail] = useState("");

  const partnerId = data?.partner?.id ?? null;

  const partnerSettings = useQuery({
    queryKey: ["partner-settings", partnerId],
    enabled: !!partnerId,
    queryFn: async () => {
      const { data: row, error } = await supabase
        .from("location_settings")
        .select("user_id, sharing_enabled")
        .eq("user_id", partnerId!)
        .maybeSingle();
      if (error) throw error;
      return row;
    },
  });

  const pair = useMutation({
    mutationFn: async (partnerEmail: string) => {
      const { data: auth } = await supabase.auth.getUser();
      const { data: found, error } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", partnerEmail.trim().toLowerCase())
        .maybeSingle();
      if (error) throw error;
      if (!found) throw new Error("No Together account with that email");
      const { error: insErr } = await supabase
        .from("couples")
        .insert({ user_a: auth.user!.id, user_b: found.id });
      if (insErr) throw insErr;
    },
    onSuccess: () => {
      setEmail("");
      toast.success("You're paired!");
      qc.invalidateQueries({ queryKey: ["couple"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not pair"),
  });

  // Writes sharing_enabled on the PARTNER's row.
  const togglePartnerSharing = useMutation({
    mutationFn: async (value: boolean) => {
      const { error } = await supabase
        .from("location_settings")
        .update({ sharing_enabled: value, updated_at: new Date().toISOString() })
        .eq("user_id", partnerId!);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["partner-settings", partnerId] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update"),
  });

  return (
    <main className="space-y-6">
      <section className="rounded-3xl border bg-card p-6 shadow-sm">
        <h1 className="text-lg font-semibold">Your partner</h1>
        {data?.partner ? (
          <p className="mt-2 text-sm text-muted-foreground">
            You're paired with{" "}
            <span className="font-medium text-foreground">{nameOf(data.partner)}</span> (
            {data.partner.email}).
          </p>
        ) : (
          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (email.trim()) pair.mutate(email);
            }}
          >
            <Label htmlFor="partner-email">Partner's email</Label>
            <Input
              id="partner-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="partner@example.com"
            />
            <Button type="submit" className="w-full rounded-full" disabled={pair.isPending}>
              Pair us up
            </Button>
          </form>
        )}
      </section>

      {data?.partner && (
        <section className="flex items-center justify-between gap-4 rounded-3xl border bg-card p-6 shadow-sm">
          <div>
            <p className="font-medium">Share my partner's location with me</p>
            <p className="text-sm text-muted-foreground">
              See where {nameOf(data.partner)} has been this week.
            </p>
          </div>
          <Switch
            checked={!!partnerSettings.data?.sharing_enabled}
            onCheckedChange={(v) => togglePartnerSharing.mutate(v)}
          />
        </section>
      )}
    </main>
  );
}
