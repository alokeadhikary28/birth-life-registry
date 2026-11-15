import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getDhakaMonthYear } from "@/lib/monthly-targets";
import { readDemoRegistrationTargets, type SavedRegistrationTarget } from "@/lib/registration-targets";
import { loadUpazilaRegistrationTargets } from "@/lib/registration-targets.functions";
import { useApp } from "@/lib/store";

export type CaseCounts = {
  pending: number;
  progress: number;
  completed: number;
  total: number;
};

export type StationMonthlyMetrics = {
  assignment: {
    userId: string;
    upazilaId: string;
    stationId: string;
  };
  target: {
    unionId: string;
    monthYear: string;
    birth: number;
    death: number;
  } | null;
  counts: {
    birth: CaseCounts;
    death: CaseCounts;
  };
};

export function useAssignedRegistrationTarget(): StationMonthlyMetrics | null {
  const { L, user, demoMode } = useApp();
  const [metrics, setMetrics] = useState<StationMonthlyMetrics | null>(null);

  useEffect(() => {
    const stationId = user?.stationId ?? user?.unionId;
    if (!user || !["admin", "worker", "police"].includes(user.role) || !stationId || demoMode) {
      setMetrics(null);
      return;
    }

    let active = true;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const monthYear = getDhakaMonthYear();
    const refresh = async () => {
      try {
        const { data, error } = await supabase.rpc("station_monthly_dashboard_metrics", {
          _month_year: monthYear,
        });
        if (error) throw new Error(error.message);
        const row = data?.[0];
        if (!row) throw new Error("Station monthly metrics were not returned");
        if (active) {
          const birth: CaseCounts = {
            pending: row.birth_pending_count,
            progress: row.birth_progress_count,
            completed: row.birth_completed_count,
            total: row.birth_total_count,
          };
          const death: CaseCounts = {
            pending: row.death_pending_count,
            progress: row.death_progress_count,
            completed: row.death_completed_count,
            total: row.death_total_count,
          };
          setMetrics({
            assignment: {
              userId: user.id,
              upazilaId: user.upazilaId,
              stationId,
            },
            target: row.target_present ? {
              unionId: stationId,
              monthYear,
              birth: row.birth_target,
              death: row.death_target,
            } : null,
            counts: { birth, death },
          });
        }
      } catch (error) {
        if (!active) return;
        setMetrics(null);
        console.error("Failed to load station monthly metrics", error);
        toast.error(L("স্টেশনের মাসিক পরিসংখ্যান লোড করা যায়নি", "Could not load station monthly metrics"));
      }
    };

    setMetrics(null);
    void refresh();

    const refreshOnChange = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => void refresh(), 150);
    };
    const channel = supabase
      .channel(`station-dashboard-metrics-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "station_metric_versions",
          filter: `upazila_id=eq.${user.upazilaId}`,
        },
        refreshOnChange,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "registration_targets",
          filter: `upazila_id=eq.${user.upazilaId}`,
        },
        refreshOnChange,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "cases",
          filter: `upazila_id=eq.${user.upazilaId}`,
        },
        refreshOnChange,
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error("Station dashboard metrics subscription failed", status);
          toast.error(L("লাইভ স্টেশন পরিসংখ্যান সংযোগ ব্যর্থ হয়েছে", "Live station metrics connection failed"));
        }
      });

    return () => {
      active = false;
      if (refreshTimer) clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [L, demoMode, user]);

  const stationId = user?.stationId ?? user?.unionId;
  if (
    !user ||
    !["admin", "worker", "police"].includes(user.role) ||
    !stationId ||
    demoMode ||
    metrics?.assignment.userId !== user.id ||
    metrics.assignment.upazilaId !== user.upazilaId ||
    metrics.assignment.stationId !== stationId
  ) {
    return null;
  }
  return metrics;
}

type UpazilaTargetLoadState = {
  key: string;
  status: "loading" | "ready" | "error";
  targets?: SavedRegistrationTarget[];
};

export function useUpazilaRegistrationTargets(
  monthYear = getDhakaMonthYear(),
): {
  targets: SavedRegistrationTarget[] | null;
  loading: boolean;
  error: boolean;
} {
  const { L, user, demoMode } = useApp();
  const upazilaId = user?.role === "uno" ? user.upazilaId : undefined;
  const key =
    user && upazilaId
      ? `${user.id}:${upazilaId}:${monthYear}:${demoMode ? "demo" : "live"}`
      : null;
  const [loadState, setLoadState] = useState<UpazilaTargetLoadState | null>(null);

  useEffect(() => {
    if (!key || !upazilaId) {
      setLoadState(null);
      return;
    }

    let active = true;
    setLoadState({ key, status: "loading" });

    const loadTargets = async () =>
      demoMode
        ? readDemoRegistrationTargets(upazilaId, monthYear)
        : (await loadUpazilaRegistrationTargets({ data: { monthYear } })).targets;

    void loadTargets()
      .then((targets) => {
        if (active) setLoadState({ key, status: "ready", targets });
      })
      .catch((error: unknown) => {
        if (!active) return;
        console.error("Failed to load Upazila registration targets", error);
        setLoadState({ key, status: "error" });
        toast.error(L("লক্ষ্যমাত্রা লোড করা যায়নি", "Could not load registration targets"));
      });

    return () => {
      active = false;
    };
  }, [L, demoMode, key, monthYear, upazilaId]);

  const currentState = loadState?.key === key ? loadState : null;
  return {
    targets: currentState?.status === "ready" ? currentState.targets ?? [] : null,
    loading: !!key && (!currentState || currentState.status === "loading"),
    error: currentState?.status === "error",
  };
}
