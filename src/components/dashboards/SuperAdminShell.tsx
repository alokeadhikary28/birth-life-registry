import type { ReactNode } from "react";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/store";

export function SuperAdminShell({
  children,
  className = "",
  fullHeight = false,
}: {
  children: ReactNode;
  className?: string;
  fullHeight?: boolean;
}) {
  const { L } = useApp();
  const fillClass = fullHeight ? "super-admin-shell--fill" : "";
  const contentFillClass = fullHeight ? "super-admin-shell__content--fill" : "";

  return (
    <div className={`super-admin-shell w-full min-w-0 ${fillClass} ${className}`.trim()}>
      <header className="super-admin-shell__header flex w-full flex-col items-stretch justify-between gap-3 overflow-visible rounded-2xl border border-emerald-100 bg-gradient-to-r from-emerald-50 via-white to-teal-50 p-3 shadow-sm sm:flex-row sm:items-center sm:px-4 sm:py-2.5">
        <div className="flex min-w-0 items-center gap-3 overflow-visible">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800 shadow-sm">
            <ShieldCheck aria-hidden="true" className="size-6" />
          </span>
          <h1 className="overflow-visible bg-gradient-to-r from-emerald-900 via-emerald-800 to-teal-700 bg-clip-text py-0.5 font-display text-2xl font-extrabold leading-[1.35] tracking-tight text-transparent sm:text-3xl">
            {L("সুপার অ্যাডমিন প্যানেল", "Super Admin Panel")}
          </h1>
        </div>
        <Button
          asChild
          className="h-10 shrink-0 gap-2 self-end bg-emerald-800 px-3 text-sm font-semibold text-white hover:bg-emerald-900 sm:self-auto sm:px-4 sm:text-base"
        >
          <Link to="/dashboard">
            <ArrowLeft aria-hidden="true" className="size-4" />
            {L("ড্যাশবোর্ডে ফিরে যান", "Back to dashboard")}
          </Link>
        </Button>
      </header>
      <div className={`super-admin-shell__content w-full min-w-0 ${contentFillClass}`.trim()}>
        {children}
      </div>
    </div>
  );
}
