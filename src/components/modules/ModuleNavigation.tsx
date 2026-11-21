import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { countPendingStaffRegistrations } from "@/lib/auth.functions";
import { useApp } from "@/lib/store";
import type { Role } from "@/lib/types";

export const PENDING_APPROVALS_CHANGED_EVENT = "pending-approvals-changed";

const modules: { to: string; labelBn: string; labelEn: string; roles: readonly Role[] }[] = [
  {
    to: "/dashboard",
    labelBn: "ড্যাশবোর্ড",
    labelEn: "Dashboard",
    roles: ["worker", "admin", "police", "uno", "district", "super"],
  },
  { to: "/birth-entry", labelBn: "জন্ম এন্ট্রি", labelEn: "Birth entry", roles: ["worker"] },
  { to: "/death-entry", labelBn: "মৃত্যু এন্ট্রি", labelEn: "Death entry", roles: ["worker"] },
  {
    to: "/review-list",
    labelBn: "আবেদন পর্যালোচনা",
    labelEn: "Review list",
    roles: ["admin", "uno"],
  },
  {
    to: "/approval-management",
    labelBn: "অনুমোদন ব্যবস্থাপনা",
    labelEn: "Approval Management",
    roles: ["super"],
  },
  { to: "/correction-log", labelBn: "সংশোধন লগ", labelEn: "Correction log", roles: ["super"] },
  {
    to: "/monitoring",
    labelBn: "নোটিশ ও পর্যবেক্ষণ",
    labelEn: "Notices & monitoring",
    roles: ["worker", "admin", "police", "uno", "district", "super"],
  },
] as const;

export function ModuleNavigation() {
  const { L, n, user } = useApp();
  const getPendingCount = useServerFn(countPendingStaffRegistrations);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [pendingCountUnavailable, setPendingCountUnavailable] = useState(false);

  useEffect(() => {
    if (user?.role !== "super") {
      setPendingCount(null);
      setPendingCountUnavailable(false);
      return;
    }

    let active = true;
    let loading = false;
    let refreshQueued = false;
    setPendingCount(null);
    setPendingCountUnavailable(false);

    const refreshPendingCount = async () => {
      if (loading) {
        refreshQueued = true;
        return;
      }
      loading = true;
      try {
        const result = await getPendingCount();
        if (!active) return;
        if (result.ok) {
          setPendingCount(result.count);
          setPendingCountUnavailable(false);
        } else {
          console.error("Could not load pending registration count", result.error);
          setPendingCount(null);
          setPendingCountUnavailable(true);
        }
      } catch (cause) {
        if (!active) return;
        console.error("Could not load pending registration count", cause);
        setPendingCount(null);
        setPendingCountUnavailable(true);
      } finally {
        loading = false;
        if (active && refreshQueued) {
          refreshQueued = false;
          void refreshPendingCount();
        }
      }
    };

    void refreshPendingCount();
    const intervalId = window.setInterval(() => void refreshPendingCount(), 60_000);
    window.addEventListener("focus", refreshPendingCount);
    window.addEventListener(PENDING_APPROVALS_CHANGED_EVENT, refreshPendingCount);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshPendingCount);
      window.removeEventListener(PENDING_APPROVALS_CHANGED_EVENT, refreshPendingCount);
    };
  }, [getPendingCount, user?.id, user?.role]);

  if (!user) return null;

  return (
    <nav
      aria-label={L("মূল মডিউলসমূহ", "Core modules")}
      className={`mb-2 flex gap-2 overflow-x-auto rounded-xl border border-emerald-100 bg-white p-2 shadow-sm ${
        user.role === "super" ? "super-admin-module-nav" : ""
      }`}
    >
      {modules
        .filter((item) => item.roles.includes(user.role))
        .map((item) => (
          <Link
            key={item.to}
            to={item.to}
            activeOptions={{ exact: true }}
            activeProps={{ className: "bg-emerald-800 text-white" }}
            inactiveProps={{ className: "text-emerald-950 hover:bg-emerald-50" }}
            className="min-h-10 shrink-0 rounded-lg px-3 py-2 text-sm font-semibold transition-colors"
          >
            <span className="inline-flex items-center gap-2 whitespace-nowrap">
              <span>{L(item.labelBn, item.labelEn)}</span>
              {item.to === "/approval-management" &&
                user.role === "super" &&
                (pendingCount !== null ? (
                  <span
                    aria-label={`${L("অপেক্ষমাণ আবেদন", "Pending applications")}: ${n(pendingCount)}`}
                    aria-live="polite"
                    className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-base font-extrabold leading-6 ${
                      pendingCount > 0
                        ? "bg-red-600 text-white"
                        : "bg-red-100 text-red-700 ring-1 ring-inset ring-red-200"
                    }`}
                  >
                    {n(pendingCount)}
                  </span>
                ) : pendingCountUnavailable ? (
                  <span
                    aria-label={L("অপেক্ষমাণ সংখ্যা পাওয়া যায়নি", "Pending count unavailable")}
                    className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-red-100 px-2 text-base font-extrabold leading-6 text-red-700 ring-1 ring-inset ring-red-200"
                    title={L("অপেক্ষমাণ সংখ্যা পাওয়া যায়নি", "Pending count unavailable")}
                  >
                    !
                  </span>
                ) : null)}
            </span>
          </Link>
        ))}
      {user.role === "admin" && (
        <Link
          to="/worker-applications/$type"
          params={{ type: "birth" }}
          activeOptions={{ exact: true }}
          activeProps={{ className: "bg-emerald-800 text-white" }}
          inactiveProps={{ className: "text-emerald-950 hover:bg-emerald-50" }}
          className="min-h-10 shrink-0 rounded-lg px-3 py-2 text-sm font-semibold transition-colors"
        >
          {L("জন্ম নিবন্ধনের আবেদন তালিকা", "Birth registration applications")}
        </Link>
      )}
    </nav>
  );
}
