import { createFileRoute } from "@tanstack/react-router";
import { DashboardGate } from "@/components/dashboards/DashboardGate";
import { SuperAdminShell } from "@/components/dashboards/SuperAdminShell";
import { ModuleNavigation } from "@/components/modules/ModuleNavigation";
import { CorrectionLogPage } from "@/components/modules/CorrectionLogPage";
import { useApp } from "@/lib/store";

export const Route = createFileRoute("/correction-log")({
  head: () => ({
    meta: [
      { title: "Correction history — E-Registration Tracker" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CorrectionRoute,
});

function CorrectionRoute() {
  const { L, user } = useApp();
  return (
    <DashboardGate flushViewport={user?.role === "super"}>
      {user?.role === "super" ? (
        <SuperAdminShell>
          <CorrectionLogPage />
        </SuperAdminShell>
      ) : (
        <main className="mx-auto w-full max-w-none px-4 py-6 sm:px-6 lg:px-8">
          <ModuleNavigation />
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
            {L(
              "এই নিরীক্ষা লগ শুধু সুপার অ্যাডমিন দেখতে পারবেন।",
              "Audit history is restricted to Super Admins.",
            )}
          </p>
        </main>
      )}
    </DashboardGate>
  );
}
