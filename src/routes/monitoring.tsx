import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/dashboards/ProtectedRoute";
import { MonitoringWorkspace } from "@/components/dashboards/MonitoringWorkspace";

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
  return (
    <ProtectedRoute
      allowedRoles={["uno", "district"]}
      fitViewport
      flushViewport
      workerLayout={false}
      developmentPreviewRole="uno"
    >
      <MonitoringWorkspace />
    </ProtectedRoute>
  );
}
