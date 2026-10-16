import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** The signed-in user's own sharing switch (owner-only). null when signed out. */
export const mySharingQuery = queryOptions({
  queryKey: ["my-sharing"],
  queryFn: async (): Promise<boolean | null> => {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) return null;
    const { data } = await supabase
      .from("location_settings")
      .select("sharing_enabled")
      .eq("user_id", uid)
      .maybeSingle();
    return !!data?.sharing_enabled;
  },
  refetchInterval: 30000,
});

/** Partner-location caches that must be dropped whenever access changes. */
export const PARTNER_LOCATION_KEYS = [["partner-location"], ["my-history"]] as const;

export async function setMySharing(qc: QueryClient, value: boolean) {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Not signed in");
  // Optimistically stop collection immediately when turning off.
  if (!value) qc.setQueryData(mySharingQuery.queryKey, false);
  const { error } = await supabase
    .from("location_settings")
    .update({ sharing_enabled: value })
    .eq("user_id", uid);
  if (error) throw error;
  qc.setQueryData(mySharingQuery.queryKey, value);
  if (!value) for (const key of PARTNER_LOCATION_KEYS) qc.removeQueries({ queryKey: key });
}
