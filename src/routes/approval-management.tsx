import { createFileRoute } from "@tanstack/react-router";
import { DashboardGate } from "@/components/dashboards/DashboardGate";
import { ApprovalManagement } from "@/components/modules/ApprovalManagement";
import { ModuleNavigation } from "@/components/modules/ModuleNavigation";
import { useApp } from "@/lib/store";

export const Route = createFileRoute("/approval-management")({
  head: () => ({
    meta: [
      { title: "Approval Management — E-Registration Tracker" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ApprovalRoute,
});

function ApprovalRoute() {
  const { L, user } = useApp();
  return (
    <DashboardGate>
      {user?.role === "admin" ? (
        <ApprovalManagement />
      ) : (
        <main className="mx-auto w-full max-w-none px-4 py-6 sm:px-6 lg:px-8">
          <ModuleNavigation />
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
            {L("এই পাতায় প্রবেশের অনুমতি নেই", "You don't have access to this page")}
          </p>
        </main>
      )}
    </DashboardGate>
  );
}
