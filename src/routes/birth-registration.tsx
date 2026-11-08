import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/dashboards/ProtectedRoute";
import { EntryFormPage } from "@/components/modules/EntryFormPage";

export const Route = createFileRoute("/birth-registration")({
  validateSearch: (search: Record<string, unknown>) => ({
    applicationId:
      typeof search["applicationId"] === "string" ? search["applicationId"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Birth registration entry — E-Registration Tracker" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BirthRegistrationRoute,
});

function BirthRegistrationRoute() {
  const { applicationId } = Route.useSearch();
  return (
    <ProtectedRoute workerLayout={false}>
      <EntryFormPage type="birth" applicationId={applicationId} />
    </ProtectedRoute>
  );
}
