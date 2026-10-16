import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { mySharingQuery, setMySharing } from "@/lib/sharing";
import { Button } from "@/components/ui/button";

/**
 * Records the signed-in user's position every 30 seconds only while their own
 * sharing is on, and shows a persistent app-wide indicator with one-tap stop.
 * Collection stops the moment sharing is turned off.
 */
export function LocationRecorder() {
  const qc = useQueryClient();
  const { data: sharing } = useQuery(mySharingQuery);
  const active = sharing === true;

  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !navigator.geolocation) return;
    let cancelled = false;

    const tick = async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid || cancelled) return;
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          if (cancelled || qc.getQueryData(mySharingQuery.queryKey) !== true) return;
          await supabase.from("location_points").insert({
            user_id: uid,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
      );
    };

    void tick();
    const id = window.setInterval(tick, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [active, qc]);

  if (!active) return null;

  return (
    <div
      role="status"
      className="sticky top-0 z-50 flex items-center justify-between gap-3 bg-primary px-4 py-2 text-sm text-primary-foreground"
    >
      <span className="flex items-center gap-2">
        <MapPin className="h-4 w-4" /> You're sharing your location with your partner
      </span>
      <Button
        size="sm"
        variant="secondary"
        className="rounded-full"
        onClick={async () => {
          try {
            await setMySharing(qc, false);
            toast.success("Location sharing stopped");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not stop sharing");
          }
        }}
      >
        Stop sharing
      </Button>
    </div>
  );
}
