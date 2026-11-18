import { Link } from "@tanstack/react-router";
import { ArrowLeft, Building2, MapPinned } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageTitle, Stat } from "@/components/shared";
import { useApp } from "@/lib/store";
import { formatUnionBadgeName } from "@/lib/union-label";
import { UnifiedStationDashboardTop } from "./UnifiedStationDashboardTop";

const viewableRoles = ["worker", "admin", "police", "uno", "district", "super"] as const;

export function UnionOverview({ unionId }: { unionId: string | undefined }) {
  const { L, n, state, user } = useApp();
  const upazila = state.upazilas.find((area) => area.unions.some((union) => union.id === unionId));
  const union = upazila?.unions.find((area) => area.id === unionId);
  const canView =
    !!user &&
    viewableRoles.includes(user.role) &&
    !!upazila &&
    !!union &&
    (user.role === "super" ||
      (user.role === "district" && upazila.districtEn === user.districtId) ||
      (user.role === "uno" && upazila.id === user.upazilaId) ||
      (["worker", "admin", "police"].includes(user.role) &&
        upazila.id === user.upazilaId &&
        union.id === user.unionId));

  if (!canView || !union || !upazila) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <p className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
          {L(
            "ইউনিয়নটি পাওয়া যায়নি অথবা এই তথ্য দেখার অনুমতি আপনার নেই।",
            "The union was not found or you are not authorized to view its overview.",
          )}
        </p>
        <Button variant="outline" asChild>
          <Link to="/monitoring">{L("পর্যবেক্ষণে ফিরে যান", "Back to monitoring")}</Link>
        </Button>
      </main>
    );
  }

  const cases = state.cases.filter(
    (item) => item.upazilaId === upazila.id && item.unionId === union.id,
  );
  const births = cases.filter((item) => item.type === "birth").length;
  const deaths = cases.filter((item) => item.type === "death").length;
  const completed = cases.filter((item) => item.status === "completed").length;
  const completionRate = cases.length ? Math.round((completed / cases.length) * 100) : 0;
  const wardCount = new Set(union.villages.map((village) => village.ward)).size;
  const coveredWards = new Set(cases.map((item) => item.ward)).size;
  const statuses = [
    { key: "pending", bn: "অপেক্ষমাণ", en: "Pending" },
    { key: "progress", bn: "চলমান", en: "In progress" },
    { key: "completed", bn: "সম্পন্ন", en: "Completed" },
    { key: "rejected", bn: "বাতিল", en: "Rejected" },
  ] as const;
  const isMunicipality =
    /pourashava|municipality/i.test(`${union.id} ${union.en}`) || union.bn.includes("পৌরসভা");
  const placeName = formatUnionBadgeName(union, upazila.unions);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <UnifiedStationDashboardTop stationId={union?.id ?? unionId} />
      <PageTitle
        title={L(`${placeName} — এক নজরে`, `${union.en} — At a glance`)}
        sub={L(
          `${upazila.bn} উপজেলা · ${upazila.districtBn} জেলা`,
          `${upazila.en} Upazila · ${upazila.districtEn} District`,
        )}
        actions={
          <Button variant="outline" asChild>
            <Link to="/monitoring">
              <ArrowLeft aria-hidden="true" className="mr-2 h-4 w-4" />
              {L("পর্যবেক্ষণে ফিরুন", "Back to monitoring")}
            </Link>
          </Button>
        }
      />

      <section
        className="mb-6 rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-5 shadow-sm sm:p-6"
        aria-labelledby="union-profile-title"
      >
        <div className="flex items-start gap-4">
          <span className="rounded-xl bg-emerald-100 p-3 text-emerald-800">
            {isMunicipality ? (
              <Building2 aria-hidden="true" className="h-6 w-6" />
            ) : (
              <MapPinned aria-hidden="true" className="h-6 w-6" />
            )}
          </span>
          <div>
            <h2
              id="union-profile-title"
              className="font-display text-lg font-bold text-emerald-950"
            >
              {placeName}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {L("উপজেলা", "Upazila")}: {L(upazila.bn, upazila.en)} · {L("জেলা", "District")}:{" "}
              {L(upazila.districtBn, upazila.districtEn)}
            </p>
            <p className="mt-2 text-sm font-medium text-emerald-900">
              {n(wardCount)} {L("টি ওয়ার্ড", "wards")} · {n(union.villages.length)}{" "}
              {L("টি গ্রাম", "villages")}
            </p>
          </div>
        </div>
      </section>

      <section className="mb-6" aria-labelledby="union-stats-title">
        <h2 id="union-stats-title" className="mb-3 font-display text-lg font-bold">
          {L("নিবন্ধন সারসংক্ষেপ", "Registration summary")}
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label={L("মোট আবেদন", "Total applications")} value={n(cases.length)} />
          <Stat label={L("জন্ম নিবন্ধন", "Birth registrations")} value={n(births)} />
          <Stat label={L("মৃত্যু নিবন্ধন", "Death registrations")} value={n(deaths)} />
          <Stat
            label={L("সম্পন্ন", "Completed")}
            value={`${n(completed)} · ${n(completionRate)}%`}
          />
        </div>
      </section>

      <section
        className="rounded-xl border border-border bg-card p-4 sm:p-5"
        aria-labelledby="union-status-title"
      >
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="union-status-title" className="font-display text-lg font-bold">
              {L("আবেদনের অবস্থা", "Application status")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {L(
                "আপনার অ্যাকাউন্টের অনুমতিতে দৃশ্যমান এই ইউনিয়নের নিবন্ধন রেকর্ড",
                "Union registration records visible to your account",
              )}
            </p>
          </div>
          <p className="text-sm font-semibold text-emerald-800">
            {L("কভারেজ", "Coverage")}: {n(coveredWards)} / {n(wardCount)}{" "}
            {L("টি ওয়ার্ডে রেকর্ড", "wards with records")}
          </p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {statuses.map(({ key, bn, en }) => {
            const count = cases.filter((item) => item.status === key).length;
            return (
              <li
                key={key}
                className="flex items-center justify-between rounded-lg border border-border px-4 py-3"
              >
                <span className="text-sm font-medium">{L(bn, en)}</span>
                <span className="font-display text-xl font-bold">{n(count)}</span>
              </li>
            );
          })}
        </ul>
        <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-[width]"
            style={{ width: `${completionRate}%` }}
            role="progressbar"
            aria-label={L("আবেদন সম্পন্নের হার", "Application completion rate")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={completionRate}
          />
        </div>
      </section>
    </main>
  );
}
