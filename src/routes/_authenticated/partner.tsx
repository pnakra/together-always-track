import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { coupleQuery, nameOf } from "@/lib/couple";
import { mySharingQuery, setMySharing, PARTNER_LOCATION_KEYS } from "@/lib/sharing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/partner")({
  head: () => ({
    meta: [
      { title: "Partner | Together" },
      { name: "description", content: "Invite your partner and control what you share." },
      { property: "og:title", content: "Partner | Together" },
      { property: "og:description", content: "Invite your partner and control what you share." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Partner,
});

const card = "rounded-3xl border bg-card p-6 shadow-sm";

function Partner() {
  const qc = useQueryClient();
  const { data } = useQuery(coupleQuery);
  const { data: sharing } = useQuery(mySharingQuery);
  const [email, setEmail] = useState("");
  const uid = data?.me.id;

  const incoming = useQuery({
    queryKey: ["invites-in"],
    enabled: !!uid && !data?.couple,
    queryFn: async () => {
      const { data: rows, error } = await supabase.rpc("list_incoming_invitations");
      if (error) throw error;
      return rows;
    },
  });

  const outgoing = useQuery({
    queryKey: ["invites-out", uid],
    enabled: !!uid && !data?.couple,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("couple_invitations")
        .select("id, created_at")
        .eq("inviter", uid!)
        .eq("status", "pending");
      if (error) throw error;
      return rows;
    },
  });

  const perms = useQuery({
    queryKey: ["field-perms", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data: row, error } = await supabase
        .from("profile_field_permissions")
        .select("share_email, share_display_name")
        .eq("user_id", uid!)
        .maybeSingle();
      if (error) throw error;
      return row ?? { share_email: false, share_display_name: false };
    },
  });

  const history = useQuery({
    queryKey: ["my-history", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("location_points")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid!);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const invite = useMutation({
    mutationFn: async (partnerEmail: string) => {
      const { error } = await supabase.rpc("send_couple_invitation", { _email: partnerEmail });
      if (error) throw error;
    },
    onSuccess: () => {
      setEmail("");
      toast.success("If that email has a Together account, they'll see your invitation.");
      qc.invalidateQueries({ queryKey: ["invites-out"] });
    },
    onError: () => toast.error("Could not send invitation"),
  });

  const respond = useMutation({
    mutationFn: async ({ id, accept }: { id: string; accept: boolean }) => {
      const { error } = await supabase.rpc("respond_couple_invitation", { _id: id, _accept: accept });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invites-in"] });
      qc.invalidateQueries({ queryKey: ["couple"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not respond"),
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("cancel_couple_invitation", { _id: id });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invites-out"] }),
  });

  const toggleMine = useMutation({
    mutationFn: (value: boolean) => setMySharing(qc, value),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update"),
  });

  const setPerm = useMutation({
    mutationFn: async (patch: { share_email?: boolean; share_display_name?: boolean }) => {
      const { error } = await supabase
        .from("profile_field_permissions")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("user_id", uid!);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["field-perms", uid] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update"),
  });

  const clearHistory = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("location_points").delete().eq("user_id", uid!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Your location history was deleted");
      qc.invalidateQueries({ queryKey: ["my-history", uid] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not clear history"),
  });

  const unlink = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("couples").delete().eq("id", data!.couple!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      for (const key of PARTNER_LOCATION_KEYS) qc.removeQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["couple"] });
      toast.success("You're no longer paired");
    },
  });

  return (
    <main className="space-y-6">
      <section className={card}>
        <h1 className="text-lg font-semibold">Your partner</h1>
        {data?.couple ? (
          <div className="mt-2 space-y-3">
            <p className="text-sm text-muted-foreground">
              You're paired with{" "}
              <span className="font-medium text-foreground">{nameOf(data.partner)}</span>
              {data.partner?.email ? ` (${data.partner.email})` : ""}.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => unlink.mutate()}
              disabled={unlink.isPending}
            >
              Unpair
            </Button>
          </div>
        ) : (
          <>
            <form
              className="mt-4 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (email.trim()) invite.mutate(email);
              }}
            >
              <Label htmlFor="partner-email">Invite your partner by email</Label>
              <Input
                id="partner-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="partner@example.com"
              />
              <Button type="submit" className="w-full rounded-full" disabled={invite.isPending}>
                Send invitation
              </Button>
              <p className="text-xs text-muted-foreground">
                You'll only be paired once they accept.
              </p>
            </form>

            {!!incoming.data?.length && (
              <ul className="mt-5 space-y-2">
                {incoming.data.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-2 rounded-2xl bg-secondary px-4 py-3 text-sm">
                    <span>{i.inviter_name ?? "Someone"} invited you to pair</span>
                    <span className="flex gap-2">
                      <Button size="sm" className="rounded-full" onClick={() => respond.mutate({ id: i.id, accept: true })}>
                        Accept
                      </Button>
                      <Button size="sm" variant="ghost" className="rounded-full" onClick={() => respond.mutate({ id: i.id, accept: false })}>
                        Decline
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {!!outgoing.data?.length && (
              <ul className="mt-5 space-y-2">
                {outgoing.data.map((o) => (
                  <li key={o.id} className="flex items-center justify-between rounded-2xl bg-secondary px-4 py-3 text-sm">
                    <span>Invitation pending</span>
                    <Button size="sm" variant="ghost" className="rounded-full" onClick={() => cancel.mutate(o.id)}>
                      Cancel
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      <section className={`${card} flex items-center justify-between gap-4`}>
        <div>
          <Label htmlFor="share-mine" className="font-medium">Share my location</Label>
          <p className="text-sm text-muted-foreground">
            Your partner sees only your current approximate spot while this is on. Off by default.
          </p>
        </div>
        <Switch
          id="share-mine"
          checked={sharing === true}
          onCheckedChange={(v) => toggleMine.mutate(v)}
        />
      </section>

      <section className={`${card} space-y-4`}>
        <h2 className="font-semibold">What my partner can see</h2>
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="share-name">My display name</Label>
          <Switch
            id="share-name"
            checked={!!perms.data?.share_display_name}
            onCheckedChange={(v) => setPerm.mutate({ share_display_name: v })}
          />
        </div>
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="share-email">My email</Label>
          <Switch
            id="share-email"
            checked={!!perms.data?.share_email}
            onCheckedChange={(v) => setPerm.mutate({ share_email: v })}
          />
        </div>
      </section>

      <section className={`${card} space-y-3`}>
        <h2 className="font-semibold">My location history</h2>
        <p className="text-sm text-muted-foreground">
          Private to you — your partner can't see it. Points are deleted automatically after 24
          hours.
        </p>
        <p className="text-sm">
          {history.data ?? 0} saved {history.data === 1 ? "point" : "points"}
        </p>
        <Button
          variant="outline"
          className="rounded-full"
          disabled={clearHistory.isPending || !history.data}
          onClick={() => clearHistory.mutate()}
        >
          Clear my history
        </Button>
      </section>
    </main>
  );
}
