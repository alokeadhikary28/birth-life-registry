import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/dashboards/ProtectedRoute";
import { EntryFormPage } from "@/components/modules/EntryFormPage";

export const Route = createFileRoute("/death-entry")({
  validateSearch: (search: Record<string, unknown>) => ({
    applicationId:
      typeof search["applicationId"] === "string" ? search["applicationId"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Death registration entry — E-Registration Tracker" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DeathEntryRoute,
});

function DeathEntryRoute() {
  const { applicationId } = Route.useSearch();
  return (
    <ProtectedRoute workerLayout={false}>
      <EntryFormPage type="death" applicationId={applicationId} />
    </ProtectedRoute>
  );
}
