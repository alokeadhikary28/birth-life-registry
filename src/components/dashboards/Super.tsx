import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  BadgeCheck,
  Building,
  Building2,
  ClipboardCheck,
  ClipboardList,
  FileCheck2,
  HeartPulse,
  Landmark,
  LayoutDashboard,
  Map,
  MapPinned,
  Network,
  Shield,
  ShieldCheck,
  UsersRound,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { countPendingStaffRegistrations, createStaff } from "@/lib/auth.functions";
import { EXECUTIVE_POSITIONS, type ExecutivePreviewRole } from "@/lib/dashboard-roles";
import { makeUnions } from "@/lib/seed";
import { roleLabel, useApp } from "@/lib/store";
import type { Role } from "@/lib/types";
import { PENDING_APPROVALS_CHANGED_EVENT } from "@/components/modules/ModuleNavigation";
import {
  filterSuperUsers,
  isSuperUserListPanel,
  type SuperUserListPanel,
} from "@/lib/super-dashboard-users";
import { SuperUserList } from "@/components/dashboards/SuperUserList";

const fieldClassName = "h-11 text-base md:text-base placeholder:text-sm md:placeholder:text-base";
const selectClassName = "h-11 text-base";

const ACTION_PANELS = [
  "upazila-form",
  "upazilas-list",
  "account-form",
  "users-all",
  "users-worker",
  "users-police",
  "users-admin",
  "users-municipal",
  "users-uno",
  "users-ddlg",
  "users-dc",
  "users-commissioner",
] as const;

type ActionPanel = (typeof ACTION_PANELS)[number];
type SuperPanel = "dashboard" | "approval" | "correction-log" | "monitoring" | ActionPanel;

function isActionPanel(panel: string): panel is ActionPanel {
  return ACTION_PANELS.some((candidate) => candidate === panel);
}

export function SuperActionPage({ action }: { action: string }) {
  const { L } = useApp();
  if (!isActionPanel(action)) {
    return (
      <p className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
        {L("এই সুপার অ্যাডমিন পেজটি পাওয়া যায়নি", "This Super Admin page was not found")}
      </p>
    );
  }
  return <SuperDashboard initialPanel={action} showMenu={false} />;
}

export function SuperDashboard({
  initialPanel = "dashboard",
  showMenu = true,
}: {
  initialPanel?: SuperPanel;
  showMenu?: boolean;
}) {
  const { L, n, state, addUpazila, refresh } = useApp();
  const navigate = useNavigate();
  const mkStaff = useServerFn(createStaff);
  const getPendingCount = useServerFn(countPendingStaffRegistrations);
  const activePanel = initialPanel;
  const [pendingApprovalCount, setPendingApprovalCount] = useState<number | null>(null);
  const [pendingCountUnavailable, setPendingCountUnavailable] = useState(false);
  const [f, setF] = useState({
    bn: "",
    en: "",
    dBn: "",
    dEn: "",
    vBn: "",
    vEn: "",
    unions: "",
  });
  const [sel, setSel] = useState(state.upazilas[0]?.id ?? "");
  const [nu, setNu] = useState({
    bn: "",
    en: "",
    role: "worker" as Role,
    executivePosition: "" as ExecutivePreviewRole | "",
    contact: "",
    password: "",
    unionId: "",
    ward: "1",
  });
  const selUp = state.upazilas.find((u) => u.id === sel);
  const selectedUnions = Array.isArray(selUp?.unions) ? selUp.unions : [];

  useEffect(() => {
    let active = true;
    let loading = false;
    let refreshQueued = false;

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
          setPendingApprovalCount(result.count);
          setPendingCountUnavailable(false);
        } else {
          console.error("Could not load Super dashboard pending count", result.error);
          setPendingApprovalCount(null);
          setPendingCountUnavailable(true);
        }
      } catch (cause) {
        if (!active) return;
        console.error("Could not load Super dashboard pending count", cause);
        setPendingApprovalCount(null);
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
  }, [getPendingCount]);

  const onboard = async () => {
    const lines = f.unions
      .split("\n")
      .map((line) => line.split("|").map((value) => value.trim()))
      .filter((line) => line[0]);
    if (!f.bn || !f.en || !f.dBn || !lines.length) {
      toast.error(L("সব ঘর পূরণ করুন", "Fill all fields"));
      return;
    }

    const id = f.en.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    if (state.upazilas.some((u) => u.id === id)) {
      toast.error(L("উপজেলা আগে থেকেই আছে", "Upazila already exists"));
      return;
    }

    if (
      !(await addUpazila({
        id,
        bn: f.bn,
        en: f.en,
        districtBn: f.dBn,
        districtEn: f.dEn,
        divisionBn: f.vBn,
        divisionEn: f.vEn,
        unions: makeUnions(
          lines.map(
            (line, index) => [`u${index}`, line[0], line[1] || line[0]] as [string, string, string],
          ),
          id,
        ),
      }))
    ) {
      return;
    }

    toast.success(L("উপজেলা যুক্ত হয়েছে", "Upazila onboarded"));
    setSel(id);
    setF({ bn: "", en: "", dBn: "", dEn: "", vBn: "", vEn: "", unions: "" });
  };

  const createUser = async () => {
    const needsUnion = ["worker", "police", "admin"].includes(nu.role);
    const assignedUnion = selectedUnions.find((union) => union.id === nu.unionId);
    const assignedUnionIsMunicipal =
      !!assignedUnion &&
      /pourashava|municipality|পৌরসভা/i.test(
        `${assignedUnion.id} ${assignedUnion.bn} ${assignedUnion.en}`,
      );
    if (nu.password.length < 12) {
      toast.error(
        L("পাসওয়ার্ড কমপক্ষে ১২ অক্ষরের হতে হবে", "Password must be at least 12 characters"),
      );
      return;
    }
    if (nu.role === "district" && !nu.executivePosition) {
      toast.error(L("জেলা পর্যায়ের পদবি নির্বাচন করুন", "Select the district-level position"));
      return;
    }
    if (
      nu.role === "admin" &&
      assignedUnionIsMunicipal !== (nu.executivePosition === "municipal_executive_officer")
    ) {
      toast.error(
        L(
          "পৌর নির্বাহী কর্মকর্তার জন্য পৌরসভা নির্বাচন করুন; অন্যথায় ইউপি প্রশাসনিক কর্মকর্তা নির্বাচন করুন",
          "Select a municipality for a Municipal Executive Officer; otherwise use the UP administrative role",
        ),
      );
      return;
    }
    if (
      !nu.bn.trim() ||
      !nu.contact.trim() ||
      (nu.role !== "super" && !sel) ||
      (needsUnion && !nu.unionId)
    ) {
      toast.error(L("সব ঘর পূরণ করুন", "Fill all fields"));
      return;
    }

    const result = await mkStaff({
      data: {
        role: nu.role as "worker" | "police" | "admin" | "uno" | "district" | "super",
        executivePosition: nu.executivePosition || undefined,
        nameBn: nu.bn,
        nameEn: nu.en || nu.bn,
        contact: nu.contact.trim().toLowerCase(),
        initialPassword: nu.password,
        ...(nu.role !== "super" && sel ? { upazilaId: sel } : {}),
        ...(nu.unionId ? { unionId: nu.unionId } : {}),
        ward: +nu.ward || 1,
      },
    });
    if (!result.ok) {
      let message: string;
      switch (result.error) {
        case "station_scope_missing":
          message = L(
            "ইউনিয়নটি administrative_stations তালিকায় নেই",
            "Union is missing from administrative_stations",
          );
          break;
        case "bad_email":
          message = L(
            "সঠিক ইমেইলকে লগইন আইডি হিসেবে দিন",
            "Enter a valid email address as the login ID",
          );
          break;
        case "bad_upazila":
          message = L("সঠিক উপজেলা বেছে নিন", "Choose a valid upazila");
          break;
        case "union_required":
          message = L("এই ভূমিকার জন্য ইউনিয়ন বেছে নিন", "Choose a union for this role");
          break;
        case "position_required":
          message = L("জেলা পর্যায়ের পদবি নির্বাচন করুন", "Select the district-level position");
          break;
        case "bad_position":
          message = L(
            "ভূমিকার সঙ্গে মেলে এমন পদবি নির্বাচন করুন",
            "Choose a position matching the role",
          );
          break;
        case "position_scope_mismatch":
          message = L(
            "নির্বাচিত পদবি ও এলাকার ধরন মিলছে না",
            "The selected position does not match the assigned area",
          );
          break;
        case "auth_create_failed":
          message = L(
            "Auth user তৈরি হয়নি; Supabase server log পরীক্ষা করুন",
            "Auth user creation failed; check the Supabase server log",
          );
          break;
        default:
          message = result.error;
      }
      toast.error(message);
      return;
    }

    toast.success(
      L(
        "সক্রিয় অ্যাকাউন্ট তৈরি হয়েছে · ইমেইল ও নির্ধারিত পাসওয়ার্ড দিয়ে লগইন করা যাবে",
        "Active account created · sign in with the email and assigned password",
      ),
    );
    setNu({ ...nu, bn: "", en: "", executivePosition: "", contact: "", password: "" });
    await refresh();
  };

  const unionName = (value: unknown) => {
    if (typeof value === "string") return value.trim();
    if (!value || typeof value !== "object") return "";

    const item = value as Record<string, unknown>;
    const text = (...keys: string[]) => {
      for (const key of keys) {
        const candidate = item[key];
        if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
      }
      return "";
    };
    const bn = text("bn", "name_bn", "nameBn", "name");
    const en = text("en", "name_en", "nameEn", "name");
    const localized = L(bn || en, en || bn).trim();
    return localized || bn || en || text("id");
  };

  const countForUserPanel = (panel: SuperUserListPanel) =>
    filterSuperUsers(state.users, panel).length;
  const userListLabels: Partial<Record<SuperPanel, { bn: string; en: string }>> = {
    "users-all": { bn: "সকল ব্যবহারকারী", en: "All users" },
    "users-worker": { bn: "স্বাস্থ্যকর্মীর তালিকা", en: "Health workers" },
    "users-police": { bn: "গ্রাম পুলিশের তালিকা", en: "Village police" },
    "users-admin": { bn: "ইউপি প্রশাসনিক কর্মকর্তার তালিকা", en: "UP administrative officers" },
    "users-municipal": {
      bn: "পৌর নির্বাহী কর্মকর্তার তালিকা",
      en: "Municipal executive officers",
    },
    "users-uno": { bn: "উপজেলা নির্বাহী অফিসারের তালিকা", en: "UNO list" },
    "users-ddlg": { bn: "ডিডিএলজি তালিকা", en: "DDLG list" },
    "users-dc": { bn: "ডিসি মহোদয়ের তালিকা", en: "District Commissioners" },
    "users-commissioner": {
      bn: "বিভাগীয় কমিশনার মহোদয়ের তালিকা",
      en: "Divisional Commissioners",
    },
  };
  const userListLabel = userListLabels[activePanel];

  const menuItems: {
    id: SuperPanel;
    label: string;
    count?: number;
    Icon: LucideIcon;
    tone: string;
    iconTone: string;
    ringTone: string;
  }[] = [
    {
      id: "dashboard",
      label: L("ড্যাশবোর্ড", "Dashboard"),
      Icon: LayoutDashboard,
      tone: "border-sky-200 bg-sky-50 text-sky-950 hover:border-sky-400 hover:bg-sky-100",
      iconTone: "bg-sky-100 text-sky-700",
      ringTone: "ring-sky-500",
    },
    {
      id: "approval",
      label: L("অনুমোদন ব্যবস্থাপনা", "Approval management"),
      Icon: ClipboardCheck,
      tone: "border-rose-200 bg-rose-50 text-rose-950 hover:border-rose-400 hover:bg-rose-100",
      iconTone: "bg-rose-100 text-rose-700",
      ringTone: "ring-rose-500",
    },
    {
      id: "correction-log",
      label: L("সংশোধন লগ", "Correction log"),
      Icon: ClipboardList,
      tone: "border-blue-200 bg-blue-50 text-blue-950 hover:border-blue-400 hover:bg-blue-100",
      iconTone: "bg-blue-100 text-blue-700",
      ringTone: "ring-blue-500",
    },
    {
      id: "monitoring",
      label: L("নোটিশ ও পর্যবেক্ষণ", "Notices & monitoring"),
      Icon: Shield,
      tone: "border-cyan-200 bg-cyan-50 text-cyan-950 hover:border-cyan-400 hover:bg-cyan-100",
      iconTone: "bg-cyan-100 text-cyan-700",
      ringTone: "ring-cyan-500",
    },
    {
      id: "upazila-form",
      label: L("নতুন উপজেলা যুক্ত করুন", "Add new Upazila"),
      Icon: Building2,
      tone: "border-emerald-200 bg-emerald-50 text-emerald-950 hover:border-emerald-400 hover:bg-emerald-100",
      iconTone: "bg-emerald-100 text-emerald-700",
      ringTone: "ring-emerald-500",
    },
    {
      id: "upazilas-list",
      label: L("যুক্ত করা উপজেলার তালিকা", "Onboarded Upazilas"),
      count: state.upazilas.length,
      Icon: MapPinned,
      tone: "border-green-200 bg-green-50 text-green-950 hover:border-green-400 hover:bg-green-100",
      iconTone: "bg-green-100 text-green-700",
      ringTone: "ring-green-500",
    },
    {
      id: "account-form",
      label: L("ডাইনামিক ড্রপডাউন ও ব্যবহারকারী", "Dynamic dropdown & users"),
      Icon: UserPlus,
      tone: "border-violet-200 bg-violet-50 text-violet-950 hover:border-violet-400 hover:bg-violet-100",
      iconTone: "bg-violet-100 text-violet-700",
      ringTone: "ring-violet-500",
    },
    {
      id: "users-all",
      label: L("সকল ব্যবহারকারীর তালিকা", "All users"),
      count: countForUserPanel("users-all"),
      Icon: UsersRound,
      tone: "border-indigo-200 bg-indigo-50 text-indigo-950 hover:border-indigo-400 hover:bg-indigo-100",
      iconTone: "bg-indigo-100 text-indigo-700",
      ringTone: "ring-indigo-500",
    },
    {
      id: "users-worker",
      label: L("স্বাস্থ্যকর্মীর তালিকা", "Health workers"),
      count: countForUserPanel("users-worker"),
      Icon: HeartPulse,
      tone: "border-pink-200 bg-pink-50 text-pink-950 hover:border-pink-400 hover:bg-pink-100",
      iconTone: "bg-pink-100 text-pink-700",
      ringTone: "ring-pink-500",
    },
    {
      id: "users-police",
      label: L("গ্রাম পুলিশের তালিকা", "Village police"),
      count: countForUserPanel("users-police"),
      Icon: ShieldCheck,
      tone: "border-amber-200 bg-amber-50 text-amber-950 hover:border-amber-400 hover:bg-amber-100",
      iconTone: "bg-amber-100 text-amber-800",
      ringTone: "ring-amber-500",
    },
    {
      id: "users-admin",
      label: L("ইউপি প্রশাসনিক কর্মকর্তার তালিকা", "UP administrative officers"),
      count: countForUserPanel("users-admin"),
      Icon: Landmark,
      tone: "border-slate-200 bg-slate-50 text-slate-950 hover:border-slate-400 hover:bg-slate-100",
      iconTone: "bg-slate-100 text-slate-700",
      ringTone: "ring-slate-500",
    },
    {
      id: "users-municipal",
      label: L("পৌর নির্বাহী কর্মকর্তার তালিকা", "Municipal executive officers"),
      count: countForUserPanel("users-municipal"),
      Icon: Building,
      tone: "border-orange-200 bg-orange-50 text-orange-950 hover:border-orange-400 hover:bg-orange-100",
      iconTone: "bg-orange-100 text-orange-700",
      ringTone: "ring-orange-500",
    },
    {
      id: "users-uno",
      label: L("উপজেলা নির্বাহী অফিসারের তালিকা", "UNO list"),
      count: countForUserPanel("users-uno"),
      Icon: BadgeCheck,
      tone: "border-teal-200 bg-teal-50 text-teal-950 hover:border-teal-400 hover:bg-teal-100",
      iconTone: "bg-teal-100 text-teal-700",
      ringTone: "ring-teal-500",
    },
    {
      id: "users-ddlg",
      label: L("ডিডিএলজি তালিকা", "DDLG list"),
      count: countForUserPanel("users-ddlg"),
      Icon: Map,
      tone: "border-lime-200 bg-lime-50 text-lime-950 hover:border-lime-400 hover:bg-lime-100",
      iconTone: "bg-lime-100 text-lime-800",
      ringTone: "ring-lime-500",
    },
    {
      id: "users-dc",
      label: L("ডিসি মহোদয়ের তালিকা", "District Commissioners"),
      count: countForUserPanel("users-dc"),
      Icon: FileCheck2,
      tone: "border-red-200 bg-red-50 text-red-950 hover:border-red-400 hover:bg-red-100",
      iconTone: "bg-red-100 text-red-700",
      ringTone: "ring-red-500",
    },
    {
      id: "users-commissioner",
      label: L("বিভাগীয় কমিশনার মহোদয়ের তালিকা", "Divisional Commissioners"),
      count: countForUserPanel("users-commissioner"),
      Icon: Network,
      tone: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-950 hover:border-fuchsia-400 hover:bg-fuchsia-100",
      iconTone: "bg-fuchsia-100 text-fuchsia-700",
      ringTone: "ring-fuchsia-500",
    },
  ] as const;

  const visibleUsers = isSuperUserListPanel(activePanel)
    ? filterSuperUsers(state.users, activePanel)
    : [];

  const handleMenuAction = (action: (typeof menuItems)[number]["id"]) => {
    if (action === "dashboard") {
      void navigate({ to: "/dashboard" });
      return;
    }
    if (action === "approval") {
      void navigate({ to: "/approval-management" });
      return;
    }
    if (action === "correction-log") {
      void navigate({ to: "/correction-log" });
      return;
    }
    if (action === "monitoring") {
      void navigate({ to: "/monitoring" });
      return;
    }
    if (isActionPanel(action)) {
      void navigate({ to: "/super-admin/$action", params: { action } });
    }
  };

  return (
    <main
      className={
        showMenu
          ? "flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden"
          : "w-full min-w-0 space-y-4 pb-8"
      }
    >
      {showMenu && (
        <section
          aria-label={L("সুপার অ্যাডমিন অ্যাকশনসমূহ", "Super Admin actions")}
          className="super-admin-action-grid grid min-h-0 flex-1 grid-cols-2 sm:grid-cols-4"
        >
          {menuItems.map(({ id, label, count, Icon, tone, iconTone, ringTone }) => {
            const isRouteAction =
              id === "approval" || id === "correction-log" || id === "monitoring";
            const selected = !isRouteAction && activePanel === id;
            const badgeValue =
              id === "approval"
                ? pendingApprovalCount === null
                  ? pendingCountUnavailable
                    ? "!"
                    : "…"
                  : n(pendingApprovalCount)
                : count !== undefined
                  ? n(count)
                  : undefined;
            return (
              <button
                type="button"
                key={id}
                aria-pressed={selected}
                aria-label={badgeValue ? `${label}: ${badgeValue}` : label}
                onClick={() => handleMenuAction(id)}
                className={`group flex h-full min-h-[4.5rem] min-w-0 items-center gap-1.5 rounded-xl border px-2 text-left text-[15px] font-semibold shadow-sm transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:translate-y-0 active:scale-[0.99] sm:gap-2 sm:px-2.5 ${
                  selected
                    ? `${tone} ${ringTone} ring-2 ring-offset-1 shadow-md`
                    : `${tone} hover:-translate-y-0.5 hover:shadow-lg`
                }`}
              >
                <span
                  className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${iconTone} transition-transform group-hover:scale-105 sm:size-8`}
                >
                  <Icon aria-hidden="true" className="size-3.5 sm:size-4" />
                </span>
                <span className="min-w-0 flex-1 line-clamp-3 leading-snug">{label}</span>
                {badgeValue !== undefined && (
                  <span
                    aria-hidden="true"
                    className={`inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full border px-2 text-sm font-bold leading-none tabular-nums shadow-sm ${
                      id === "approval"
                        ? pendingApprovalCount !== null && pendingApprovalCount > 0
                          ? "border-rose-800 bg-rose-700 text-white"
                          : "border-rose-300 bg-white text-rose-700"
                        : "border-slate-300 bg-white text-slate-800"
                    }`}
                  >
                    {badgeValue}
                  </span>
                )}
              </button>
            );
          })}
        </section>
      )}

      {(activePanel === "upazila-form" || activePanel === "account-form") && (
        <div className="grid gap-4">
          {activePanel === "upazila-form" && (
            <section className="flex h-full flex-col rounded-2xl border border-border bg-card p-4 shadow-sm sm:col-span-1 sm:p-5">
              <header className="mb-5 flex items-start gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800">
                  <Building2 aria-hidden="true" className="size-5" />
                </span>
                <div>
                  <h2 className="font-display text-xl font-semibold leading-8 text-slate-950">
                    {L("নতুন উপজেলা যুক্ত করুন", "Onboard new Upazila")}
                  </h2>
                  <p className="text-sm leading-6 text-muted-foreground sm:text-base">
                    {L(
                      "এলাকার তথ্য ও ইউনিয়নের তালিকা যোগ করুন",
                      "Add area details and its union list",
                    )}
                  </p>
                </div>
              </header>

              <div className="flex flex-1 flex-col gap-5">
                {(
                  [
                    ["bn", "en", L("উপজেলার নাম", "Upazila name")],
                    ["dBn", "dEn", L("জেলার নাম", "District name")],
                    ["vBn", "vEn", L("বিভাগ", "Division")],
                  ] as const
                ).map(([bnKey, enKey, label]) => (
                  <fieldset key={bnKey} className="min-w-0">
                    <legend className="mb-2 text-base font-semibold leading-7 text-slate-800">
                      {label}
                    </legend>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label
                          htmlFor={`${bnKey}-value`}
                          className="text-sm leading-6 text-slate-600"
                        >
                          {L("বাংলা", "Bangla")}
                        </Label>
                        <Input
                          id={`${bnKey}-value`}
                          className={fieldClassName}
                          placeholder={L("বাংলায় লিখুন", "Enter in Bangla")}
                          value={f[bnKey]}
                          onChange={(event) => setF({ ...f, [bnKey]: event.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label
                          htmlFor={`${enKey}-value`}
                          className="text-sm leading-6 text-slate-600"
                        >
                          English
                        </Label>
                        <Input
                          id={`${enKey}-value`}
                          className={fieldClassName}
                          placeholder="Enter in English"
                          value={f[enKey]}
                          onChange={(event) => setF({ ...f, [enKey]: event.target.value })}
                        />
                      </div>
                    </div>
                  </fieldset>
                ))}

                <div className="space-y-2">
                  <Label htmlFor="upazila-unions" className="text-base leading-7">
                    {L("ইউনিয়নের তালিকা", "Union list")}
                  </Label>
                  <p className="-mt-1 text-sm leading-6 text-muted-foreground">
                    {L("প্রতি লাইনে একটি: বাংলা | English", "One per line: বাংলা | English")}
                  </p>
                  <Textarea
                    id="upazila-unions"
                    className="min-h-32 text-base leading-7 placeholder:text-muted-foreground md:text-base"
                    rows={5}
                    value={f.unions}
                    onChange={(event) => setF({ ...f, unions: event.target.value })}
                    placeholder={"০১ নং ত্রিমোহিনী | 01 No. Trimohini"}
                  />
                </div>

                <Button className="mt-auto h-11 w-full text-base sm:w-auto" onClick={onboard}>
                  {L("উপজেলা যুক্ত করুন", "Add Upazila")}
                </Button>
              </div>
            </section>
          )}

          {activePanel === "account-form" && (
            <section className="flex h-full flex-col rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
              <header className="mb-5 flex items-start gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-800">
                  <UserPlus aria-hidden="true" className="size-5" />
                </span>
                <div>
                  <h2 className="font-display text-xl font-semibold leading-8 text-slate-950">
                    {L("ডাইনামিক ড্রপডাউন ও ব্যবহারকারী", "Dynamic dropdown & users")}
                  </h2>
                  <p className="text-sm leading-6 text-muted-foreground sm:text-base">
                    {L(
                      "ভূমিকা, এলাকা ও লগইন আইডি/পাসওয়ার্ড দিয়ে সক্রিয় অ্যাকাউন্ট তৈরি করুন",
                      "Create an active account with a role, area, login ID, and password",
                    )}
                  </p>
                </div>
              </header>

              <div className="flex flex-1 flex-col gap-5">
                {nu.role === "super" ? (
                  <p className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm leading-6 text-violet-900">
                    {L(
                      "সুপার অ্যাডমিন অ্যাকাউন্ট জাতীয় পর্যায়ে কাজ করবে; উপজেলা বা ইউনিয়ন scope প্রযোজ্য নয়।",
                      "Super Admin accounts have national scope; no upazila or union assignment is applied.",
                    )}
                  </p>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="selected-upazila" className="text-base leading-7">
                        {nu.role === "district"
                          ? L("জেলা নির্ধারণের উপজেলা", "Upazila used to determine district")
                          : L("উপজেলা নির্বাচন", "Select upazila")}
                      </Label>
                      <Select
                        value={sel}
                        onValueChange={(value) => {
                          setSel(value);
                          setNu((current) => ({ ...current, unionId: "" }));
                        }}
                      >
                        <SelectTrigger id="selected-upazila" className={selectClassName}>
                          <SelectValue placeholder={L("উপজেলা বেছে নিন", "Choose an upazila")} />
                        </SelectTrigger>
                        <SelectContent>
                          {state.upazilas.map((upazila) => (
                            <SelectItem key={upazila.id} className="text-base" value={upazila.id}>
                              {L(
                                `${upazila.bn}, ${upazila.districtBn}`,
                                `${upazila.en}, ${upazila.districtEn}`,
                              )}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-base font-semibold leading-7 text-slate-800">
                          {L("ইউনিয়ন তালিকা", "Union list")}
                        </h3>
                        <span className="rounded-full bg-muted px-3 py-1 text-sm font-semibold text-muted-foreground">
                          {n(selectedUnions.length)}
                        </span>
                      </div>
                      <ol className="max-h-44 min-h-20 space-y-1 overflow-y-auto rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 pl-10 text-base font-medium leading-7 text-slate-800 marker:text-emerald-700">
                        {selectedUnions.length ? (
                          selectedUnions.map((union, index) => (
                            <li
                              key={union.id || `${selUp?.id}-union-${index}`}
                              className="rounded-md bg-white px-2 text-slate-950 marker:text-emerald-700"
                            >
                              {unionName(union) || L("নাম পাওয়া যায়নি", "Name unavailable")}
                            </li>
                          ))
                        ) : (
                          <li className="list-none pl-0 text-base text-slate-600">
                            {L(
                              "এই উপজেলায় কোনো ইউনিয়ন নেই",
                              "No unions available for this upazila",
                            )}
                          </li>
                        )}
                      </ol>
                    </div>
                  </>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="staff-name-bn" className="text-sm leading-6">
                      {L("নাম (বাংলা)", "Name (Bangla)")}
                    </Label>
                    <Input
                      id="staff-name-bn"
                      className={fieldClassName}
                      placeholder={L("বাংলায় নাম", "Name in Bangla")}
                      required
                      value={nu.bn}
                      onChange={(event) => setNu({ ...nu, bn: event.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="staff-name-en" className="text-sm leading-6">
                      {L("নাম (English)", "Name (English)")}
                    </Label>
                    <Input
                      id="staff-name-en"
                      className={fieldClassName}
                      placeholder="Name in English"
                      value={nu.en}
                      onChange={(event) => setNu({ ...nu, en: event.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="staff-role" className="text-sm leading-6">
                      {L("ব্যবহারকারীর ধরন", "User role")}
                    </Label>
                    <Select
                      value={nu.role}
                      onValueChange={(role) =>
                        setNu((current) => ({
                          ...current,
                          role: role as Role,
                          unionId: "",
                          executivePosition: role === "uno" ? "uno" : "",
                        }))
                      }
                    >
                      <SelectTrigger id="staff-role" className={selectClassName}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(["worker", "police", "admin", "uno", "district", "super"] as Role[]).map(
                          (role) => (
                            <SelectItem key={role} className="text-base" value={role}>
                              {roleLabel(role, L)}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  {(nu.role === "admin" || nu.role === "district") && (
                    <div className="space-y-1.5">
                      <Label htmlFor="staff-position" className="text-sm leading-6">
                        {L("পদবি", "Position")}
                      </Label>
                      <Select
                        value={nu.executivePosition || "none"}
                        onValueChange={(position) =>
                          setNu((current) => ({
                            ...current,
                            executivePosition:
                              position === "none" ? "" : (position as ExecutivePreviewRole),
                          }))
                        }
                      >
                        <SelectTrigger id="staff-position" className={selectClassName}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none" className="text-base">
                            {nu.role === "admin"
                              ? L("ইউপি প্রশাসনিক কর্মকর্তা", "UP administrative officer")
                              : L("পদবি নির্বাচন করুন", "Select a position")}
                          </SelectItem>
                          {EXECUTIVE_POSITIONS.filter(({ role }) =>
                            nu.role === "admin"
                              ? role === "municipal_executive_officer"
                              : role === "ddlg" ||
                                role === "dc" ||
                                role === "divisional_commissioner",
                          ).map((position) => (
                            <SelectItem
                              key={position.role}
                              value={position.role}
                              className="text-base"
                            >
                              {L(position.bn, position.en)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label htmlFor="staff-contact" className="text-sm leading-6">
                      {L("ইমেইল (লগইন আইডি)", "Email (login ID)")}
                    </Label>
                    <Input
                      id="staff-contact"
                      className={fieldClassName}
                      type="email"
                      autoComplete="email"
                      placeholder="name@example.com"
                      required
                      value={nu.contact}
                      onChange={(event) => setNu({ ...nu, contact: event.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="staff-password" className="text-sm leading-6">
                      {L("প্রাথমিক পাসওয়ার্ড", "Initial password")}
                    </Label>
                    <Input
                      id="staff-password"
                      className={fieldClassName}
                      type="password"
                      autoComplete="new-password"
                      minLength={12}
                      maxLength={128}
                      required
                      value={nu.password}
                      onChange={(event) => setNu({ ...nu, password: event.target.value })}
                    />
                    <p className="text-xs leading-5 text-muted-foreground">
                      {L("কমপক্ষে ১২ অক্ষর", "At least 12 characters")}
                    </p>
                  </div>
                  {["worker", "police", "admin"].includes(nu.role) && (
                    <div className="space-y-1.5">
                      <Label htmlFor="staff-union" className="text-sm leading-6">
                        {L("ইউনিয়ন", "Union")}
                      </Label>
                      <Select
                        value={nu.unionId}
                        onValueChange={(value) => setNu({ ...nu, unionId: value })}
                      >
                        <SelectTrigger id="staff-union" className={selectClassName}>
                          <SelectValue placeholder={L("ইউনিয়ন বেছে নিন", "Choose a union")} />
                        </SelectTrigger>
                        <SelectContent>
                          {selectedUnions.map((union) => (
                            <SelectItem key={union.id} className="text-base" value={union.id}>
                              {L(union.bn, union.en)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {["worker", "police"].includes(nu.role) && (
                    <div className="space-y-1.5">
                      <Label htmlFor="staff-ward" className="text-sm leading-6">
                        {L("ওয়ার্ড নম্বর", "Ward number")}
                      </Label>
                      <Input
                        id="staff-ward"
                        className={fieldClassName}
                        type="number"
                        min={1}
                        max={9}
                        placeholder={L("ওয়ার্ড", "Ward")}
                        value={nu.ward}
                        onChange={(event) => setNu({ ...nu, ward: event.target.value })}
                      />
                    </div>
                  )}
                </div>

                <Button className="mt-auto h-11 w-full text-base sm:w-auto" onClick={createUser}>
                  {L("ব্যবহারকারী তৈরি করুন", "Create user")}
                </Button>
              </div>
            </section>
          )}
        </div>
      )}

      {activePanel === "upazilas-list" && (
        <section
          id="upazilas-list"
          className="scroll-mt-6 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5"
        >
          <header className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-semibold leading-8 text-slate-950">
                {L("যুক্ত করা উপজেলা", "Onboarded upazilas")}
              </h2>
              <p className="text-sm leading-6 text-muted-foreground">
                {L("সিস্টেমে থাকা উপজেলার তালিকা", "Upazilas currently in the system")}
              </p>
            </div>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-800">
              {n(state.upazilas.length)}
            </span>
          </header>
          <div className="max-h-80 overflow-auto rounded-lg border border-border">
            <Table className="min-w-[34rem]">
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="whitespace-nowrap text-sm font-bold text-slate-700">
                    {L("উপজেলা", "Upazila")}
                  </TableHead>
                  <TableHead className="whitespace-nowrap text-sm font-bold text-slate-700">
                    {L("জেলা", "District")}
                  </TableHead>
                  <TableHead className="whitespace-nowrap text-sm font-bold text-slate-700">
                    {L("বিভাগ", "Division")}
                  </TableHead>
                  <TableHead className="whitespace-nowrap text-right text-sm font-bold text-slate-700">
                    {L("ইউনিয়ন", "Unions")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.upazilas.length ? (
                  state.upazilas.map((upazila) => (
                    <TableRow key={upazila.id}>
                      <TableCell className="font-medium text-slate-900">
                        {L(upazila.bn, upazila.en)}
                      </TableCell>
                      <TableCell>{L(upazila.districtBn, upazila.districtEn)}</TableCell>
                      <TableCell>{L(upazila.divisionBn, upazila.divisionEn)}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {n(Array.isArray(upazila.unions) ? upazila.unions.length : 0)}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                      {L("এখনো কোনো উপজেলা যুক্ত হয়নি", "No upazilas have been added")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      {isSuperUserListPanel(activePanel) && (
        <SuperUserList
          users={visibleUsers}
          upazilas={state.upazilas}
          title={L(
            userListLabel?.bn ?? "তৈরি করা ব্যবহারকারী",
            userListLabel?.en ?? "Created users",
          )}
          description={
            [
              "users-municipal",
              "users-uno",
              "users-ddlg",
              "users-dc",
              "users-commissioner",
            ].includes(activePanel)
              ? L(
                  "প্রোফাইলে সংরক্ষিত নির্দিষ্ট পদবি অনুযায়ী তালিকা",
                  "Filtered by the position stored on each profile",
                )
              : L("নাম, ভূমিকা ও এলাকার তথ্য", "Names, roles, and area assignments")
          }
        />
      )}
    </main>
  );
}
