import { createFileRoute } from "@tanstack/react-router";
import { DashboardGate } from "@/components/dashboards/DashboardGate";
import { SuperAdminShell } from "@/components/dashboards/SuperAdminShell";
import { MonitoringWorkspace } from "@/components/dashboards/MonitoringWorkspace";
import { useApp } from "@/lib/store";

export const Route = createFileRoute("/monitoring")({
  head: () => ({
    meta: [
      { title: "Executive monitoring — E-Registration Tracker" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MonitoringRoute,
});

function MonitoringRoute() {
  const { L, user } = useApp();
  const canMonitor = user && ["uno", "district", "super"].includes(user.role);
  return (
    <DashboardGate fitViewport flushViewport workerLayout={false} developmentPreviewRole="uno">
      {canMonitor && user?.role === "super" ? (
        <SuperAdminShell fullHeight>
          <MonitoringWorkspace />
        </SuperAdminShell>
      ) : canMonitor ? (
        <MonitoringWorkspace />
      ) : (
        <main className="mx-auto w-full max-w-none px-4 py-6 sm:px-6 lg:px-8">
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
            {L(
              "এই পর্যবেক্ষণ পাতা উচ্চপর্যায়ের কর্মকর্তাদের জন্য সীমাবদ্ধ।",
              "Executive monitoring is restricted to authorized officials.",
            )}
          </p>
        </main>
      )}
    </DashboardGate>
  );
}
