import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import { MAX_IMAGE_BYTES } from "./compress-image";
import { seedState } from "./seed";
import type { AppState, CaseDetails, CaseFileMetadata, RegCase, Role, Upazila, User, Village, Union } from "./types";

type Lang = "bn" | "en";
export type Mfa = "ok" | "enroll" | "challenge";
type EpiVisit = Database["public"]["Tables"]["epi_visits"]["Row"];
type NewEpiVisit = Pick<EpiVisit, "child_name_bn" | "child_name_en" | "parent_mobile" | "village_id">;
type UpazilaAnnouncement = {
  upazilaId: string;
  noticeBn: string;
  noticeEn: string;
  active: boolean;
  updatedAt: number;
};
const localDemoLoginAvailable =
  import.meta.env.DEV &&
  ((typeof __LOCAL_DEMO_AVAILABLE__ === "boolean" && __LOCAL_DEMO_AVAILABLE__) ||
    !import.meta.env["VITE_SUPABASE_URL"] ||
    !(import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] || import.meta.env["VITE_SUPABASE_ANON_KEY"]));
export const MASTER_APPLICATIONS_KEY = "up_master_applications_v5";
export const MASTER_APPLICATIONS_UPDATED_EVENT = "up-master-applications-updated";
const LEGACY_DEMO_CASE_KEYS = [
  "uert-demo-cases",
  "health_worker_applications_v2",
  "village_police_applications_v2",
  "up_official_applications_v2",
  "upazila_official_applications_v2",
];
const demoAttachmentPreviews = new Map<string, string>();
export const getDemoAttachmentPreview = (caseId: string, fileIndex: number) =>
  demoAttachmentPreviews.get(`${caseId}:${fileIndex}`);

function readDemoCases(key: string): RegCase[] | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(key);
    if (stored === null) return null;
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) throw new Error(`Stored applications in ${key} must be an array`);
    const cases = parsed.filter(
      (item): item is RegCase =>
        typeof item === "object" &&
        item !== null &&
        typeof item.id === "string" &&
        typeof item.createdBy === "string" &&
        (item.type === "birth" || item.type === "death") &&
        Array.isArray(item.files) &&
        Array.isArray(item.remarks),
    );
    if (cases.length !== parsed.length) console.warn(`Ignored invalid demo applications in ${key}`);
    return cases;
  } catch (cause) {
    console.error(`Failed to read demo applications from ${key}`, cause);
    return null;
  }
}

export function readStoredRegCases(key: string): RegCase[] | null {
  return readDemoCases(key);
}

export function readMasterRegCases(fallbackCases: RegCase[]): RegCase[] {
  const storedCases = readDemoCases(MASTER_APPLICATIONS_KEY);
  if (storedCases) return storedCases;
  const casesById = new Map(fallbackCases.map((item) => [item.id, item]));
  for (const key of LEGACY_DEMO_CASE_KEYS) {
    for (const item of readDemoCases(key) ?? []) casesById.set(item.id, item);
  }
  return Array.from(casesById.values());
}

function writeDemoCases(key: string, cases: RegCase[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(cases));
    return true;
  } catch (cause) {
    console.error(`Failed to save demo applications to ${key}`, cause);
    toast.error("Could not save local demo applications");
    return false;
  }
}

export function writeMasterRegCases(cases: RegCase[]) {
  if (!writeDemoCases(MASTER_APPLICATIONS_KEY, cases)) return false;
  window.dispatchEvent(
    new CustomEvent<RegCase[]>(MASTER_APPLICATIONS_UPDATED_EVENT, { detail: cases }),
  );
  return true;
}

function saveDemoAttachmentPreviews(caseId: string, files: File[]) {
  files.forEach((file, index) => {
    const key = `${caseId}:${index}`;
    const previousUrl = demoAttachmentPreviews.get(key);
    if (previousUrl) URL.revokeObjectURL(previousUrl);
    demoAttachmentPreviews.set(key, URL.createObjectURL(file));
  });
  for (const [key, url] of demoAttachmentPreviews) {
    if (key.startsWith(`${caseId}:`) && Number(key.slice(caseId.length + 1)) >= files.length) {
      URL.revokeObjectURL(url);
      demoAttachmentPreviews.delete(key);
    }
  }
}
/** Local testing mode: dev server or Lovable preview hosts only (never the published site). */
const previewTestingAllowed = () =>
  typeof window !== "undefined" &&
  (import.meta.env.DEV || /^(id-preview--|preview--)|lovableproject(-dev)?\.com$|^localhost$/.test(window.location.hostname));
type NewCase = Omit<RegCase, "id" | "createdAt" | "synced" | "smsSent" | "remarks" | "status" | "createdBy" | "upazilaId" | "unionId" | "ward" | "files"> & {
  files: File[];
  fileMetadata?: CaseFileMetadata[];
};
type CaseCorrection = Pick<RegCase, "type" | "name" | "father" | "mother" | "nid" | "gender" | "dob" | "villageId"> &
  Pick<RegCase, "parentMobile" | "details"> & {
    order?: string | undefined;
    dod?: string | undefined;
    cause?: RegCase["cause"];
    files?: File[] | undefined;
    fileMetadata?: CaseFileMetadata[] | undefined;
  };
const MAX_CASE_FILES = 4;

interface Ctx {
  state: AppState; user: User | null; authReady: boolean; mfa: Mfa; online: boolean; demoMode: boolean; demoLoginAvailable: boolean;
  caseLoadError: string | null;
  announcements: UpazilaAnnouncement[];
  selectedUpazilaId: string | undefined;
  setSelectedUpazilaId: (id: string | undefined) => void;
  activeUnionId: string | undefined;
  setActiveUnionId: (id: string | undefined) => void;
  saveAnnouncement: (upazilaId: string, noticeBn: string, noticeEn: string, active: boolean) => Promise<boolean>;
  saveUnionVillages: (villages: Village[], unionId?: string) => Promise<boolean>;
  epiVisits: EpiVisit[]; enterDemoLogin: (role: "worker" | "police" | "admin" | "uno") => void; addEpiVisit: (visit: NewEpiVisit) => Promise<string | null>;
  lang: Lang; toggleLang: () => void; L: (bn: string, en: string) => string; n: (v: number | string) => string;
  dark: boolean; toggleTheme: () => void;
  logout: () => Promise<void>; refresh: () => Promise<void>; refreshAuth: () => Promise<void>;
  addCase: (c: NewCase) => Promise<string | null>;
  updateCase: (id: string, correction: CaseCorrection) => Promise<boolean>;
  patchCase: (id: string, patch: { status?: RegCase["status"]; regNo?: string; police?: RegCase["police"] }) => Promise<boolean>;
  addRemark: (id: string, text: string) => Promise<void>;
  addUpazila: (u: Upazila) => Promise<boolean>;
  findVillage: (id: string) => { v: Village; un: Union; up: Upazila } | null;
}
const C = createContext<Ctx | null>(null);
const QUEUE = "uert-offline-queue";
const UNION_VILLAGES_PREFIX = "birth-life-registry:union-villages:";
const PRIV: Role[] = ["admin", "uno", "super"];

export function readUnionVillageMaster(unionId: string): Village[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${UNION_VILLAGES_PREFIX}${unionId}`);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const villages = parsed.filter((item): item is Village => {
      if (!item || typeof item !== "object") return false;
      const value = item as Partial<Village>;
      return typeof value.id === "string" && typeof value.bn === "string" && typeof value.en === "string" && typeof value.ward === "number" && typeof value.poBn === "string" && typeof value.poEn === "string";
    });
    return villages;
  } catch {
    return null;
  }
}

export function saveUnionVillageDraft(unionId: string, villages: Village[]): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(`${UNION_VILLAGES_PREFIX}${unionId}`, JSON.stringify(villages));
    return true;
  } catch {
    return false;
  }
}

function applyUnionVillageMaster(upazilas: Upazila[], unionId: string): Upazila[] {
  const villages = readUnionVillageMaster(unionId);
  if (!villages) return upazilas;
  return upazilas.map((upazila) => ({
    ...upazila,
    unions: upazila.unions.map((union) => union.id === unionId ? { ...union, villages } : union),
  }));
}

function applySavedUnionVillages(upazilas: Upazila[]): Upazila[] {
  let result = upazilas;
  for (const upazila of upazilas) {
    for (const union of upazila.unions) {
      if (readUnionVillageMaster(union.id)) result = applyUnionVillageMaster(result, union.id);
    }
  }
  return result;
}
const empty: AppState = { upazilas: [], users: [], cases: [], audit: [], sessionId: null };

/* eslint-disable @typescript-eslint/no-explicit-any */
const mapCase = (r: any, remarks: any[]): RegCase => ({
  id: r.id, type: r.type,
  name: { bn: r.name_bn, en: r.name_en }, father: { bn: r.father_bn, en: r.father_en }, mother: { bn: r.mother_bn, en: r.mother_en },
  nid: r.nid ?? "", parentMobile: r.parent_mobile ?? undefined, gender: r.gender, dob: r.dob, order: r.child_order ?? undefined, dod: r.dod ?? undefined,
  cause: r.cause_bn ? { bn: r.cause_bn, en: r.cause_en ?? "" } : undefined,
  details: r.details ?? {},
  villageId: r.village_id, files: r.files ?? [], filesPurged: r.files_purged,
  status: r.status, regNo: r.reg_no ?? undefined,
  remarks: remarks.filter((m) => m.case_id === r.id).map((m) => ({ by: m.author, role: m.role, text: m.text, at: Date.parse(m.created_at) })),
  police: r.police_task ?? undefined,
  createdBy: r.created_by, upazilaId: r.upazila_id, stationId: r.station_id ?? r.union_id,
  unionId: r.union_id, ward: r.ward,
  createdAt: Date.parse(r.created_at), completedAt: r.completed_at ? Date.parse(r.completed_at) : undefined,
  synced: true, smsSent: r.sms_sent,
});

const CASE_DATA_PAGE_SIZE = 1000;

async function fetchAllCases() {
  const rows: Database["public"]["Tables"]["cases"]["Row"][] = [];
  for (let offset = 0; ; offset += CASE_DATA_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("cases")
      .select("*")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + CASE_DATA_PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < CASE_DATA_PAGE_SIZE) return rows;
  }
}

async function fetchAllRemarks() {
  const rows: Database["public"]["Tables"]["case_remarks"]["Row"][] = [];
  for (let offset = 0; ; offset += CASE_DATA_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("case_remarks")
      .select("*")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + CASE_DATA_PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < CASE_DATA_PAGE_SIZE) return rows;
  }
}

function isDuplicateCase(existing: RegCase, candidate: NewCase, user: User): boolean {
  if (existing.type !== candidate.type) return false;
  const nid = candidate.nid.trim();
  if (candidate.type === "death" || nid) {
    return existing.nid === nid && (candidate.type === "death" || existing.order === candidate.order);
  }
  const same = (left: string, right: string) => left.trim().toLocaleLowerCase() === right.trim().toLocaleLowerCase();
  return existing.upazilaId === user.upazilaId &&
    existing.unionId === user.unionId &&
    existing.ward === (user.ward ?? 1) &&
    existing.dob === candidate.dob &&
    existing.order === candidate.order &&
    same(existing.name.bn, candidate.name.bn) &&
    same(existing.name.en, candidate.name.en) &&
    same(existing.father.bn, candidate.father.bn) &&
    same(existing.father.en, candidate.father.en) &&
    same(existing.mother.bn, candidate.mother.bn) &&
    same(existing.mother.en, candidate.mother.en);
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(empty);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [mfa, setMfa] = useState<Mfa>("ok");
  const [demoMode, setDemoMode] = useState(false);
  const [caseLoadError, setCaseLoadError] = useState<string | null>(null);
  const [epiVisits, setEpiVisits] = useState<EpiVisit[]>([]);
  const [announcements, setAnnouncements] = useState<UpazilaAnnouncement[]>([]);
  const [selectedUpazilaId, setSelectedUpazilaId] = useState<string>();
  const [activeUnionId, setActiveUnionId] = useState<string>();
  const [online, setOnline] = useState(true);
  const [lang, setLang] = useState<Lang>("bn");
  const [dark, setDark] = useState(false);
  const [pending, setPending] = useState<any[]>([]);
  const syncAttemptSignature = useRef("");
  const syncingOfflineQueue = useRef(false);
  const prefsReady = useRef(false);

  const L = useCallback((bn: string, en: string) => (lang === "bn" ? bn : en), [lang]);
  const n = useCallback((v: number | string) => lang === "bn" ? String(v).replace(/\d/g, (d) => "০১২৩৪৫৬৭৮৯"[+d]!) : String(v), [lang]);

  const enterDemoLogin = useCallback((role: "worker" | "police" | "admin" | "uno") => {
    if (!localDemoLoginAvailable && !previewTestingAllowed()) return;
    setCaseLoadError(null);
    const demo = seedState();
    const demoUserIds = { worker: "u-w1", police: "u-p1", admin: "u-a1", uno: "u-uno" };
    const previewUser = demo.users.find((candidate) => candidate.id === demoUserIds[role]);
    if (!previewUser) throw new Error(`The seeded ${role} account is missing`);
    demo.cases = readMasterRegCases(demo.cases).map((item) => ({
      ...item,
      files: item.files.map((file) => ({ ...file })),
      remarks: item.remarks.map((remark) => ({ ...remark })),
    }));
    const upazila = demo.upazilas.find((area) => area.id === previewUser.upazilaId);
    const union =
      upazila?.unions.find((area) => area.id === previewUser.unionId) ??
      (role === "uno" ? upazila?.unions[0] : undefined);
    const village = union?.villages[0];
    if (!upazila || !village || (role !== "uno" && !union)) {
      throw new Error(`The seeded ${role} account's area is incomplete`);
    }
    const attendedAt = new Date().toISOString();
    setState(previewUser.unionId ? { ...demo, upazilas: applyUnionVillageMaster(demo.upazilas, previewUser.unionId) } : demo);
    setUser(previewUser);
    if (role === "admin") setActiveUnionId(previewUser.stationId ?? previewUser.unionId ?? "mn-dhakuria");
    setMfa("ok");
    setEpiVisits(role === "worker" && union ? [
      {
        id: "demo-epi-visit-1",
        child_name_bn: "মাহিরা আক্তার",
        child_name_en: "Mahira Akter",
        parent_mobile: "01711000051",
        village_id: village.id,
        upazila_id: upazila.id,
        union_id: union.id,
        ward: previewUser.ward ?? 1,
        attended_at: attendedAt,
        registration_case_id: null,
        created_by: previewUser.id,
        created_at: attendedAt,
      },
    ] : []);
    setDemoMode(true);
    setAuthReady(true);
  }, []);

  const loadData = useCallback(async () => {
    if (demoMode) return;
    try {
      const [ups, profs, roles, cases, remarks, noticeRows] = await Promise.all([
        supabase.from("upazilas").select("*").order("created_at"),
        supabase.from("profiles").select("*"),
        supabase.from("user_roles").select("user_id, role"),
        fetchAllCases(),
        fetchAllRemarks(),
        supabase.from("upazila_announcements").select("*"),
      ]);
      const loadError = ups.error ?? profs.error ?? roles.error ?? noticeRows.error;
      if (loadError) throw loadError;
      setAnnouncements((noticeRows.data ?? []).map((notice) => ({
        upazilaId: notice.upazila_id,
        noticeBn: notice.notice_bn,
        noticeEn: notice.notice_en,
        active: notice.active,
        updatedAt: Date.parse(notice.updated_at),
      })));
      const upazilas: Upazila[] = (ups.data ?? []).map((u) => ({ id: u.id, bn: u.bn, en: u.en, districtBn: u.district_bn, districtEn: u.district_en,
        divisionBn: u.division_bn, divisionEn: u.division_en, unions: u.unions as unknown as Union[] }));
      const users: User[] = (profs.data ?? []).flatMap((p) => {
        const role = (roles.data ?? []).find((r) => r.user_id === p.id)?.role;
        if (
          role !== undefined &&
          role !== "worker" &&
          role !== "admin" &&
          role !== "police" &&
          role !== "uno" &&
          role !== "super" &&
          role !== "district"
        ) return [];
        return [{
          id: p.id,
          name: { bn: p.name_bn, en: p.name_en },
          role: role ?? "worker",
          active: p.active,
          mobile: p.mobile ?? undefined,
          email: p.email ?? undefined,
          upazilaId: p.upazila_id ?? "",
          stationId: p.station_id ?? p.union_id ?? undefined,
          unionId: p.union_id ?? undefined,
          ward: p.ward ?? undefined,
        }];
      });
      setCaseLoadError(null);
      const upazilasWithSavedVillages = applySavedUnionVillages(upazilas);
      setState((current) => ({
        upazilas: upazilasWithSavedVillages,
        users,
        cases: cases.map((c) => mapCase(c, remarks)),
        audit: [],
        sessionId: null,
      }));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setCaseLoadError(message);
      console.error("Could not load registration applications", cause);
      toast.error(L("আবেদন তালিকা লোড করা যায়নি", "Could not load applications"));
    }
  }, [L, demoMode]);

  const refreshCases = useCallback(async () => {
    if (demoMode) return;
    try {
      const [cases, remarks] = await Promise.all([fetchAllCases(), fetchAllRemarks()]);
      setCaseLoadError(null);
      setState((current) => ({
        ...current,
        cases: cases.map((item) => mapCase(item, remarks)),
      }));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setCaseLoadError(message);
      console.error("Failed to refresh live registration cases", cause);
      toast.error(L("লাইভ আবেদন হালনাগাদ করা যায়নি", "Could not refresh live applications"));
    }
  }, [L, demoMode]);

  const refreshAuth = useCallback(async () => {
    if (demoMode) {
      setAuthReady(true);
      return;
    }
    if (localDemoLoginAvailable) {
      setAuthReady(true);
      return;
    }
    const { data: { user: au } } = await supabase.auth.getUser();
    if (!au) { setUser(null); setState(empty); setAnnouncements([]); setMfa("ok"); setAuthReady(true); return; }
    const [{ data: p }, { data: r }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", au.id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", au.id),
    ]);
    if (!p || !r?.length || !p.active) {
      toast.error(
        p?.status === "pending"
          ? L("Waiting for Approval — আপনার অ্যাকাউন্ট অনুমোদনের অপেক্ষায় আছে।", "Waiting for Approval — your account is awaiting review.")
          : p?.status === "rejected"
            ? L("আপনার নিবন্ধন অনুমোদিত হয়নি।", "Your registration was not approved.")
            : L("এই অ্যাকাউন্টের অনুমতি নেই", "This account has no access"),
      );
      await supabase.auth.signOut(); setUser(null); setAuthReady(true); return;
    }
    const role = r[0]!.role as Role;
    setUser({ id: au.id, name: { bn: p.name_bn, en: p.name_en }, role, mobile: p.mobile ?? undefined, email: p.email ?? undefined,
      upazilaId: p.upazila_id ?? "", stationId: p.station_id ?? p.union_id ?? undefined, unionId: p.union_id ?? undefined, ward: p.ward ?? undefined });
    let m: Mfa = "ok";
    if (PRIV.includes(role)) {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.currentLevel !== "aal2") m = aal?.nextLevel === "aal2" ? "challenge" : "enroll";
    }
    setMfa(m);
    if (m === "ok") await loadData();
    setAuthReady(true);
  }, [L, loadData, demoMode]);

  useEffect(() => {
    try {
      setLang((localStorage.getItem("uert-lang") as Lang) || "bn");
      setDark(localStorage.getItem("uert-theme") === "dark");
      setPending(JSON.parse(localStorage.getItem(QUEUE) || "[]"));
    } catch { /* ignore */ }
    prefsReady.current = true;
    setOnline(navigator.onLine);
    const up = () => setOnline(true), down = () => setOnline(false);
    window.addEventListener("online", up); window.addEventListener("offline", down);
    if (localDemoLoginAvailable) {
      setAuthReady(true);
      return () => {
        window.removeEventListener("online", up);
        window.removeEventListener("offline", down);
      };
    }
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED" || event === "MFA_CHALLENGE_VERIFIED") {
        setTimeout(() => { void refreshAuth(); }, 0);
      }
    });
    void refreshAuth();
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); sub.subscription.unsubscribe(); };
  }, [refreshAuth]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.lang = lang;
    if (prefsReady.current) { localStorage.setItem("uert-theme", dark ? "dark" : "light"); localStorage.setItem("uert-lang", lang); }
  }, [dark, lang]);
  useEffect(() => {
    if (!user) {
      setActiveUnionId(undefined);
      return;
    }
    if (user.role === "admin" || user.role === "super") {
      setActiveUnionId((current) => {
        if (current) return current;
        const defaultUnion = state.upazilas
          .find((upazila) => upazila.id === "manirampur")
          ?.unions.some((union) => union.id === "mn-dhakuria")
          ? "mn-dhakuria"
          : user.stationId ?? user.unionId;
        return defaultUnion;
      });
    }
  }, [state.upazilas, user?.id, user?.role, user?.stationId, user?.unionId]);
  useEffect(() => {
    if (!demoMode || !user) return;
    writeDemoCases(MASTER_APPLICATIONS_KEY, state.cases);
  }, [demoMode, state.cases, user]);
  useEffect(() => {
    if (!demoMode) return;
    const syncMasterCases = (cases: RegCase[] | null) => {
      if (!cases) return;
      setState((current) =>
        JSON.stringify(current.cases) === JSON.stringify(cases)
          ? current
          : {
              ...current,
              cases: cases.map((item) => ({
                ...item,
                files: item.files.map((file) => ({ ...file })),
                remarks: item.remarks.map((remark) => ({ ...remark })),
              })),
            },
      );
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === MASTER_APPLICATIONS_KEY) {
        syncMasterCases(readDemoCases(MASTER_APPLICATIONS_KEY));
      }
    };
    const onMasterUpdate = (event: Event) => {
      syncMasterCases((event as CustomEvent<RegCase[]>).detail);
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(MASTER_APPLICATIONS_UPDATED_EVENT, onMasterUpdate);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(MASTER_APPLICATIONS_UPDATED_EVENT, onMasterUpdate);
    };
  }, [demoMode]);
  useEffect(() => {
    if (!authReady || !user || demoMode || mfa !== "ok") return;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const refreshLiveCases = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => void refreshCases(), 100);
    };
    const channel = supabase
      .channel(`live-registration-cases-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "cases" }, refreshLiveCases)
      .on("postgres_changes", { event: "*", schema: "public", table: "case_remarks" }, refreshLiveCases)
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error("Live registration case subscription failed", status);
          toast.error(L("লাইভ আবেদন সংযোগ ব্যর্থ হয়েছে", "Live application connection failed"));
        }
      });
    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [L, authReady, demoMode, mfa, refreshCases, user]);
  useEffect(() => { if (prefsReady.current) localStorage.setItem(QUEUE, JSON.stringify(pending)); }, [pending]);

  // Explicitly submitted offline cases are synced when their owning account reconnects.
  useEffect(() => {
    if (demoMode || !online || !user || (user.role !== "worker" && user.role !== "police") || !pending.length) return;
    const signature = `${user.id}:${pending.map((row) => String(row.id)).sort().join(",")}`;
    if (syncingOfflineQueue.current || syncAttemptSignature.current === signature) return;
    syncAttemptSignature.current = signature;
    syncingOfflineQueue.current = true;
    (async () => {
      const left: any[] = pending.filter((row) => row.created_by !== user.id);
      const ownedRows = pending.filter((row) => row.created_by === user.id);
      let synced = 0;
      let firstSyncError: string | undefined;
      try {
        for (const row of ownedRows) {
          const { error } = await supabase.from("cases").insert(row);
          if (error?.code === "23505") {
            synced += 1;
          } else if (error) {
            left.push(row);
            firstSyncError ??= error.message;
          } else {
            synced += 1;
          }
        }
      } finally {
        syncingOfflineQueue.current = false;
      }
      if (synced || left.length !== pending.length) {
        syncAttemptSignature.current =
          `${user.id}:${left.map((row) => String(row.id)).sort().join(",")}`;
        setPending(left);
      }
      if (synced) {
        toast.success(L(`${n(synced)}টি অফলাইন এন্ট্রি সিঙ্ক হয়েছে`, `${synced} offline entries synced`));
        void loadData();
      }
      if (firstSyncError) {
        console.error("Some offline applications could not be synced", firstSyncError);
        toast.error(
          L("কিছু অফলাইন আবেদন সিঙ্ক হয়নি। সংযোগ যাচাই করে পরে আবার চেষ্টা করুন।", "Some offline applications were not synced. Check the connection and try again later."),
        );
      }
    })();
  }, [demoMode, online, user, pending, L, n, loadData]);

  const findVillage = useCallback((id: string) => {
    for (const up of state.upazilas) for (const un of up.unions) {
      const v = un.villages.find((x) => x.id === id); if (v) return { v, un, up };
    }
    return null;
  }, [state.upazilas]);

  const dupMsg = (t: string) => t === "birth"
    ? L("এই শিশু ও জন্মতারিখের তথ্য আগেই জমা হয়েছে", "This child and date of birth have already been submitted")
    : L("এই NID/জন্ম নিবন্ধন নম্বরে মৃত্যু নিবন্ধন আগেই হয়েছে", "A death with this NID/birth certificate number already exists");

  const value: Ctx = {
    caseLoadError,
    state: { ...state, cases: [...pending.filter((p) => p.created_by === user?.id).map((p) => ({ ...mapCase({ ...p, created_at: p.queued_at, files: [], files_purged: false, status: "pending", sms_sent: false }, []), synced: false })), ...state.cases] },
    user, authReady, mfa, online, lang, L, n, dark, demoMode, demoLoginAvailable: localDemoLoginAvailable, epiVisits,
    announcements, selectedUpazilaId, setSelectedUpazilaId, activeUnionId, setActiveUnionId,
    saveAnnouncement: async (upazilaId, noticeBn, noticeEn, active) => {
      if (!user || user.role !== "uno" || user.upazilaId !== upazilaId) {
        toast.error(L("শুধু নিজ উপজেলার ইউএনও বিজ্ঞপ্তি প্রকাশ করতে পারবেন", "Only the assigned Upazila UNO can publish this notice"));
        return false;
      }
      if (noticeBn.length > 500 || noticeEn.length > 500 || (active && !noticeBn.trim() && !noticeEn.trim())) {
        toast.error(L("বিজ্ঞপ্তি ৫০০ অক্ষরের মধ্যে এবং সক্রিয় থাকলে খালি হতে পারবে না", "Notices must be 500 characters or fewer and cannot be empty when active"));
        return false;
      }
      if (demoMode) {
        setAnnouncements((current) => [
          ...current.filter((notice) => notice.upazilaId !== upazilaId),
          { upazilaId, noticeBn: noticeBn.trim(), noticeEn: noticeEn.trim(), active, updatedAt: Date.now() },
        ]);
        return true;
      }
      const { error } = await supabase.from("upazila_announcements").upsert({
        upazila_id: upazilaId,
        notice_bn: noticeBn.trim(),
        notice_en: noticeEn.trim(),
        active,
        updated_by: user.id,
      }, { onConflict: "upazila_id" });
      if (error) {
        toast.error(error.message);
        return false;
      }
      await loadData();
      return true;
    },
    saveUnionVillages: async (villages, targetUnionId = activeUnionId ?? user?.unionId) => {
      if (!user || user.role !== "admin" || !targetUnionId || mfa !== "ok") {
        toast.error(L("শুধু নির্ধারিত ইউপি প্রশাসনিক কর্মকর্তা গ্রাম-ওয়ার্ডের তথ্য পরিবর্তন করতে পারবেন", "Only the assigned UP Administrative Officer can manage village and ward details"));
        return false;
      }
      if (
        villages.length > 500 ||
        villages.some((village) =>
          !village.id.trim() ||
          !village.bn.trim() ||
          !village.en.trim() ||
          !Number.isInteger(village.ward) ||
          village.ward < 1 ||
          village.ward > 99
        ) ||
        new Set(villages.map((village) => village.id)).size !== villages.length
      ) {
        toast.error(L("প্রতিটি গ্রামের বাংলা/ইংরেজি নাম, ১–৯৯ ওয়ার্ড এবং স্বতন্ত্র পরিচয় দিন", "Provide each village's Bangla/English names, a ward from 1 to 99, and a unique ID"));
        return false;
      }
      try {
        window.localStorage.setItem(`${UNION_VILLAGES_PREFIX}${targetUnionId}`, JSON.stringify(villages));
      } catch (cause) {
        console.error("Could not persist union village master setup", cause);
      }
      if (demoMode) {
        setState((current) => ({
          ...current,
          upazilas: current.upazilas.map((area) =>
            area.id !== user.upazilaId
              ? area
              : {
                  ...area,
                  unions: area.unions.map((union) =>
                    union.id === targetUnionId ? { ...union, villages } : union,
                  ),
                },
          ),
        }));
        return true;
      }
      const { error } = await supabase.rpc("save_union_villages", {
        _union_id: targetUnionId,
        _villages: villages.map(({ id, bn, en, ward, poBn, poEn }) => ({
          id,
          bn,
          en,
          ward,
          poBn,
          poEn,
        })),
      });
      if (error) {
        toast.error(error.message);
        return false;
      }
      await loadData();
      return true;
    },
    enterDemoLogin,
    toggleLang: () => setLang((l) => (l === "bn" ? "en" : "bn")),
    toggleTheme: () => setDark((d) => !d),
    refresh: loadData, refreshAuth,
    logout: async () => {
      if (demoMode) {
        setDemoMode(false);
        setUser(null);
        setState(empty);
        setAnnouncements([]);
        setEpiVisits([]);
        setAuthReady(true);
        return;
      }
      await supabase.auth.signOut(); setUser(null); setState(empty); setAnnouncements([]);
    },
    addCase: async (c) => {
      if (!user || (user.role !== "worker" && user.role !== "police")) {
        return L("শুধু স্বাস্থ্যকর্মী বা গ্রাম পুলিশ তথ্য দিতে পারবেন", "Only health workers or village police may enter data");
      }
      if (c.files.length > MAX_CASE_FILES) {
        return L("সর্বোচ্চ ৪টি ছবি সংযুক্ত করা যাবে", "You can attach up to 4 photos");
      }
      if (c.files.some((file) => !file.type.startsWith("image/") || file.size > MAX_IMAGE_BYTES)) {
        return L("প্রতিটি ছবি ৭৫০ KB-এর মধ্যে হতে হবে", "Each image must be 750 KB or smaller");
      }
      const id = crypto.randomUUID();
      const stationId = user.stationId ?? user.unionId;
      if (!stationId || stationId !== user.unionId) {
        return L("আপনার নির্ধারিত স্টেশন সঠিকভাবে সেট করা নেই", "Your assigned station is not configured correctly");
      }
      if (demoMode) {
        if (state.cases.some((existing) => isDuplicateCase(existing, c, user))) {
          return dupMsg(c.type);
        }
        saveDemoAttachmentPreviews(id, c.files);
        const localCase: RegCase = {
          ...c,
          id,
          createdAt: Date.now(),
          synced: false,
          smsSent: false,
          remarks: [],
          status: "pending",
          createdBy: user.id,
          upazilaId: user.upazilaId,
          stationId,
          unionId: user.unionId ?? "",
          ward: user.ward ?? 1,
          files: c.files.map((file, index) => ({
            name: file.name,
            size: file.size,
            ...c.fileMetadata?.[index],
          })),
        };
        const sharedCases = [
          localCase,
          ...readMasterRegCases(state.cases).filter((item) => item.id !== localCase.id),
        ];
        if (!writeMasterRegCases(sharedCases)) {
          return L("স্থানীয় আবেদনটি সংরক্ষণ করা যায়নি", "Could not save the local application");
        }
        setState((current) => ({ ...current, cases: sharedCases }));
        if (localCase.type === "birth" && localCase.parentMobile) {
          setEpiVisits((current) =>
            current.map((visit) =>
              !visit.registration_case_id &&
              visit.parent_mobile === localCase.parentMobile &&
              (visit.child_name_bn === localCase.name.bn || visit.child_name_en.toLocaleLowerCase() === localCase.name.en.toLocaleLowerCase())
                ? { ...visit, registration_case_id: id }
                : visit,
            ),
          );
        }
        return null;
      }
      const row: any = {
        id, client_id: id, type: c.type, name_bn: c.name.bn, name_en: c.name.en, father_bn: c.father.bn, father_en: c.father.en,
        mother_bn: c.mother.bn, mother_en: c.mother.en, nid: c.nid.trim() || null, gender: c.gender, dob: c.dob, child_order: c.order ?? null,
        parent_mobile: c.parentMobile ?? null, dod: c.dod ?? null, cause_bn: c.cause?.bn ?? null, cause_en: c.cause?.en ?? null, village_id: c.villageId, details: c.details ?? {},
        created_by: user.id, upazila_id: user.upazilaId, station_id: stationId, union_id: user.unionId, ward: user.ward ?? 1,
      };
      if (state.cases.some((existing) => isDuplicateCase(existing, c, user))) return dupMsg(c.type);
      if (!navigator.onLine) {
        if (c.files.length) return L("অফলাইনে ফাইল যুক্ত করা যায় না — ফাইল ছাড়া জমা দিন বা অনলাইনে আসুন", "Files can't be attached offline — submit without files or reconnect");
        setPending((p) => [...p, { ...row, queued_at: new Date().toISOString() }]);
        return null;
      }
      const files: Array<{
        name: string;
        size: number;
        path: string;
        fieldVisit?: RegCase["files"][number]["fieldVisit"];
      }> = [];
      for (const [index, f] of c.files.slice(0, MAX_CASE_FILES).entries()) {
        const safe = f.name.replace(/[^\w.-]+/g, "_").slice(-80);
        const path = `${user.upazilaId}/${user.unionId}/${id}/${Date.now()}-${crypto.randomUUID()}-${safe}`;
        const { error } = await supabase.storage.from("case-files").upload(path, f, { contentType: f.type });
        if (error) return L("ফাইল আপলোড ব্যর্থ", "File upload failed") + `: ${error.message}`;
        files.push({ name: f.name, size: f.size, path, ...c.fileMetadata?.[index] });
      }
      const { error } = await supabase.from("cases").insert({ ...row, files });
      if (error) return error.code === "23505" ? dupMsg(c.type) : error.message;
      await loadData();
      return null;
    },
    updateCase: async (id, correction) => {
      if (!user || (user.role !== "worker" && user.role !== "police")) {
        toast.error(
          L(
            "শুধু স্বাস্থ্যকর্মী বা গ্রাম পুলিশ তথ্য সংশোধন করতে পারবেন",
            "Only health workers or village police can correct entries",
          ),
        );
        return false;
      }
      if ((correction.files?.length ?? 0) > MAX_CASE_FILES) {
        toast.error(L("সর্বোচ্চ ৪টি ছবি সংযুক্ত করা যাবে", "You can attach up to 4 photos"));
        return false;
      }
      if (correction.files?.some((file) => !file.type.startsWith("image/") || file.size > MAX_IMAGE_BYTES)) {
        toast.error(L("প্রতিটি ছবি ৭৫০ KB-এর মধ্যে হতে হবে", "Each image must be 750 KB or smaller"));
        return false;
      }
      const existing = state.cases.find((item) => item.id === id);
      const canCorrect = !!existing && (
        user.role === "worker"
          ? existing.createdBy === user.id
          : existing.upazilaId === user.upazilaId &&
            existing.unionId === user.unionId &&
            existing.ward === user.ward
      );
      if (!existing || !canCorrect || existing.status === "completed" || existing.status === "rejected") {
        toast.error(L("এই এন্ট্রি আর সংশোধন করা যাবে না", "This entry can no longer be corrected"));
        return false;
      }

      const correctedDetails: CaseDetails = {
        ...correction.details,
        correctedAt: new Date().toISOString(),
      };
      const correctedCase = { ...correction, details: correctedDetails };

      if (demoMode) {
        if (state.cases.some((item) => item.id !== id && item.type === correctedCase.type && item.nid === correctedCase.nid && (correctedCase.type === "death" || item.order === correctedCase.order))) {
          toast.error(dupMsg(correction.type));
          return false;
        }
        const updatedCase: RegCase = {
          ...existing,
          ...correctedCase,
          files: correction.files
            ? correction.files.map((file, index) => ({
                name: file.name,
                size: file.size,
                ...correction.fileMetadata?.[index],
              }))
            : existing.files,
          synced: false,
        };
        if (correction.files) saveDemoAttachmentPreviews(id, correction.files);
        setState((current) => ({
          ...current,
          cases: current.cases.map((item) => item.id === id ? updatedCase : item),
        }));
        if (updatedCase.type === "birth" && updatedCase.parentMobile) {
          setEpiVisits((current) =>
            current.map((visit) =>
              !visit.registration_case_id &&
              visit.parent_mobile === updatedCase.parentMobile &&
              (visit.child_name_bn === updatedCase.name.bn || visit.child_name_en.toLocaleLowerCase() === updatedCase.name.en.toLocaleLowerCase())
                ? { ...visit, registration_case_id: id }
                : visit,
            ),
          );
        }
        return true;
      }

      const uploads: Array<{
        name: string;
        size: number;
        path: string;
        fieldVisit?: RegCase["files"][number]["fieldVisit"];
      }> = [];
      for (const [index, file] of (correction.files ?? []).slice(0, MAX_CASE_FILES).entries()) {
        const safe = file.name.replace(/[^\w.-]+/g, "_").slice(-80);
        const path = `${user.upazilaId}/${user.unionId}/${id}/${Date.now()}-${crypto.randomUUID()}-${safe}`;
        const { error } = await supabase.storage.from("case-files").upload(path, file, { contentType: file.type });
        if (error) {
          if (uploads.length) await supabase.storage.from("case-files").remove(uploads.map((item) => item.path));
          toast.error(L("ফাইল আপলোড ব্যর্থ", "File upload failed") + `: ${error.message}`);
          return false;
        }
        uploads.push({ name: file.name, size: file.size, path, ...correction.fileMetadata?.[index] });
      }

      const update: Database["public"]["Tables"]["cases"]["Update"] = {
        type: correctedCase.type,
        name_bn: correctedCase.name.bn,
        name_en: correctedCase.name.en,
        father_bn: correctedCase.father.bn,
        father_en: correctedCase.father.en,
        mother_bn: correctedCase.mother.bn,
        mother_en: correctedCase.mother.en,
        nid: correctedCase.nid,
        parent_mobile: correctedCase.parentMobile ?? null,
        gender: correctedCase.gender,
        dob: correctedCase.dob,
        child_order: correctedCase.order ?? null,
        dod: correctedCase.dod ?? null,
        cause_bn: correctedCase.cause?.bn ?? null,
        cause_en: correctedCase.cause?.en ?? null,
        village_id: correctedCase.villageId,
        details: JSON.parse(JSON.stringify(correctedDetails)) as Json,
      };
      if (correction.files) update.files = uploads;
      const { data, error } = await supabase.from("cases").update(update).eq("id", id).select("id").maybeSingle();
      if (error || !data) {
        if (uploads.length) await supabase.storage.from("case-files").remove(uploads.map((item) => item.path));
        toast.error(error?.message ?? L("এন্ট্রি সংশোধন করা যায়নি", "Could not update this entry"));
        return false;
      }
      if (correction.files) {
        const oldPaths = existing.files.flatMap((item) => item.path ? [item.path] : []);
        if (oldPaths.length) {
          const { error: removeError } = await supabase.storage.from("case-files").remove(oldPaths);
          if (removeError) toast.error(L("পুরোনো সংযুক্তি মুছে ফেলা যায়নি", "Could not remove previous attachments") + `: ${removeError.message}`);
        }
      }
      await loadData();
      return true;
    },
    addEpiVisit: async (visit) => {
      if (!user || user.role !== "worker") {
        return L("শুধু স্বাস্থ্যকর্মী EPI উপস্থিতি দিতে পারবেন", "Only health workers can record EPI attendance");
      }
      const upazila = state.upazilas.find((area) => area.id === user.upazilaId);
      const union = upazila?.unions.find((area) => area.id === user.unionId);
      if (!upazila || !union?.villages.some((village) => village.id === visit.village_id)) {
        return L("নির্বাচিত গ্রাম নির্ধারিত এলাকার মধ্যে নেই", "Selected village is outside the assigned area");
      }
      if (demoMode) {
        const timestamp = new Date().toISOString();
        setEpiVisits((current) => [
          {
            ...visit,
            id: crypto.randomUUID(),
            upazila_id: upazila.id,
            union_id: union.id,
            ward: user.ward ?? 1,
            attended_at: timestamp,
            registration_case_id: null,
            created_by: user.id,
            created_at: timestamp,
          },
          ...current,
        ]);
        return null;
      }
      const { error } = await supabase.from("epi_visits").insert({
        ...visit,
        upazila_id: upazila.id,
        union_id: union.id,
        ward: user.ward ?? 1,
        created_by: user.id,
      });
      return error?.message ?? null;
    },
    patchCase: async (id, patch) => {
      if (demoMode) {
        if (!state.cases.some((item) => item.id === id)) return false;
        setState((current) => ({
          ...current,
          cases: current.cases.map((item) => item.id === id ? {
            ...item,
            ...patch,
            completedAt: patch.status === undefined ? item.completedAt : patch.status === "completed" ? Date.now() : undefined,
          } : item),
        }));
        return true;
      }
      const upd: any = {};
      if (patch.status) upd.status = patch.status;
      if (patch.regNo !== undefined) upd.reg_no = patch.regNo;
      if (patch.police !== undefined) upd.police_task = patch.police;
      const { data, error } = await supabase.from("cases").update(upd).eq("id", id).select("id").maybeSingle();
      if (error) { toast.error(error.message); return false; }
      if (!data) {
        toast.error(L("আবেদনের অবস্থা হালনাগাদ করা যায়নি", "Could not update the application status"));
        return false;
      }
      await loadData(); return true;
    },
    addRemark: async (id, text) => {
      if (!user) return;
      if (demoMode) {
        setState((current) => ({
          ...current,
          cases: current.cases.map((item) => item.id === id ? {
            ...item,
            remarks: [...item.remarks, { by: user.name.bn, role: user.role, text, at: Date.now() }],
          } : item),
        }));
        return;
      }
      const { error } = await supabase.from("case_remarks").insert({ case_id: id, role: user.role, text, author: user.id });
      if (error) toast.error(error.message); else await loadData();
    },
    addUpazila: async (u) => {
      if (demoMode) {
        if (state.upazilas.some((area) => area.id === u.id)) return false;
        setState((current) => ({ ...current, upazilas: [...current.upazilas, u] }));
        return true;
      }
      const { error } = await supabase.from("upazilas").insert({ id: u.id, bn: u.bn, en: u.en, district_bn: u.districtBn, district_en: u.districtEn,
        division_bn: u.divisionBn, division_en: u.divisionEn, unions: u.unions as any });
      if (error) { toast.error(error.message); return false; }
      await loadData(); return true;
    },
    findVillage,
  };
  return <C.Provider value={value}>{children}</C.Provider>;
}

export function useApp() {
  const c = useContext(C); if (!c) throw new Error("StoreProvider missing"); return c;
}

/** Client-side mirror of the database's row-level isolation rules. */
export function casesForStation(cases: RegCase[], upazilaId: string, stationId: string) {
  return cases.filter(
    (item) =>
      item.upazilaId === upazilaId &&
      (item.stationId ?? item.unionId) === stationId &&
      item.unionId === stationId,
  );
}

export function scopedCases(state: AppState, u: User | null) {
  if (!u) return [];
  if (u.role === "super") return state.cases;
  return state.cases.filter((c) => {
    if (c.upazilaId !== u.upazilaId) return false;
    if (u.role === "uno") return true;
    const assignedStationId = u.stationId ?? u.unionId;
    const caseStationId = c.stationId ?? c.unionId;
    if (!assignedStationId || caseStationId !== assignedStationId || c.unionId !== u.unionId) return false;
    if (u.role === "admin") return true;
    if (u.role === "police") {
      return c.ward === u.ward && (
        c.createdBy === u.id ||
        c.police?.assignedPoliceId === u.id ||
        (!!c.police && !c.police.assignedPoliceId)
      );
    }
    return c.createdBy === u.id;
  });
}

export const roleLabel = (r: string, L: (b: string, e: string) => string) => ({
  worker: L("ইপিআই / স্বাস্থ্যকর্মী", "EPI / Health Worker"),
  admin: L("প্রশাসনিক কর্মকর্তা", "Administrative Officer"),
  police: L("গ্রাম পুলিশ", "Village Police"),
  uno: L("ইউএনও", "UNO"),
  super: L("সুপার অ্যাডমিন", "Super Admin"),
}[r] ?? r);
