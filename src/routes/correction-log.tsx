import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/dashboards/ProtectedRoute";
import { CorrectionLogPage } from "@/components/modules/CorrectionLogPage";

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
  return (
    <ProtectedRoute allowedRoles={["super"]}>
      <CorrectionLogPage />
    </ProtectedRoute>
  );
}
