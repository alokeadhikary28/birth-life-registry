import { createFileRoute } from "@tanstack/react-router";
import { DashboardGate } from "@/components/dashboards/DashboardGate";
import { EntryFormPage } from "@/components/modules/EntryFormPage";

export const Route = createFileRoute("/death-registration")({
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
  component: DeathRegistrationRoute,
});

function DeathRegistrationRoute() {
  const { applicationId } = Route.useSearch();
  return (
    <DashboardGate workerLayout={false}>
      <EntryFormPage type="death" applicationId={applicationId} />
    </DashboardGate>
  );
}
