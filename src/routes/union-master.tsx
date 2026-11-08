import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, MapPinned } from "lucide-react";
import { ProtectedRoute } from "@/components/dashboards/ProtectedRoute";
import { VillageManager } from "@/components/dashboards/Admin";
import { useApp } from "@/lib/store";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getStationsForUpazila } from "@/lib/monirampur-stations";

export const Route = createFileRoute("/union-master")({
  head: () => ({
    meta: [{ title: "Village, Ward & Post Office Master Setup — E-Registration Tracker" }],
  }),
  component: UnionMasterRoute,
});

function UnionMasterRoute() {
  const { L, user, state, authReady, demoMode, activeUnionId, setActiveUnionId } = useApp();

  return (
    <ProtectedRoute allowedRoles={["admin"]} fitViewport={false} flushViewport={false} developmentPreviewRole="admin">
      <main className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
        <Link
          to="/"
          className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {L("মূল ড্যাশবোর্ডে ফিরুন", "Back to main dashboard")}
        </Link>

        <header className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 via-white to-teal-50 p-5 shadow-sm sm:p-7">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-emerald-800 text-white shadow-md">
              <MapPinned className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold text-emerald-800">
                {L("ইউপি প্রশাসনিক কর্মকর্তা", "UP Administrative Officer")}
              </p>
              <h1 className="font-display text-2xl font-bold text-slate-900 sm:text-3xl">
                {L("Village, Ward & Post Office Master Setup / ইনপুট ফর্ম", "Village, Ward & Post Office Master Setup / Input Form")}
              </h1>
            </div>
          </div>
        </header>

        {demoMode && user?.role === "admin" && (() => {
          const upazila = state.upazilas.find((item) => item.id === "manirampur") ?? state.upazilas.find((item) => item.id === user.upazilaId);
          const stations = upazila ? getStationsForUpazila(upazila.id, upazila.unions) : [];
          return stations.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-white px-4 py-3 shadow-sm">
              <label htmlFor="union-master-station" className="text-sm font-bold text-emerald-950">
                {L("সক্রিয় স্টেশন / ইউনিয়ন", "Active station / union")}
              </label>
              <Select value={activeUnionId ?? "mn-dhakuria"} onValueChange={setActiveUnionId}>
                <SelectTrigger id="union-master-station" className="w-full max-w-sm border-emerald-300 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {stations.map((station) => (
                    <SelectItem key={station.id} value={station.id}>
                      {L(station.bn, station.en)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null;
        })()}

        {!authReady ? (
          <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-slate-600" role="status">
            {L("তথ্য লোড হচ্ছে…", "Loading data…")}
          </p>
        ) : !user || (user.role !== "admin" && user.role !== "super") ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
            {L("এই পাতা শুধু ইউপি প্রশাসনিক কর্মকর্তাদের জন্য।", "This page is restricted to UP Administrative Officers.")}
          </p>
        ) : (() => {
          const selectedUnionId = activeUnionId ?? "mn-dhakuria";
          const selectedLocation = state.upazilas
            .map((item) => ({ upazila: item, union: item.unions.find((candidate) => candidate.id === selectedUnionId) }))
            .find((item) => item.union);
          const upazila = selectedLocation?.upazila ?? state.upazilas.find((item) => item.id === user.upazilaId);
          const union = selectedLocation?.union ?? upazila?.unions.find((item) => item.id === user.unionId);
          if (!upazila || !union) {
            return (
              <p className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-900">
                {L("কর্মীর ইউনিয়ন ও উপজেলা নির্ধারণ করা নেই।", "The officer's union and upazila are not configured.")}
              </p>
            );
          }
          return <VillageManager upazila={upazila} union={union} />;
        })()}
      </main>
    </ProtectedRoute>
  );
}
