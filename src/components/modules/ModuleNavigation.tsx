import { Link } from "@tanstack/react-router";
import { useApp } from "@/lib/store";
import type { Role } from "@/lib/types";

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
    roles: ["admin"],
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
  const { L, user } = useApp();
  if (!user) return null;

  return (
    <nav
      aria-label={L("মূল মডিউলসমূহ", "Core modules")}
      className="mb-2 flex gap-2 overflow-x-auto rounded-xl border border-emerald-100 bg-white p-2 shadow-sm"
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
            {L(item.labelBn, item.labelEn)}
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
