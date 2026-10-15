import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Records the signed-in user's position every 30 seconds while their own
 * location_settings.sharing_enabled is true. Renders nothing.
 */
export function LocationRecorder() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    let cancelled = false;

    const tick = async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid || cancelled) return;

      const { data: settings } = await supabase
        .from("location_settings")
        .select("sharing_enabled")
        .eq("user_id", uid)
        .maybeSingle();

      if (!settings?.sharing_enabled || cancelled) return;

      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          if (cancelled) return;
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
  }, []);

  return null;
}
