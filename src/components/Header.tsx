import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Award,
  BookOpen,
  Building2,
  ChartNoAxesCombined,
  ChevronDown,
  FileText,
  Headphones,
  HeartPulse,
  Home,
  Languages,
  LogIn,
  LogOut,
  MessageSquareWarning,
  Moon,
  MapPinned,
  ShieldCheck,
  Sun,
  Landmark,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { roleLabel, useApp } from "@/lib/store";
import { getStationsForUpazila, MONIRAMPUR_STATIONS } from "@/lib/monirampur-stations";
import {
  EXECUTIVE_PREVIEW_ROLES,
  isPreviewRole,
  type ExecutivePreviewRole,
  type PreviewRole,
} from "@/lib/dashboard-roles";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  passwordSignIn,
  requestPasswordReset,
  sendPhoneOtp,
  submitStaffRegistrationRequest,
  verifyPhoneOtp,
} from "@/lib/auth.functions";

export function Header() {
  const {
    user,
    L,
    lang,
    toggleLang,
    dark,
    toggleTheme,
    logout,
    online,
    demoLoginAvailable,
    demoMode,
    enterDemoLogin,
    state,
    activeUnionId,
    setActiveUnionId,
  } = useApp();
  const [dlg, setDlg] = useState<null | "login" | "manual" | "support">(null);
  const [isExecutiveMenuOpen, setIsExecutiveMenuOpen] = useState(false);
  const nav = useNavigate();
  const location = useRouterState({ select: (routerState) => routerState.location });
  const headerRef = useRef<HTMLElement>(null);
  const executiveMenuRef = useRef<HTMLDivElement>(null);
  const routeSearch = location.search;
  const previewRole =
    typeof routeSearch === "object" && routeSearch !== null && "role" in routeSearch
      ? routeSearch["role"]
      : undefined;
  const selectedPreviewRole =
    isPreviewRole(previewRole) && previewRole !== "main" ? previewRole : undefined;
  const signedInRole = user
    ? user.role === "super"
      ? "registrar_general"
      : user.role === "district"
        ? "ddlg_dc"
        : user.role === "uno"
          ? "uno"
      : user.role === "worker"
        ? "health_worker"
        : user.role === "police"
          ? "village_police"
          : user.role === "admin"
            ? "up_official"
            : undefined
    : undefined;
  const isApplicationListPath = location.pathname.startsWith("/worker-applications/");
  const pathRole = isApplicationListPath
    ? user?.role === "admin"
      ? "up_official"
      : selectedPreviewRole === "up_secretary"
        ? "up_secretary"
        : "health_worker"
    : location.pathname === "/birth-entry" || location.pathname === "/death-entry"
      ? "health_worker"
      : location.pathname === "/monitoring"
        ? "uno"
        : undefined;
  const isRootDashboard =
    location.pathname === "/" || location.pathname === "" || location.pathname === "/index";
  const isMainActive =
    isRootDashboard && !selectedPreviewRole;
  const [currentRole, setCurrentRole] = useState<PreviewRole>(
    selectedPreviewRole ?? signedInRole ?? "main",
  );
  const activeRole = pathRole ?? currentRole;
  const isExecutiveRole = (role: string | undefined): role is ExecutivePreviewRole =>
    role !== undefined &&
    EXECUTIVE_PREVIEW_ROLES.some((executiveRole) => executiveRole === role);
  const executiveActive = isExecutiveRole(activeRole);
  const canSwitchUnion = user?.role === "admin" && demoMode;
  const stationUpazila = state.upazilas.find((item) => item.id === "manirampur") ?? state.upazilas.find((item) => item.id === user?.upazilaId);
  const stationOptions = stationUpazila ? getStationsForUpazila(stationUpazila.id, stationUpazila.unions) : [];

  useEffect(() => {
    if (selectedPreviewRole) {
      setCurrentRole(selectedPreviewRole);
    } else if (isRootDashboard) {
      setCurrentRole(signedInRole ?? "main");
    } else if (pathRole) {
      setCurrentRole(pathRole);
    }
  }, [isRootDashboard, pathRole, selectedPreviewRole, signedInRole]);

  useEffect(() => {
    if (!isExecutiveMenuOpen) return;
    const closeOnOutsideMouseDown = (event: MouseEvent) => {
      if (
        event.target instanceof Node &&
        !executiveMenuRef.current?.contains(event.target)
      ) {
        setIsExecutiveMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsExecutiveMenuOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideMouseDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideMouseDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isExecutiveMenuOpen]);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;

    const updateHeight = () => {
      document.documentElement.style.setProperty(
        "--app-header-height",
        `${header.getBoundingClientRect().height}px`,
      );
    };
    updateHeight();

    const observer = new ResizeObserver(updateHeight);
    observer.observe(header);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--app-header-height");
    };
  }, []);

  const tabs = [
    { role: undefined, previewRole: "main", bn: "মেইন ড্যাশবোর্ড", en: "Main Dashboard", Icon: Home },
    { role: "health_worker", previewRole: "health_worker", bn: "স্বাস্থ্যকর্মী", en: "Health Worker", Icon: HeartPulse },
    { role: "village_police", previewRole: "village_police", bn: "গ্রাম পুলিশ", en: "Village Police", Icon: ShieldCheck },
    { role: "up_secretary", previewRole: "up_secretary", bn: "ইউপি প্রশাসনিক কর্মকর্তা", en: "UP Administrative Officer", Icon: Landmark },
  ] as const;
  const navigateToDashboardTab = (
    role: (typeof tabs)[number]["role"],
    preview: (typeof tabs)[number]["previewRole"],
  ) => {
    setCurrentRole(preview);
    setIsExecutiveMenuOpen(false);
    if (demoLoginAvailable && role) {
      const demoRole =
        role === "health_worker"
          ? "worker"
          : role === "village_police"
            ? "police"
            : role === "up_secretary"
              ? "admin"
              : "uno";
      enterDemoLogin(demoRole);
      void nav({ to: "/", search: { role: preview } });
      return;
    }
    if (demoLoginAvailable && !role && demoMode) {
      void logout().then(() => nav({ to: "/", search: {} }));
      return;
    }
    void nav({ to: "/", search: role ? { role } : {} });
  };
  const executiveRoles = [
    { role: "municipal_executive_officer", bn: "পৌর নির্বাহী কর্মকর্তা", en: "Pourashava Executive Officer (PEO)", Icon: Landmark },
    { role: "uno", bn: "উপজেলা নির্বাহী অফিসার - UNO", en: "Upazila Nirbahi Officer - UNO", Icon: Building2 },
    { role: "ddlg", bn: "উপপরিচালক, স্থানীয় সরকার - DDLG", en: "Deputy Director, Local Government - DDLG", Icon: MapPinned },
    { role: "dc", bn: "জেলা প্রশাসক - DC", en: "District Commissioner - DC", Icon: MapPinned },
    { role: "addl_registrar_general", bn: "অতিরিক্ত রেজিস্ট্রার জেনারেল", en: "Additional Registrar General", Icon: Award },
    { role: "city_corporation_ceo", bn: "সিটি কর্পোরেশনের প্রধান নির্বাহী কর্মকর্তা", en: "City Corporation Chief Executive Officer - CEO", Icon: Building2 },
    { role: "divisional_commissioner", bn: "বিভাগীয় কমিশনার", en: "Divisional Commissioner", Icon: ChartNoAxesCombined },
    { role: "registrar_general", bn: "রেজিস্ট্রার জেনারেল", en: "Registrar General", Icon: ShieldCheck },
  ] as const;
  const demoRoleForExecutive: Record<ExecutivePreviewRole, "admin" | "uno"> = {
    municipal_executive_officer: "admin",
    uno: "uno",
    ddlg: "uno",
    dc: "uno",
    addl_registrar_general: "uno",
    city_corporation_ceo: "admin",
    divisional_commissioner: "uno",
    registrar_general: "uno",
  };
  const navigateToExecutiveRole = (role: ExecutivePreviewRole) => {
    setCurrentRole(role);
    setIsExecutiveMenuOpen(false);
    if (demoLoginAvailable) enterDemoLogin(demoRoleForExecutive[role]);
    void nav({ to: "/", search: { role } });
  };

  return (
    <header ref={headerRef} className="fixed inset-x-0 top-0 z-50 border-b border-emerald-700 bg-gradient-to-r from-[#70c158] to-[#5cb84b] text-white shadow-sm">
      <nav aria-label={L("ড্যাশবোর্ড নির্বাচন", "Dashboard switcher")} className="bg-emerald-900/90">
        <div className="w-full px-4 py-1.5 sm:px-6 lg:px-8">
          <div className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 sm:gap-x-4 lg:gap-x-6">
              {tabs.map(({ role, previewRole: tabPreviewRole, bn, en, Icon }) => {
                const active = role === undefined
                  ? isMainActive
                  : tabPreviewRole === activeRole;
                return (
                  <Link
                    key={en}
                    to="/"
                    search={() => (role ? { role } : {})}
                    activeOptions={{ exact: true, includeSearch: true }}
                    resetScroll={false}
                    aria-current={active ? "page" : undefined}
                    onClick={(event) => {
                      event.preventDefault();
                      navigateToDashboardTab(role, tabPreviewRole);
                    }}
                    className={
                      active
                        ? "relative inline-flex items-center gap-2 whitespace-nowrap rounded-xl bg-white/15 px-3 py-2 text-xs font-bold text-white shadow-inner ring-1 ring-white/20 backdrop-blur-md after:absolute after:inset-x-3 after:-bottom-1 after:h-0.5 after:rounded-full after:bg-emerald-200 sm:text-sm"
                        : "inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-xs font-semibold text-white transition-all duration-200 hover:bg-white/10 hover:backdrop-blur-md sm:text-sm"
                    }
                  >
                    <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                    {L(bn, en)}
                  </Link>
                );
              })}
              <div ref={executiveMenuRef} className="relative">
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={isExecutiveMenuOpen}
                  aria-controls="executive-panel-menu"
                  onClick={() => setIsExecutiveMenuOpen((open) => !open)}
                  className={`relative inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-xs font-semibold transition-all duration-200 sm:text-sm ${
                    executiveActive || isExecutiveMenuOpen
                      ? "bg-white/15 font-bold text-white shadow-inner ring-1 ring-white/20 backdrop-blur-md after:absolute after:inset-x-3 after:-bottom-1 after:h-0.5 after:rounded-full after:bg-emerald-200"
                      : "text-white hover:bg-white/10 hover:backdrop-blur-md"
                  }`}
                >
                  <ChartNoAxesCombined aria-hidden="true" className="h-4 w-4 shrink-0" />
                  {L("উচ্চপর্যায়ের নির্বাহী প্যানেল", "Executive Panel")}
                  <ChevronDown
                    aria-hidden="true"
                    className={`h-4 w-4 transition-transform duration-200 ${isExecutiveMenuOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {isExecutiveMenuOpen && (
                  <div
                    id="executive-panel-menu"
                    role="menu"
                    aria-label={L("উচ্চপর্যায়ের নির্বাহী প্যানেল", "Executive Panel")}
                    className="absolute left-0 top-full z-50 mt-2 w-72 rounded-xl border border-emerald-100 bg-white/95 p-2 text-slate-900 shadow-2xl backdrop-blur-md sm:left-auto sm:right-0"
                  >
                    <p className="px-3 py-2 text-xs font-semibold text-slate-500">
                      {L(
                        "প্যানেল নির্বাচন · প্রবেশাধিকার অ্যাকাউন্ট অনুযায়ী",
                        "Select a panel · access remains account-based",
                      )}
                    </p>
                    {executiveRoles.map(({ role, bn, en, Icon }) => {
                      const active = activeRole === role;
                      return (
                        <button
                          key={role}
                          type="button"
                          role="menuitem"
                          aria-current={active ? "page" : undefined}
                          onClick={() => navigateToExecutiveRole(role)}
                          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                            active
                              ? "bg-emerald-100 font-bold text-emerald-950"
                              : "text-slate-700 hover:bg-emerald-50 hover:text-emerald-900"
                          }`}
                        >
                          <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-emerald-700" />
                          <span className="min-w-0 flex-1">{L(bn, en)}</span>
                          {active && <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-600" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
              <Link
                to="/"
                search={(previous) => ({ ...previous, action: "worker-report" })}
                className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-xs font-semibold text-white transition-all duration-200 hover:bg-white/10 hover:backdrop-blur-md sm:text-sm"
              >
                <FileText aria-hidden="true" className="h-4 w-4 shrink-0" />
                {L("রিপোর্ট", "Reports")}
              </Link>
              <Link
                to="/"
                search={(previous) => ({ ...previous, action: "feedback" })}
                className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-xs font-semibold text-white transition-all duration-200 hover:bg-white/10 hover:backdrop-blur-md sm:text-sm"
              >
                <MessageSquareWarning aria-hidden="true" className="h-4 w-4 shrink-0" />
                {L("অভিযোগ ও পরামর্শ", "Complaints and feedback")}
              </Link>
            </div>
          </div>
        </div>
      </nav>
      {!online && (
        <div className="flex items-center justify-center gap-2 bg-warning px-3 py-1 text-xs font-medium text-warning-foreground">
          <WifiOff className="h-3 w-3" /> {L("অফলাইন — তথ্য ডিভাইসে জমা থাকবে, অনলাইনে এলে স্বয়ংক্রিয়ভাবে সিঙ্ক হবে", "Offline — entries are cached and will auto-sync")}
        </div>
      )}
      <div className="mx-auto flex h-16 w-full max-w-none items-center gap-1 px-2 sm:gap-2 sm:px-6 lg:px-8">
        <Link to="/" className="mr-auto flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-800 text-white"><Landmark className="h-5 w-5" /></span>
          <span className="leading-tight">
            <span className="block whitespace-nowrap font-display text-lg font-bold max-[400px]:text-base">{L("ই-নিবন্ধন ট্র্যাকার", "E-Registration Tracker")}</span>
            <span className="hidden text-sm text-emerald-50 sm:block">{L("জন্ম ও মৃত্যু নিবন্ধন · উপজেলা", "Birth & Death · Upazila")}</span>
          </span>
        </Link>
        {canSwitchUnion && stationOptions.length > 0 && (
          <Select
            value={activeUnionId ?? (stationOptions.some((station) => station.id === "mn-dhakuria") ? "mn-dhakuria" : stationOptions[0]?.id)}
            onValueChange={(stationId) => {
              setActiveUnionId(stationId);
              void nav({ to: "/union-master" });
            }}
          >
            <SelectTrigger className="h-11 max-w-44 border-white/40 bg-white/10 text-sm font-bold text-white hover:bg-white/15 max-[400px]:max-w-32" aria-label={L("সক্রিয় স্টেশন নির্বাচন", "Select active station")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {stationOptions.map((station) => (
                <SelectItem key={station.id} value={station.id}>
                  {L(station.bn, station.en)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button variant="ghost" size="sm" className="h-11 shrink-0 bg-white/10 px-3 text-base font-semibold text-white transition hover:bg-amber-300/25 hover:text-amber-50 max-[400px]:h-9 max-[400px]:px-2 max-[400px]:text-sm sm:px-4" onClick={toggleLang} aria-label="Language">
          <Languages className="h-6 w-6 max-[400px]:h-5 max-[400px]:w-5" /><span className="ml-1">{lang === "bn" ? "EN" : "বাং"}</span>
        </Button>
        <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 bg-white/10 text-white transition hover:bg-sky-300/25 hover:text-sky-50 max-[400px]:h-9 max-[400px]:w-9" onClick={toggleTheme} aria-label="Theme">{dark ? <Sun className="h-6 w-6 max-[400px]:h-5 max-[400px]:w-5" /> : <Moon className="h-6 w-6 max-[400px]:h-5 max-[400px]:w-5" />}</Button>
        <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 bg-white/10 text-white transition hover:bg-violet-300/25 hover:text-violet-50 max-[400px]:h-9 max-[400px]:w-9" onClick={() => setDlg("manual")} aria-label="Manual"><BookOpen className="h-6 w-6 max-[400px]:h-5 max-[400px]:w-5" /></Button>
        <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 bg-white/10 text-white transition hover:bg-cyan-300/25 hover:text-cyan-50 max-[400px]:h-9 max-[400px]:w-9" onClick={() => setDlg("support")} aria-label="Support"><Headphones className="h-6 w-6 max-[400px]:h-5 max-[400px]:w-5" /></Button>
        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-11 max-w-40 shrink-0 truncate border-white/50 bg-emerald-800/60 px-3 text-sm font-semibold text-white hover:bg-emerald-900 hover:text-white sm:px-4">{L(user.name.bn, user.name.en)}</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>
                <div>{L(user.name.bn, user.name.en)}</div>
                <div className="text-xs font-normal text-muted-foreground">{roleLabel(user.role, L)}</div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => nav({ to: "/dashboard" })}>{L("ড্যাশবোর্ড", "Dashboard")}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => nav({ to: "/security" })}>{L("নিরাপত্তা ও সেশন", "Security & sessions")}</DropdownMenuItem>
              <DropdownMenuItem onClick={async () => { await logout(); nav({ to: "/", replace: true }); }}>
                <LogOut className="mr-2 h-4 w-4" />{L("লগআউট", "Logout")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : demoLoginAvailable ? (
          <span className="rounded-full border border-white/40 bg-emerald-700/35 px-2 py-1 text-[10px] font-semibold text-white sm:px-3 sm:text-xs">
            {L("লোকাল টেস্ট মোড", "Local test mode")}
          </span>
        ) : (
          <Button size="sm" className="h-11 shrink-0 bg-emerald-900 px-4 text-base font-bold text-white shadow-md shadow-emerald-950/20 hover:bg-emerald-950 max-[400px]:h-9 max-[400px]:px-2 max-[400px]:text-sm" onClick={() => setDlg("login")}><LogIn className="mr-2 h-6 w-6 max-[400px]:mr-0 max-[400px]:h-5 max-[400px]:w-5" /><span className="max-[360px]:sr-only">{L("লগইন", "Login")}</span></Button>
        )}
      </div>
      <LoginDialog open={dlg === "login"} onClose={() => setDlg(null)} />
      <ManualDialog open={dlg === "manual"} onClose={() => setDlg(null)} />
      <SupportDialog open={dlg === "support"} onClose={() => setDlg(null)} />
    </header>
  );
}

export function RoleSwitcherBar() {
  const { user, L, demoLoginAvailable, enterDemoLogin } = useApp();
  const nav = useNavigate();
  if (!demoLoginAvailable) return null;

  const roles = [
    ["worker", "স্বাস্থ্যকর্মী", "Health Worker"],
    ["police", "গ্রাম পুলিশ", "Village Police"],
    ["admin", "ইউপি প্রশাসনিক কর্মকর্তা", "UP Administrative Officer"],
    ["uno", "উপজেলা নির্বাহী অফিসার (ইউএনও)", "Upazila Nirbahi Officer (UNO)"],
  ] as const;

  return (
    <nav
      aria-label={L("লোকাল ডেমো রোল পরিবর্তন", "Local demo role switcher")}
      className="fixed bottom-3 right-3 z-50 w-56 rounded-xl border border-emerald-200 bg-background/95 p-2 shadow-lg backdrop-blur sm:bottom-5 sm:right-5"
    >
      <p className="px-1 pb-1.5 text-xs font-semibold text-muted-foreground">
        {L("রোল পরিবর্তন · টেস্ট মোড", "Switch role · Test mode")}
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        {roles.map(([role, bn, en]) => (
          <Button
            key={role}
            type="button"
            size="sm"
            variant={user?.role === role && demoLoginAvailable ? "default" : "outline"}
            aria-pressed={user?.role === role && demoLoginAvailable}
            className="h-auto min-h-9 whitespace-normal px-1.5 py-1.5 text-xs"
            onClick={() => {
              enterDemoLogin(role);
              nav({ to: "/dashboard" });
            }}
          >
            {L(bn, en)}
          </Button>
        ))}
      </div>
    </nav>
  );
}

export function LoginDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { L, n, demoLoginAvailable, enterDemoLogin } = useApp();
  const nav = useNavigate();
  const sendOtp = useServerFn(sendPhoneOtp), verifyOtp = useServerFn(verifyPhoneOtp);
  const pwSignIn = useServerFn(passwordSignIn), reset = useServerFn(requestPasswordReset);
  const submitRegistrationRequest = useServerFn(submitStaffRegistrationRequest);
  const [mobile, setMobile] = useState(""); const [otp, setOtp] = useState(""); const [sent, setSent] = useState(false);
  const [email, setEmail] = useState(""); const [pw, setPw] = useState(""); const [forgot, setForgot] = useState(false);
  const [fullName, setFullName] = useState("");
  const [requestMobile, setRequestMobile] = useState("");
  const [requestRole, setRequestRole] = useState<"worker" | "police">("worker");
  const [requestUnion, setRequestUnion] = useState("");
  const [requestSubmitted, setRequestSubmitted] = useState(false);
  const [loginMessage, setLoginMessage] = useState<"pending" | "rejected" | null>(null);
  const [busy, setBusy] = useState(false);

  const fail = (r: { error?: string; lockedMinutes?: number }) => {
    if (r.error === "pending") {
      setLoginMessage("pending");
    } else if (r.error === "rejected") {
      setLoginMessage("rejected");
    } else if (r.error === "locked" || r.error === "too_many")
      toast.error(L(`অনেকবার চেষ্টা করা হয়েছে। ${n(r.lockedMinutes ?? 15)} মিনিট পর আবার চেষ্টা করুন`, `Too many attempts. Try again in ${r.lockedMinutes ?? 15} minutes`));
    else if (r.error === "bad_phone") toast.error(L("সঠিক মোবাইল নম্বর দিন (01XXXXXXXXX)", "Enter a valid mobile number (01XXXXXXXXX)"));
    else if (r.error === "sms_failed") toast.error(L("SMS পাঠানো যায়নি, পরে চেষ্টা করুন", "Could not send SMS, try later"));
    else toast.error(r.error === "unavailable"
      ? L("সেবা সাময়িকভাবে অনুপলব্ধ, পরে চেষ্টা করুন", "The service is temporarily unavailable; try again later")
      : L("তথ্য সঠিক নয়", "Details are incorrect"));
  };
  const done = async (tokens: { access_token: string; refresh_token: string }) => {
    const { error } = await supabase.auth.setSession(tokens);
    if (error) { toast.error(error.message); return; }
    onClose(); setSent(false); setOtp(""); setPw(""); nav({ to: "/dashboard" });
  };
  const enterLocalRolePreview = (role: "worker" | "police" | "admin" | "uno") => {
    enterDemoLogin(role);
    toast.info(L("ডেমো ড্যাশবোর্ড · পরিবর্তন শুধু এই ট্যাবে থাকবে", "Demo dashboard · changes stay in this tab"));
    onClose();
    nav({ to: "/dashboard" });
  };
  const run = async (f: () => Promise<void>) => {
    setBusy(true);
    try {
      await f();
    } catch (cause) {
      console.error("Authentication operation failed", cause instanceof Error ? cause.message : "Unknown error");
      toast.error(L("সেবা সাময়িকভাবে অনুপলব্ধ, পরে চেষ্টা করুন", "The service is temporarily unavailable; try again later"));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!open) {
      setRequestSubmitted(false);
      setFullName("");
      setRequestMobile("");
      setRequestUnion("");
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{L("লগইন বা নিবন্ধনের অনুরোধ", "Login or request registration")}</DialogTitle>
          <DialogDescription>{L("বিদ্যমান অ্যাকাউন্টে লগইন করুন অথবা কর্মী হিসেবে নিবন্ধনের অনুরোধ পাঠান", "Sign in to an existing account or request staff registration")}</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="login">
          <TabsList className="grid h-auto w-full grid-cols-2">
            <TabsTrigger value="login">{L("লগইন", "Login")}</TabsTrigger>
            <TabsTrigger value="register">{L("নিবন্ধন", "Register")}</TabsTrigger>
          </TabsList>
          {loginMessage && (
            <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" role="status" aria-live="polite">
              {loginMessage === "pending"
                ? L("Waiting for Approval — আপনার অ্যাকাউন্ট অনুমোদনের অপেক্ষায় আছে।", "Waiting for Approval — your account is awaiting review.")
                : L("আপনার নিবন্ধন অনুমোদিত হয়নি।", "Your registration was not approved.")}
            </div>
          )}
          <TabsContent value="login" className="pt-2">
            <Tabs defaultValue="otp">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="otp">{L("মোবাইল ও OTP", "Mobile & OTP")}</TabsTrigger>
                <TabsTrigger value="pw">{L("পাসওয়ার্ড", "Password")}</TabsTrigger>
              </TabsList>
              <TabsContent value="otp" className="space-y-3 pt-2">
            <p className="text-xs text-muted-foreground">{L("স্বাস্থ্যকর্মী ও গ্রাম পুলিশের জন্য", "For Health Workers & Village Police")}</p>
            {demoLoginAvailable && (
              <p className="text-xs text-amber-800">
                {L("লোকাল প্রিভিউতে OTP পাঠানো বন্ধ। নিচে একটি ভূমিকা বেছে নিন।", "OTP is unavailable in local preview. Choose a role below.")}
              </p>
            )}
            <Label>{L("মোবাইল নম্বর", "Mobile number")}</Label>
            <Input inputMode="numeric" maxLength={11} value={mobile} disabled={sent} onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))} placeholder="017XXXXXXXX" />
            {sent ? (<>
              <Label>{L("৬ অঙ্কের কোড", "6-digit code")}</Label>
              <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} />
              <Button className="w-full" disabled={busy || otp.length !== 6} onClick={() => run(async () => {
                const r = await verifyOtp({ data: { mobile, code: otp } }); if (r.ok) await done(r.tokens); else fail(r);
              })}>{L("যাচাই করুন", "Verify")}</Button>
              <button className="text-sm text-primary underline" onClick={() => { setSent(false); setOtp(""); }}>{L("নম্বর বদলান / আবার পাঠান", "Change number / resend")}</button>
            </>) : <>
              <Button className="w-full" disabled={demoLoginAvailable || busy || mobile.length !== 11} onClick={() => {
                void run(async () => {
                  setLoginMessage(null);
                  const r = await sendOtp({ data: { mobile } });
                  if (r.ok) {
                    setSent(true);
                    toast.success(L("নিবন্ধিত হলে আপনার মোবাইলে কোড পাঠানো হয়েছে", "If registered, a code was sent to your mobile"));
                  } else {
                    fail(r);
                  }
                });
              }}>{L("OTP পাঠান", "Send OTP")}</Button>
              {demoLoginAvailable && (
                <div className="grid grid-cols-2 gap-2">
                  {([
                    ["worker", "স্বাস্থ্যকর্মী ড্যাশবোর্ড"],
                    ["police", "গ্রাম পুলিশ ড্যাশবোর্ড"],
                    ["admin", "ইউপি কর্মকর্তা ড্যাশবোর্ড"],
                    ["uno", "ইউএনও ড্যাশবোর্ড"],
                  ] as const).map(([role, label]) => (
                    <Button key={role} type="button" variant="outline" className="h-auto min-h-10 whitespace-normal px-2 py-2 text-xs"
                      onClick={() => enterLocalRolePreview(role)}>
                      {label}
                    </Button>
                  ))}
                </div>
              )}
            </>}
          </TabsContent>
          <TabsContent value="pw" className="space-y-3 pt-2">
            {forgot ? (<>
              <Label>{L("ইমেইল", "Email")}</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <Button className="w-full" disabled={busy} onClick={() => run(async () => {
                await reset({ data: { email } });
                toast.success(L("অ্যাকাউন্ট থাকলে একটি রিসেট লিংক পাঠানো হয়েছে (১ ঘণ্টা মেয়াদি)", "If the account exists, a reset link was sent (valid 1 hour)"));
                setForgot(false);
              })}>{L("রিসেট লিংক পাঠান", "Send reset link")}</Button>
              <button className="text-sm text-primary underline" onClick={() => setForgot(false)}>{L("ফিরে যান", "Back")}</button>
            </>) : (<>
              <p className="text-xs text-muted-foreground">{L("প্রশাসনিক কর্মকর্তা, ইউএনও ও সুপার অ্যাডমিনের জন্য", "For Admin Officers, UNOs & Super Admins")}</p>
              <Label>{L("ইমেইল", "Email")}</Label>
              <Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
              <Label>{L("পাসওয়ার্ড", "Password")}</Label>
              <Input type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />
              <Button className="w-full" disabled={busy || !email || !pw} onClick={() => run(async () => {
                setLoginMessage(null);
                const r = await pwSignIn({ data: { email, password: pw } }); if (r.ok) await done(r.tokens); else fail(r);
              })}>{L("লগইন", "Login")}</Button>
              <button className="text-sm text-primary underline" onClick={() => setForgot(true)}>{L("পাসওয়ার্ড ভুলে গেছেন?", "Forgot password?")}</button>
            </>)}
          </TabsContent>
            </Tabs>
          </TabsContent>
          <TabsContent value="register" className="space-y-3 pt-2">
            {requestSubmitted ? (
              <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-950" role="status" aria-live="polite">
                {L(
                  "আপনার অনুরোধ জমা হয়েছে। সংশ্লিষ্ট কর্মকর্তা অ্যাকাউন্ট তৈরি করলে মোবাইল OTP দিয়ে লগইন করতে পারবেন।",
                  "Your request was submitted. You can sign in with mobile OTP after the responsible officer creates your account.",
                )}
              </div>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  {L(
                    "স্বাস্থ্যকর্মী বা গ্রাম পুলিশ হিসেবে আবেদন করুন। এটি শুধু অনুরোধ—এখনই কোনো অ্যাকাউন্ট বা পাসওয়ার্ড তৈরি হবে না।",
                    "Request access as a Health Worker or Gram Police. This is only a request; no account or password is created yet.",
                  )}
                </p>
                <div className="space-y-1">
                  <Label htmlFor="registration-full-name">{L("পূর্ণ নাম", "Full name")}</Label>
                  <Input
                    id="registration-full-name"
                    autoComplete="name"
                    maxLength={100}
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="registration-mobile">{L("মোবাইল নম্বর", "Mobile number")}</Label>
                  <Input
                    id="registration-mobile"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    maxLength={11}
                    placeholder="01XXXXXXXXX"
                    value={requestMobile}
                    onChange={(event) => setRequestMobile(event.target.value.replace(/\D/g, ""))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{L("যে ভূমিকার জন্য আবেদন", "Role requested")}</Label>
                  <Select value={requestRole} onValueChange={(value) => {
                    if (value === "worker" || value === "police") setRequestRole(value);
                  }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="worker">{L("স্বাস্থ্যকর্মী", "Health Worker")}</SelectItem>
                      <SelectItem value="police">{L("গ্রাম পুলিশ", "Gram Police")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>{L("ইউনিয়ন", "Union")}</Label>
                  <Select value={requestUnion} onValueChange={setRequestUnion}>
                    <SelectTrigger><SelectValue placeholder={L("ইউনিয়ন বেছে নিন", "Select your union")} /></SelectTrigger>
                    <SelectContent>
                      {MONIRAMPUR_STATIONS.filter((station) => station.type === "union").map((station) => (
                        <SelectItem key={station.id} value={station.id}>{L(station.bn, station.en)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  className="w-full"
                  disabled={busy || !fullName.trim() || requestMobile.length !== 11 || !requestUnion}
                  onClick={() => void run(async () => {
                    let result: Awaited<ReturnType<typeof submitRegistrationRequest>>;
                    try {
                      result = await submitRegistrationRequest({
                        data: { fullName: fullName.trim(), mobile: requestMobile, role: requestRole, unionId: requestUnion },
                      });
                    } catch (err) {
                      console.error("Full Supabase Error:", JSON.stringify(err, null, 2));
                      alert(L("অনুরোধ জমা দেওয়া যায়নি। পরে আবার চেষ্টা করুন", "Could not submit the request. Please try again later"));
                      return;
                    }
                    if (!result.ok) {
                      toast.error(
                        result.error === "unavailable" && result.debugMessage
                          ? result.debugMessage
                          : result.error === "bad_phone"
                          ? L("সঠিক মোবাইল নম্বর দিন", "Enter a valid mobile number")
                          : result.error === "bad_union"
                            ? L("সঠিক ইউনিয়ন বেছে নিন", "Select a valid union")
                            : result.error === "duplicate"
                              ? L("এই নম্বরের একটি অনুরোধ ইতিমধ্যে অপেক্ষমাণ", "A request for this number is already pending")
                              : result.error === "too_many"
                                ? L("অনেকবার অনুরোধ করা হয়েছে। পরে আবার চেষ্টা করুন", "Too many requests. Please try again later")
                                : L("অনুরোধ জমা দেওয়া যায়নি। পরে আবার চেষ্টা করুন", "Could not submit the request. Please try again later"),
                      );
                      return;
                    }
                    setRequestSubmitted(true);
                    setFullName("");
                    setRequestMobile("");
                    setRequestUnion("");
                    toast.success(L("নিবন্ধনের অনুরোধ জমা হয়েছে", "Registration request submitted"));
                  })}
                >
                  {busy ? L("জমা হচ্ছে…", "Submitting…") : L("নিবন্ধনের অনুরোধ পাঠান", "Submit registration request")}
                </Button>
              </>
            )}
          </TabsContent>
        </Tabs>
        {demoLoginAvailable && (
          <p className="border-t border-dashed pt-3 text-xs text-amber-800">
            {L(
              "শুধু লোকাল UI পরীক্ষার জন্য · কোনো বাস্তব অ্যাকাউন্ট বা সেশন তৈরি হয় না",
              "Local UI preview only · no real account or session is created",
            )}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ManualDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { L } = useApp();
  const steps: [string, string[]][] = [
    [L("ইপিআই / স্বাস্থ্যকর্মী", "EPI / Health Worker"), [
      L("মোবাইল ও OTP দিয়ে লগইন করুন", "Log in with mobile & OTP"),
      L("জন্ম বা মৃত্যু ফর্ম বেছে নিন, বাংলা ও ইংরেজি ঘর পূরণ করুন", "Pick birth/death form, fill Bangla & English boxes"),
      L("শুধু গ্রাম বেছে নিন — বাকি ঠিকানা নিজে বসে যাবে", "Pick the village only — the rest of the address fills itself"),
      L("৩টি পর্যন্ত কাগজ যুক্ত করে জমা দিন; অফলাইনেও কাজ করে", "Attach up to 3 documents and submit; works offline"),
    ]],
    [L("প্রশাসনিক কর্মকর্তা", "Administrative Officer"), [
      L("ইউনিয়নের সব আবেদন দেখুন, মন্তব্য ও অবস্থা হালনাগাদ করুন", "Review union cases, add remarks, update status"),
      L("গ্রাম পুলিশকে যাচাইয়ের কাজ দিন", "Assign verification to Village Police"),
      L("নিবন্ধন নম্বর দিয়ে কেস সম্পন্ন করুন", "Close cases with the registration number"),
    ]],
    [L("গ্রাম পুলিশ", "Village Police"), [
      L("নির্ধারিত বাড়ির তালিকা দেখুন", "See assigned houses"),
      L("কাগজ সংগ্রহের চেকলিস্ট টিক দিন ও 'সংগ্রহ সম্পন্ন' চাপুন", "Tick the checklist and tap 'Documents Collected'"),
    ]],
    [L("ইউএনও", "UNO"), [
      L("সব ইউনিয়নের লক্ষ্যমাত্রা গ্রাফে দেখুন", "Track all unions against targets"),
      L("লাল চিহ্নিত নিষ্ক্রিয় এলাকা দেখুন ও ইউএনও মন্তব্য দিন", "Watch red-flagged areas, add UNO remarks"),
      L("মাস্টার রিপোর্ট ডাউনলোড করুন", "Download the master report"),
    ]],
  ];
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader><DialogTitle>{L("ব্যবহার নির্দেশিকা", "User Manual")}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {steps.map(([role, list]) => (
            <div key={role}>
              <h3 className="mb-1 font-semibold text-primary">{role}</h3>
              <ol className="list-decimal space-y-1 pl-5 text-sm">{list.map((s) => <li key={s}>{s}</li>)}</ol>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SupportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { L } = useApp();
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{L("সহায়তা কেন্দ্র", "Contact Support")}</DialogTitle>
          <DialogDescription>{L("উপজেলা আইসিটি / প্রশাসনিক সহায়তা দল", "Upazila ICT / Administrative support team")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Button asChild variant="outline"><a href="tel:+8801700000000">📞 {L("কল করুন", "Call")} +880 1700-000000</a></Button>
          <Button asChild variant="outline"><a href="mailto:ict@upazila.gov.bd">✉️ ict@upazila.gov.bd</a></Button>
          <Button asChild variant="outline"><a href="https://wa.me/8801700000000" target="_blank" rel="noreferrer">💬 WhatsApp</a></Button>
          <p className="text-xs text-muted-foreground">{L("অফিস সময়: রবি–বৃহস্পতি, সকাল ৯টা – বিকাল ৫টা", "Office hours: Sun–Thu, 9 AM – 5 PM")}</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
