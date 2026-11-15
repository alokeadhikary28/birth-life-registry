import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import type { ResolvedRoleAction } from "./quick-access-config";

function QuickAccessCard({
  item,
  publicDashboard,
  pendingCount,
  pendingLabel,
  onActivate,
}: {
  item: ResolvedRoleAction;
  publicDashboard: boolean;
  pendingCount?: number;
  pendingLabel: string;
  onActivate: () => void;
}) {
  const className =
    "role-action-card group flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-slate-600 bg-slate-700 px-2.5 py-1 text-left text-white shadow-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-slate-500 hover:bg-slate-600 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:min-h-11 sm:gap-2.5 sm:px-3";
  const content = (
    <>
      <span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-700 text-white transition-colors group-hover:bg-emerald-800">
        {item.icon ? (
          <span className="text-lg leading-none" aria-hidden="true">
            {item.icon}
          </span>
        ) : item.Icon ? (
          <item.Icon className="h-4 w-4" aria-hidden="true" />
        ) : null}
        {pendingCount !== undefined && pendingCount > 0 && (
          <span
            className="absolute -right-1.5 -top-1.5 min-w-4 rounded-full bg-amber-300 px-1 py-0.5 text-center text-[9px] font-bold leading-none text-slate-950 shadow-sm ring-2 ring-slate-700"
            aria-hidden="true"
          >
            {pendingCount > 99 ? "99+" : pendingCount}
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block break-words text-sm font-bold leading-tight text-white sm:text-base">
          {item.title}
        </span>
        <span className="mt-0.5 block break-words text-xs leading-tight text-white sm:text-sm">
          {item.description}
        </span>
        {pendingCount !== undefined && pendingCount > 0 && (
          <span className="sr-only">
            {pendingLabel}: {pendingCount}
          </span>
        )}
      </span>
      <ArrowUpRight className="h-4 w-4 shrink-0 text-white" aria-hidden="true" />
    </>
  );

  if (item.link) {
    return (
      <Link to={item.link} className={className}>
        {content}
      </Link>
    );
  }

  if (publicDashboard) {
    switch (item.id) {
      case "reports":
        return (
          <Link to="/dashboard/$section" params={{ section: "unions" }} className={className}>
            {content}
          </Link>
        );
      case "deadlines":
        return (
          <Link to="/dashboard/$section" params={{ section: "compliance" }} className={className}>
            {content}
          </Link>
        );
      case "national-summary":
      case "notice-management":
        return (
          <Link to="/monitoring" className={className}>
            {content}
          </Link>
        );
      case "announcements":
        return (
          <Link to="/announcements" className={className}>
            {content}
          </Link>
        );
      case "worker-report":
      case "feedback":
        return (
          <button type="button" onClick={onActivate} className={className}>
            {content}
          </button>
        );
    }
  }

  return (
    <button type="button" onClick={onActivate} className={className}>
      {content}
    </button>
  );
}

export function QuickAccessPanel({
  actions,
  title,
  publicDashboard,
  pendingCounts,
  pendingCountsAvailable,
  pendingLabel,
  onActivate,
}: {
  actions: ResolvedRoleAction[];
  title: string;
  publicDashboard: boolean;
  pendingCounts?: Partial<Record<"birth-list" | "death-list", number>>;
  pendingCountsAvailable: boolean;
  pendingLabel: string;
  onActivate: (actionId: string) => void;
}) {
  return (
    <section className="mt-1 lg:flex lg:flex-1 lg:flex-col" aria-labelledby="quick-actions-heading">
      <h2 id="quick-actions-heading" className="mb-2 font-display text-base font-bold text-white">
        {title}
      </h2>
      <div className="flex flex-col gap-1.5 lg:flex-1">
        {actions.map((item) => {
          const pendingCount =
            pendingCountsAvailable &&
            pendingCounts &&
            (item.id === "birth-list" || item.id === "death-list")
              ? pendingCounts[item.id]
              : undefined;
          return (
            <QuickAccessCard
              key={item.id}
              item={item}
              publicDashboard={publicDashboard}
              {...(pendingCount === undefined ? {} : { pendingCount })}
              pendingLabel={pendingLabel}
              onActivate={() => onActivate(item.id)}
            />
          );
        })}
      </div>
    </section>
  );
}
