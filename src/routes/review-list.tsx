import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/dashboards/ProtectedRoute";
import { ReviewListPage } from "@/components/modules/ReviewListPage";

export const Route = createFileRoute("/review-list")({
  head: () => ({
    meta: [
      { title: "Review list — E-Registration Tracker" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReviewRoute,
});

function ReviewRoute() {
  return (
    <ProtectedRoute allowedRoles={["admin", "uno"]}>
      <ReviewListPage />
    </ProtectedRoute>
  );
}
