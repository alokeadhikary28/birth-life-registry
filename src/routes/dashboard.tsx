import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { RegistrationDashboard } from "@/components/dashboards/RegistrationDashboard";
import { SuperAdminShell } from "@/components/dashboards/SuperAdminShell";
import { SuperDashboard } from "@/components/dashboards/Super";
import { ModuleNavigation } from "@/components/modules/ModuleNavigation";
import { LoginDialog } from "@/components/Header";
import { MfaGate } from "@/components/MfaGate";
import { useApp } from "@/lib/store";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Upazila E-Registration Tracker" },
      {
        name: "description",
        content: "Role-based dashboard for birth and death registration tracking.",
      },
      { property: "og:title", content: "Dashboard — Upazila E-Registration Tracker" },
      {
        property: "og:description",
        content: "Role-based dashboard for birth and death registration tracking.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { user, L, authReady, mfa, demoLoginAvailable, enterDemoLogin } = useApp();
  const [open, setOpen] = useState(false);
  const isSectionRoute = useRouterState({
    select: (routerState) => routerState.location.pathname.startsWith("/dashboard/"),
  });

  useEffect(() => {
    if (authReady && demoLoginAvailable && !user) enterDemoLogin("uno");
  }, [authReady, demoLoginAvailable, enterDemoLogin, user]);
  useEffect(() => {
    if (authReady && !user && !demoLoginAvailable) setOpen(true);
  }, [authReady, demoLoginAvailable, user]);

  if (!authReady || (demoLoginAvailable && !user)) {
    return <div className="py-20 text-center text-muted-foreground">…</div>;
  }
  if (user && mfa !== "ok") return <MfaGate />;
  if (isSectionRoute) return <Outlet />;
  if (!user) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <p className="mb-4 text-muted-foreground">
          {L("ড্যাশবোর্ড দেখতে লগইন করুন", "Please log in to view your dashboard")}
        </p>
        <Button onClick={() => setOpen(true)}>{L("লগইন", "Login")}</Button>
        <LoginDialog open={open} onClose={() => setOpen(false)} />
      </div>
    );
  }

  if (user.role === "super") {
    return (
      <SuperAdminShell className="super-dashboard" fullHeight>
        <SuperDashboard />
      </SuperAdminShell>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-4 pt-2 sm:px-6 lg:px-8">
        <ModuleNavigation />
      </div>
      <div className="min-h-0 flex-1">
        <RegistrationDashboard role={user.role} />
      </div>
    </div>
  );
}
