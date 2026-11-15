import { useMemo } from "react";
import { useApp } from "@/lib/store";
import { getDhakaMonthYear, getMonthlyStationCaseCounts } from "@/lib/monthly-targets";
import { getTargetEntryStations } from "@/lib/monirampur-stations";
import { useUpazilaRegistrationTargets } from "@/lib/use-assigned-registration-target";
import { MonthlyProgressCard, type MonthlyProgressCounts } from "./MonthlyProgressCard";
import { AssignedUnionProgressCard } from "./AssignedUnionProgressCard";
import { AssignedUnionHeader } from "./AssignedUnionHeader";

export function UnifiedStationDashboardTop({
  stationId: stationIdProp,
  headerStationId,
  showAssignedUnionHeader = true,
}: {
  stationId?: string | undefined;
  headerStationId?: string | undefined;
  showAssignedUnionHeader?: boolean;
}) {
  const { L, state, user } = useApp();
  const isAssignedUnionView =
    user?.role === "admin" || user?.role === "worker" || user?.role === "police";
  const stationId = isAssignedUnionView
    ? user.stationId ?? user.unionId
    : stationIdProp ?? user?.stationId ?? user?.unionId;
  const assignedUpazila =
    user?.role === "uno"
      ? state.upazilas.find((upazila) => upazila.id === user.upazilaId)
      : undefined;
  const location = useMemo(() => {
    if (stationId) {
      return (assignedUpazila ? [assignedUpazila] : state.upazilas)
        .map((upazila) => ({
          upazila,
          union: getTargetEntryStations(upazila.id, upazila.unions).find(
            (station) => station.id === stationId,
          ),
        }))
        .find((item) => item.union);
    }
    return assignedUpazila ? { upazila: assignedUpazila, union: undefined } : undefined;
  }, [assignedUpazila, state.upazilas, stationId]);
  const monthYear = getDhakaMonthYear();
  const {
    targets: savedTargets,
    loading: targetsLoading,
    error: targetLoadError,
  } = useUpazilaRegistrationTargets(monthYear);
  const monthlyTargets = useMemo(() => {
    if (user?.role !== "uno" || !location) return null;
    const unionIds = stationId
      ? [stationId]
      : getTargetEntryStations(
          location.upazila.id,
          location.upazila.unions,
        ).map((station) => station.id);
    const submittedByUnion = new Map(
      (savedTargets ?? [])
        .filter((target) => target.status === "submitted")
        .map((target) => [target.union_id, target]),
    );
    if (!unionIds.length || unionIds.some((unionId) => !submittedByUnion.has(unionId))) {
      return null;
    }
    return unionIds.reduce(
      (totals, unionId) => {
        const target = submittedByUnion.get(unionId);
        if (target) {
          totals.birth += target.birth_target;
          totals.death += target.death_target;
        }
        return totals;
      },
      { birth: 0, death: 0 },
    );
  }, [location, savedTargets, stationId, user?.role]);

  const unifiedCases = useMemo(() => {
    if (!location) return [];
    return state.cases.filter((item) =>
      item.upazilaId === location.upazila.id &&
      (!stationId || (item.stationId ?? item.unionId) === stationId),
    );
  }, [location, state.cases, stationId]);

  const counts = useMemo<MonthlyProgressCounts | undefined>(
    () => {
      if (isAssignedUnionView || !location) return undefined;
      return getMonthlyStationCaseCounts(
        unifiedCases,
        location.upazila.id,
        stationId,
        monthYear,
      );
    },
    [isAssignedUnionView, location, monthYear, stationId, unifiedCases],
  );
  const received = counts
    ? (counts.birth.total ?? 0) + (counts.death.total ?? 0)
    : 0;
  const displayedHeaderStationId = headerStationId ?? stationId;
  const targetWarning = targetLoadError
    ? L("লক্ষ্যমাত্রা লোড করা যায়নি", "Could not load registration targets")
    : targetsLoading || monthlyTargets
      ? undefined
      : L("নির্বাচিত এলাকার জন্য জমা দেওয়া মাসিক লক্ষ্যমাত্রা পাওয়া যায়নি", "No submitted monthly target is available for this area");

  return (
    <div className="grid min-h-0 gap-1 sm:gap-2 lg:grid-cols-[0.72fr_1.28fr] lg:items-center lg:gap-3">
      <div className="flex min-h-0 flex-col justify-center">
        {showAssignedUnionHeader && displayedHeaderStationId && (
          <AssignedUnionHeader stationId={displayedHeaderStationId} />
        )}
      </div>
      {isAssignedUnionView ? (
        <AssignedUnionProgressCard />
      ) : counts ? (
        <MonthlyProgressCard
          counts={counts}
          received={received}
          targets={monthlyTargets ?? { birth: 0, death: 0 }}
          targetsAvailable={monthlyTargets !== null}
          warning={targetWarning}
          reportCases={unifiedCases}
          reportsEnabled
          featured
        />
      ) : null}
    </div>
  );
}
