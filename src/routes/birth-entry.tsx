import { createFileRoute } from "@tanstack/react-router";
import { DashboardGate } from "@/components/dashboards/DashboardGate";
import { EntryFormPage } from "@/components/modules/EntryFormPage";

export const Route = createFileRoute("/birth-entry")({
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
  component: BirthEntryRoute,
});

function BirthEntryRoute() {
  const { applicationId } = Route.useSearch();
  return (
    <DashboardGate workerLayout={false}>
      <EntryFormPage type="birth" applicationId={applicationId} />
    </DashboardGate>
  );
}
