import { createFileRoute, Outlet, Link, redirect, useNavigate } from "@tanstack/react-router";
import { Heart, MapPin, Users } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { DemoFooter } from "@/components/DemoFooter";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const navigate = useNavigate();

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-5 pb-24 pt-8">
      <header className="mb-6 flex items-center justify-between">
        <Link to="/home" className="text-xl font-semibold tracking-tight">
          💞 Together
        </Link>
        <Button
          variant="ghost"
          size="sm"
          className="rounded-full"
          onClick={async () => {
            await supabase.auth.signOut();
            await navigate({ to: "/auth" });
          }}
        >
          Sign out
        </Button>
      </header>

      <div className="flex-1">
        <Outlet />
      </div>

      <DemoFooter />

      <nav className="fixed inset-x-0 bottom-0 mx-auto flex max-w-md justify-around border-t bg-card/95 py-2 backdrop-blur">
        <NavItem to="/home" label="Home" icon={<Heart className="h-5 w-5" />} />
        <NavItem to="/partner" label="Partner" icon={<Users className="h-5 w-5" />} />
        <NavItem to="/map" label="Map" icon={<MapPin className="h-5 w-5" />} />
      </nav>
    </div>
  );
}

function NavItem({ to, label, icon }: { to: string; label: string; icon: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="flex flex-col items-center gap-1 rounded-2xl px-5 py-1 text-xs text-muted-foreground"
      activeProps={{ className: "text-primary" }}
    >
      {icon}
      {label}
    </Link>
  );
}
