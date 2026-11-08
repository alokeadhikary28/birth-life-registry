import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/dashboards/ProtectedRoute";
import { WorkerApplicationListPage } from "@/components/modules/WorkerApplicationListPage";
import { BirthRegList } from "@/components/modules/BirthRegList";
import { DeathRegList } from "@/components/modules/DeathRegList";
import { casesForStation, scopedCases, useApp } from "@/lib/store";
import { AdministrativeErrorBoundary } from "@/components/AdministrativeErrorBoundary";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/worker-applications/$type")({
  validateSearch: (search: Record<string, unknown>) => search,
  head: () => ({
    meta: [
      { title: "Registration applications — E-Registration Tracker" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: WorkerApplicationsRoute,
});

function WorkerApplicationsRoute() {
  const { type } = Route.useParams();
  const search = Route.useSearch();
  const { user, state, activeUnionId, demoMode, caseLoadError, refresh, L } = useApp();
  const registrationType = type === "birth" || type === "death" ? type : null;
  const administrativeCases =
    user?.role === "admin"
      ? demoMode
        ? casesForStation(
            state.cases,
            "manirampur",
            activeUnionId ?? user.stationId ?? user.unionId ?? "mn-dhakuria",
          )
        : scopedCases(state, user)
      : [];
  const previewRole = search["role"] === "up_secretary" ? "admin" : "worker";
  return (
    <AdministrativeErrorBoundary>
      <ProtectedRoute
        allowedRoles={["admin", "worker", "police"]}
        workerLayout={false}
        developmentPreviewRole={previewRole}
      >
        {caseLoadError ? (
          <section
            className="mx-auto my-8 max-w-lg rounded-xl border border-amber-200 bg-amber-50 p-6 text-center text-amber-950"
            role="alert"
          >
            <h1 className="font-display text-lg font-bold">
              {L("আবেদন তালিকা লোড করা যায়নি", "Applications could not be loaded")}
            </h1>
            <p className="mt-2 text-sm">
              {L(
                "আপনার সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।",
                "Check your connection and try again.",
              )}
            </p>
            <Button className="mt-4" variant="outline" onClick={() => void refresh()}>
              {L("আবার চেষ্টা করুন", "Try again")}
            </Button>
          </section>
        ) : registrationType ? (
          user?.role === "admin" ? (
            registrationType === "birth" ? (
              <BirthRegList cases={administrativeCases} onHome={() => window.history.back()} />
            ) : (
              <DeathRegList cases={administrativeCases} onHome={() => window.history.back()} />
            )
          ) : (
            <WorkerApplicationListPage type={registrationType} />
          )
        ) : (
          <p className="px-4 py-8 text-center text-muted-foreground">
            {L("এই আবেদন ধরনটি সমর্থিত নয়।", "Unsupported application type.")}
          </p>
        )}
      </ProtectedRoute>
    </AdministrativeErrorBoundary>
  );
}
