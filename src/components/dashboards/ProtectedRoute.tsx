import type { ReactNode } from "react";
import { DashboardGate } from "@/components/dashboards/DashboardGate";
import { useApp } from "@/lib/store";
import type { Role } from "@/lib/types";

type ProtectedRouteProps = {
  children: ReactNode;
  allowedRoles?: readonly Role[];
  workerLayout?: boolean;
  fitViewport?: boolean;
  flushViewport?: boolean;
  developmentPreviewRole?: "worker" | "police" | "admin" | "uno";
};

export function ProtectedRoute({ children, allowedRoles, ...gateProps }: ProtectedRouteProps) {
  const { L, user, demoMode } = useApp();

  return (
    <DashboardGate {...gateProps}>
      {user &&
      (demoMode || user.active === true) &&
      (user.role === "super" || !allowedRoles || allowedRoles.includes(user.role)) ? (
        children
      ) : (
        <main className="mx-auto w-full max-w-3xl px-4 py-8">
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
            {L("এই পাতায় প্রবেশের অনুমতি নেই", "You don't have access to this page")}
          </p>
        </main>
      )}
    </DashboardGate>
  );
}
