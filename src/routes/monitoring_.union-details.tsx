import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/dashboards/ProtectedRoute";
import { UnionOverview } from "@/components/dashboards/UnionOverview";

export const Route = createFileRoute("/monitoring_/union-details")({
  validateSearch: (search: Record<string, unknown>) => ({
    unionId: typeof search["unionId"] === "string" ? search["unionId"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Union overview — E-Registration Tracker" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: UnionDetailsRoute,
});

function UnionDetailsRoute() {
  const { unionId } = Route.useSearch();
  return (
    <ProtectedRoute
      allowedRoles={["worker", "admin", "police", "uno", "district"]}
      workerLayout={false}
    >
      <UnionOverview unionId={unionId} />
    </ProtectedRoute>
  );
}
