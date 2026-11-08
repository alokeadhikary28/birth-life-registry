import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { RegistrationDashboard } from "@/components/dashboards/RegistrationDashboard";
import { ClientOnly } from "@/components/ClientOnly";
import {
  EXECUTIVE_ROLE_BY_POSITION,
  isPreviewRole,
  type PreviewRole,
} from "@/lib/dashboard-roles";
import { useApp } from "@/lib/store";

const DASHBOARD_ACTIONS = ["worker-report", "feedback"] as const;
type DashboardAction = (typeof DASHBOARD_ACTIONS)[number];
const roleMap = {
  health_worker: "worker",
  village_police: "police",
  up_official: "admin",
  up_secretary: "admin",
  up_chairman: "admin",
  municipal_secretary: "admin",
  city_zonal_officer: "admin",
  ...EXECUTIVE_ROLE_BY_POSITION,
  ddlg_dc: "district",
} as const satisfies Partial<Record<PreviewRole, "worker" | "police" | "admin" | "uno" | "district" | "super">>;

export const Route = createFileRoute("/")({
  validateSearch: (s: Record<string, unknown>): { role?: PreviewRole; action?: DashboardAction } => ({
    ...(isPreviewRole(s["role"]) && s["role"] !== "main"
      ? { role: s["role"] }
      : {}),
    ...(DASHBOARD_ACTIONS.includes(s["action"] as DashboardAction)
      ? { action: s["action"] as DashboardAction }
      : {}),
  }),
  head: () => ({
    meta: [
      { title: "ই-নিবন্ধন ট্র্যাকার | ৩৬৫ দিনের মধ্যে জন্ম ও মৃত্যু নিবন্ধন সহায়তা" },
      { name: "description", content: "A national view of administrative progress in birth and death registration." },
      { property: "og:title", content: "ই-নিবন্ধন ট্র্যাকার | ৩৬৫ দিনের মধ্যে জন্ম ও মৃত্যু নিবন্ধন সহায়তা" },
      { property: "og:description", content: "A national view of administrative progress in birth and death registration." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const { user } = useApp();
  const navigate = useNavigate();
  const { role: preview, action } = Route.useSearch();
  const role = user
    ? user.role === "super" ? "uno" : user.role
    : preview && preview !== "main" ? roleMap[preview] : "public";
  const localAdminPreview =
    import.meta.env.DEV &&
    !user &&
    role === "admin" &&
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
  return (
    <ClientOnly
      fallback={
        <div className="flex min-h-[40svh] items-center justify-center text-muted-foreground" role="status">
          …
        </div>
      }
    >
      <RegistrationDashboard
        key={`${user?.id ?? "preview"}:${preview ?? "main"}:${role}`}
        role={role}
        localAdminPreview={localAdminPreview}
        {...(preview ? { simulationRole: preview } : {})}
        {...(action ? { initialAction: action } : {})}
        onActionDismiss={() => {
          void navigate({
            to: "/",
            search: (previous) => {
              const { action: _action, ...rest } = previous;
              return rest;
            },
          });
        }}
      />
    </ClientOnly>
  );
}
