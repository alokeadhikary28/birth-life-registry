import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardGate } from "@/components/dashboards/DashboardGate";
import { SuperActionPage } from "@/components/dashboards/Super";
import { SuperAdminShell } from "@/components/dashboards/SuperAdminShell";
import { useApp } from "@/lib/store";

export const Route = createFileRoute("/super-admin/$action")({
  head: () => ({
    meta: [
      { title: "Super Admin — E-Registration Tracker" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SuperAdminActionRoute,
});

function SuperAdminActionRoute() {
  const { action } = Route.useParams();
  const { L, user } = useApp();

  return (
    <DashboardGate flushViewport={user?.role === "super"}>
      {user?.role === "super" ? (
        <SuperAdminShell>
          <SuperActionPage action={action} />
        </SuperAdminShell>
      ) : (
        <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
            {L("এই পাতায় প্রবেশের অনুমতি নেই", "You don't have access to this page")}
          </p>
          <Button asChild className="mt-4">
            <Link to="/dashboard">
              <ArrowLeft aria-hidden="true" className="mr-2 size-4" />
              {L("ড্যাশবোর্ডে ফিরে যান", "Back to dashboard")}
            </Link>
          </Button>
        </main>
      )}
    </DashboardGate>
  );
}
