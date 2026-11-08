import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/dashboards/ProtectedRoute";
import { ApprovalManagement } from "@/components/modules/ApprovalManagement";

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
  return (
    <ProtectedRoute allowedRoles={["super"]}>
      <ApprovalManagement />
    </ProtectedRoute>
  );
}
