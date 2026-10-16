import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Profile = { id: string; email: string | null; display_name: string | null };

export type CoupleInfo = {
  me: Profile;
  couple: { id: string; user_a: string; user_b: string } | null;
  partner: Profile | null;
};

export const coupleQuery = queryOptions({
  queryKey: ["couple"],
  queryFn: async (): Promise<CoupleInfo> => {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) throw new Error("Not signed in");

    const { data: me, error: meErr } = await supabase
      .from("profiles")
      .select("id, email, display_name")
      .eq("id", uid)
      .single();
    if (meErr) throw meErr;

    const { data: couple } = await supabase
      .from("couples")
      .select("id, user_a, user_b")
      .or(`user_a.eq.${uid},user_b.eq.${uid}`)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    let partner: Profile | null = null;
    if (couple) {
      // Partner fields are only returned if the partner opted in to share them.
      const { data } = await supabase.rpc("get_partner_profile");
      partner = data?.[0] ?? null;
    }
    return { me, couple, partner };
  },
});

export const nameOf = (p: Profile | null | undefined) =>
  p?.display_name || p?.email?.split("@")[0] || (p ? "Your partner" : "");
