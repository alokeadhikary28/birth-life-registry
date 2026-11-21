import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import {
  Award,
  BookOpen,
  Building2,
  Camera,
  ChartNoAxesCombined,
  ChevronDown,
  FileText,
  Headphones,
  HeartPulse,
  Home,
  LayoutDashboard,
  Languages,
  LogIn,
  LogOut,
  LoaderCircle,
  MessageSquareWarning,
  Moon,
  MapPinned,
  ShieldCheck,
  Sun,
  Landmark,
  UserRound,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PasswordLoginForm } from "@/components/PasswordLoginForm";
import Register from "@/components/Register";
import { roleLabel, useApp } from "@/lib/store";
import { compressImage } from "@/lib/compress-image";
import { getStationsForUpazila, MONIRAMPUR_STATIONS } from "@/lib/monirampur-stations";
import {
  EXECUTIVE_POSITIONS,
  EXECUTIVE_PREVIEW_ROLES,
  EXECUTIVE_ROLE_BY_POSITION,
  isPreviewRole,
  type ExecutivePreviewRole,
  type PreviewRole,
} from "@/lib/dashboard-roles";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { sendPhoneOtp, verifyPhoneOtp } from "@/lib/auth.functions";

const isOwnProfileAvatarPath = (path: unknown, userId: string): path is string =>
  typeof path === "string" &&
  path.startsWith(`${userId}/`) &&
  path.split("/").length === 2 &&
  !path.includes("..");

type AvatarUploadStage =
  | "auth_session"
  | "compression"
  | "storage_upload"
  | "signed_url"
  | "metadata_update";

function getErrorField(cause: unknown, key: string): string | undefined {
  if (typeof cause !== "object" || cause === null || !(key in cause)) return undefined;
  const value = Reflect.get(cause, key);
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

function getAvatarUploadFailure(cause: unknown, stage: AvatarUploadStage, L: (bn: string, en: string) => string) {
  const code = getErrorField(cause, "code");
  const status = getErrorField(cause, "statusCode") ?? getErrorField(cause, "status");
  const message =
    cause instanceof Error
      ? cause.message
      : getErrorField(cause, "message") ??
        (typeof cause === "string" ? cause : L("অজানা ত্রুটি", "Unknown error"));
  const normalized = `${code ?? ""} ${status ?? ""} ${message}`.toLowerCase();
  let help = L(
    "Supabase Storage bucket, RLS policy এবং MFA সেশন যাচাই করুন।",
    "Check the Supabase Storage bucket, RLS policy, and MFA session.",
  );

  if (stage === "compression") {
    help = L(
      "ছবিটি প্রস্তুত করা যায়নি। JPG, PNG বা WebP ছবি ২০ MB-এর মধ্যে দিন।",
      "The image could not be prepared. Choose a JPG, PNG, or WebP image under 20 MB.",
    );
  } else if (
    normalized.includes("bucket not found") ||
    normalized.includes("bucket does not exist") ||
    (status === "404" && stage === "storage_upload")
  ) {
    help = L(
      "profile-avatars bucket পাওয়া যায়নি। Supabase-এ 0041_profile_avatars migration প্রয়োগ হয়েছে কি না যাচাই করুন।",
      "The profile-avatars bucket is missing. Check that migration 0041_profile_avatars has been applied.",
    );
  } else if (
    status === "401" ||
    normalized.includes("jwt expired") ||
    normalized.includes("session expired")
  ) {
    help = L(
      "লগইন session মেয়াদোত্তীর্ণ। আবার লগইন করে privileged account হলে aal2 MFA সম্পন্ন করুন।",
      "The login session expired. Sign in again and complete aal2 MFA for privileged accounts.",
    );
  } else if (
    normalized.includes("row-level security") ||
    normalized.includes("row violates") ||
    normalized.includes("permission denied") ||
    code === "42501" ||
    status === "403"
  ) {
    help = L(
      "নিজের profile-avatars path-এর Storage policy এবং privileged account-এর aal2 MFA session যাচাই করুন।",
      "Check the own-folder Storage policy and the privileged account's aal2 MFA session.",
    );
  } else if (
    normalized.includes("file size") ||
    normalized.includes("too large") ||
    normalized.includes("payload too large") ||
    status === "413"
  ) {
    help = L(
      "ছবির আকার কমানো যায়নি বা Storage সীমা ছাড়িয়েছে। অন্য/ছোট ছবি চেষ্টা করুন।",
      "The image could not be compressed enough or exceeded the Storage limit. Try a smaller image.",
    );
  } else if (
    normalized.includes("mime") ||
    normalized.includes("content-type") ||
    normalized.includes("not allowed")
  ) {
    help = L(
      "Storage শুধু JPG, PNG বা WebP ছবি গ্রহণ করে।",
      "Storage accepts JPG, PNG, or WebP images only.",
    );
  } else if (stage === "signed_url") {
    help = L(
      "ছবির preview URL তৈরি হয়নি। profile-avatars-এর SELECT RLS policy যাচাই করুন।",
      "The preview URL could not be created. Check the profile-avatars SELECT RLS policy.",
    );
  } else if (stage === "auth_session" || stage === "metadata_update") {
    help = L(
      "Supabase login session এবং Auth user metadata update যাচাই করুন।",
      "Check the Supabase login session and Auth user-metadata update.",
    );
  }

  const details = [code ? `code ${code}` : "", status ? `HTTP ${status}` : "", message]
    .filter(Boolean)
    .join(" · ")
    .slice(0, 200);
  return details ? `${help} (${details})` : help;
}

export function Header() {
  const {
    user,
    L,
    mfa,
    authReady,
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
  const profileRoleTitle =
    user?.role === "district"
      ? L("জেলা পর্যায়ের কর্মকর্তা", "District-level official")
      : user
        ? roleLabel(user.role, L)
        : "";
  const matchingExecutivePosition =
    user &&
    user.role !== "uno" &&
    isExecutiveRole(activeRole) &&
    EXECUTIVE_ROLE_BY_POSITION[activeRole] === user.role
      ? EXECUTIVE_POSITIONS.find((position) => position.role === activeRole)
      : undefined;
  const activeProfilePositionTitle =
    user?.role === "district" && activeRole === "ddlg_dc"
      ? L("ডিডিএলজি / জেলা প্রশাসক", "DDLG / District Commissioner")
      : user?.role === "admin" && activeRole === "up_official"
        ? L("ইউপি প্রশাসনিক কর্মকর্তা", "UP Administrative Officer")
        : user?.role === "admin" && activeRole === "up_secretary"
          ? L("ইউপি সচিব", "Union Parishad Secretary")
          : matchingExecutivePosition
            ? L(matchingExecutivePosition.bn, matchingExecutivePosition.en)
            : null;
  const canSwitchUnion = user?.role === "admin" && demoMode;
  const stationUpazila = state.upazilas.find((item) => item.id === "manirampur") ?? state.upazilas.find((item) => item.id === user?.upazilaId);
  const stationOptions = stationUpazila ? getStationsForUpazila(stationUpazila.id, stationUpazila.unions) : [];
  const [avatar, setAvatar] = useState<{ userId: string; url: string } | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<{ userId: string; url: string } | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarUrl =
    avatarPreview && avatarPreview.userId === user?.id
      ? avatarPreview.url
      : avatar && avatar.userId === user?.id
        ? avatar.url
        : null;
  const userId = user?.id;

  useEffect(() => {
    if (!avatarPreview) return;
    return () => URL.revokeObjectURL(avatarPreview.url);
  }, [avatarPreview]);

  useEffect(() => {
    let active = true;
    if (!authReady || !userId || demoMode || mfa !== "ok") return;

    const loadAvatar = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        const authUser = data.session?.user;
        const path = authUser?.user_metadata["avatar_path"];
        if (
          !active ||
          authUser?.id !== userId ||
          !isOwnProfileAvatarPath(path, userId)
        ) {
          return;
        }

        const { data: signedUrl, error: signedUrlError } = await supabase.storage
          .from("profile-avatars")
          .createSignedUrl(path, 60 * 60 * 24 * 7);
        if (signedUrlError) throw signedUrlError;
        if (active) setAvatar({ userId, url: signedUrl.signedUrl });
      } catch (cause) {
        console.error("Failed to load profile avatar", cause);
        if (active) {
          toast.error(L("প্রোফাইল ছবি লোড করা যায়নি", "Could not load profile photo"));
        }
      }
    };

    void loadAvatar();
    return () => {
      active = false;
    };
  }, [L, authReady, demoMode, mfa, userId]);

  const handleAvatarFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file || !user) return;

    const fileExtensions: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
    };
    const extension = fileExtensions[file.type];
    if (!extension) {
      toast.error(L("শুধু JPG, PNG বা WebP ছবি ব্যবহার করুন", "Choose a JPG, PNG, or WebP image"));
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error(L("ছবির আকার সর্বোচ্চ ২০ MB হতে পারে", "The source image must be 20 MB or smaller"));
      return;
    }
    if (demoMode || !authReady || mfa !== "ok") {
      toast.error(
        demoMode
          ? L("লোকাল ডেমো অ্যাকাউন্টে ছবি সংরক্ষণ করা যায় না", "Photo uploads are unavailable in demo mode")
          : L("নিরাপত্তা যাচাই সম্পন্ন করে আবার চেষ্টা করুন", "Complete security verification and try again"),
      );
      return;
    }

    setAvatarUploading(true);
    const avatarStorage = supabase.storage.from("profile-avatars");
    let uploadedPath: string | null = null;
    let previousPath: unknown;
    let stage: AvatarUploadStage = "compression";
    try {
      const previewUrl = URL.createObjectURL(file);
      setAvatarPreview({ userId: user.id, url: previewUrl });

      let compressedFile: File;
      try {
        compressedFile = await compressImage(file);
      } catch (compressionCause) {
        if (file.size > 2 * 1024 * 1024) throw compressionCause;
        console.warn("Profile photo compression failed; trying the original within the bucket limit", compressionCause);
        compressedFile = file;
      }
      const compressedExtension = fileExtensions[compressedFile.type];
      if (!compressedExtension) {
        throw new Error("Compressed profile photo has an unsupported file type");
      }

      stage = "auth_session";
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const authUser = sessionData.session?.user;
      if (!authUser || authUser.id !== user.id) {
        throw new Error("The authenticated account changed before the photo upload");
      }

      const path = `${user.id}/${crypto.randomUUID()}.${compressedExtension}`;
      stage = "storage_upload";
      const { data: uploadedObject, error: uploadError } = await avatarStorage.upload(
        path,
        compressedFile,
        {
        cacheControl: "3600",
        contentType: compressedFile.type,
        },
      );
      if (uploadError) throw uploadError;
      if (uploadedObject?.path !== path) {
        throw new Error("Supabase did not confirm the uploaded profile photo path");
      }
      uploadedPath = path;

      stage = "signed_url";
      const { data: signedUrl, error: signedUrlError } = await avatarStorage.createSignedUrl(
        path,
        60 * 60 * 24 * 7,
      );
      if (signedUrlError) throw signedUrlError;
      if (!signedUrl?.signedUrl) {
        throw new Error("Supabase did not return a signed profile photo URL");
      }

      stage = "auth_session";
      const { data: currentSessionData, error: currentSessionError } =
        await supabase.auth.getSession();
      if (currentSessionError) throw currentSessionError;
      const currentAuthUser = currentSessionData.session?.user;
      if (!currentAuthUser || currentAuthUser.id !== user.id) {
        throw new Error("The authenticated account changed before saving the photo");
      }
      previousPath = currentAuthUser.user_metadata["avatar_path"];
      stage = "metadata_update";
      const { data: updatedAuthUser, error: updateError } = await supabase.auth.updateUser({
        data: { ...currentAuthUser.user_metadata, avatar_path: path },
      });
      if (updateError) throw updateError;
      if (
        updatedAuthUser.user?.id !== user.id ||
        updatedAuthUser.user.user_metadata["avatar_path"] !== path
      ) {
        throw new Error("Supabase did not confirm the profile photo metadata update");
      }

      uploadedPath = null;
      setAvatar({ userId: user.id, url: signedUrl.signedUrl });
      setAvatarPreview(null);
      toast.success(L("প্রোফাইল ছবি আপডেট হয়েছে", "Profile photo updated"), {
        description:
          compressedFile.size < file.size
            ? L("ছবিটি ছোট করে সংরক্ষণ করা হয়েছে", "The photo was compressed before saving")
            : undefined,
      });

      if (isOwnProfileAvatarPath(previousPath, user.id) && previousPath !== path) {
        try {
          const { error: removeError } = await avatarStorage.remove([previousPath]);
          if (removeError) console.error("Failed to remove previous profile avatar", removeError);
        } catch (cause) {
          console.error("Failed to remove previous profile avatar", cause);
        }
      }
    } catch (cause) {
      if (uploadedPath) {
        try {
          const { error: cleanupError } = await avatarStorage.remove([uploadedPath]);
          if (cleanupError) {
            console.error("Failed to clean up incomplete profile avatar", cleanupError);
          }
        } catch (cleanupCause) {
          console.error("Failed to clean up incomplete profile avatar", cleanupCause);
        }
      }
      setAvatarPreview(null);
      console.error(
        "Failed to upload profile avatar",
        {
          stage,
          code: getErrorField(cause, "code"),
          status: getErrorField(cause, "statusCode") ?? getErrorField(cause, "status"),
          message: cause instanceof Error ? cause.message : getErrorField(cause, "message"),
        },
        cause,
      );
      toast.error(L("প্রোফাইল ছবি আপলোড করা যায়নি", "Could not upload profile photo"), {
        description: getAvatarUploadFailure(cause, stage, L),
        duration: 10_000,
      });
    } finally {
      setAvatarUploading(false);
    }
  };

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
    { role: "municipal_executive_officer", bn: "পৌর নির্বাহী কর্মকর্তা", en: "Municipal Executive Officer", Icon: Landmark },
    { role: "uno", bn: "ইউএনও (UNO)", en: "Upazila Nirbahi Officer (UNO)", Icon: Building2 },
    { role: "ddlg", bn: "ডিডিএলজি (DDLG)", en: "Deputy Director, Local Government (DDLG)", Icon: MapPinned },
    { role: "dc", bn: "ডিসি (DC)", en: "District Commissioner (DC)", Icon: MapPinned },
    { role: "addl_registrar_general", bn: "অতিরিক্ত রেজিস্টার জেনারেল", en: "Additional Registrar General", Icon: Award },
    { role: "city_corporation_ceo", bn: "সিটি কর্পোরেশনের প্রধান নির্বাহী কর্মকর্তা", en: "CEO of City Corporation", Icon: Building2 },
    { role: "divisional_commissioner", bn: "বিভাগীয় কমিশনার", en: "Divisional Commissioner", Icon: ChartNoAxesCombined },
    { role: "registrar_general", bn: "রেজিস্টার জেনারেল", en: "Registrar General", Icon: ShieldCheck },
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
                  {L("উচ্চ পর্যায়ের নির্বাহী প্যানেল", "Higher-Level Executive Panel")}
                  <ChevronDown
                    aria-hidden="true"
                    className={`h-4 w-4 transition-transform duration-200 ${isExecutiveMenuOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {isExecutiveMenuOpen && (
                  <div
                    id="executive-panel-menu"
                    role="menu"
                    aria-label={L("উচ্চ পর্যায়ের নির্বাহী প্যানেল", "Higher-Level Executive Panel")}
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
            value={activeUnionId ?? (stationOptions.some((station) => station.id === "mn-dhakuria") ? "mn-dhakuria" : stationOptions[0]!.id)}
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
          <>
            <input
              id="profile-avatar-file"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(event) => void handleAvatarFileChange(event)}
              tabIndex={-1}
              aria-label={L("প্রোফাইল ছবি নির্বাচন করুন", "Choose a profile photo")}
            />
            <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-11 max-w-40 shrink-0 gap-2 border-white/50 bg-emerald-800/60 px-2 text-base font-semibold text-white hover:bg-emerald-900 hover:text-white sm:px-3"
              >
                <Avatar className="h-8 w-8 border border-white/50">
                  <AvatarImage src={avatarUrl ?? undefined} alt="" />
                  <AvatarFallback className="bg-emerald-950 text-white">
                    <UserRound className="h-4 w-4" aria-hidden="true" />
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 truncate">{L(user.name.bn, user.name.en)}</span>
                <ChevronDown className="h-4 w-4 shrink-0 opacity-80" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              sideOffset={10}
              className="w-72 rounded-2xl border-emerald-100 bg-white p-2 text-base shadow-xl"
            >
              <div className="flex items-center gap-3 rounded-xl bg-emerald-50 p-3">
                <Avatar className="h-14 w-14 border-2 border-white shadow-sm">
                  <AvatarImage src={avatarUrl ?? undefined} alt="" />
                  <AvatarFallback className="bg-emerald-800 text-white">
                    <UserRound className="h-7 w-7" aria-hidden="true" />
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="truncate text-base font-bold text-emerald-950">
                    {L(user.name.bn, user.name.en)}
                  </div>
                  <div className="mt-1 text-base font-medium text-emerald-800">
                    {profileRoleTitle}
                  </div>
                  {activeProfilePositionTitle &&
                    activeProfilePositionTitle !== profileRoleTitle && (
                      <div className="mt-1 text-base text-emerald-700">
                        {activeProfilePositionTitle}
                      </div>
                    )}
                </div>
              </div>
              <DropdownMenuItem
                asChild
                disabled={avatarUploading || demoMode || !authReady || mfa !== "ok"}
                onSelect={(event) => {
                  event.preventDefault();
                }}
                className="mt-2 min-h-11 rounded-xl px-3 text-base font-semibold text-emerald-900 hover:bg-emerald-50 hover:text-emerald-950 focus:bg-emerald-50 focus:text-emerald-950"
              >
                <label
                  htmlFor="profile-avatar-file"
                  className="flex min-h-11 w-full cursor-pointer items-center gap-2"
                >
                  {avatarUploading ? (
                    <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Camera className="h-5 w-5" aria-hidden="true" />
                  )}
                  {avatarUploading
                    ? L("ছবি আপলোড হচ্ছে…", "Uploading photo…")
                    : L("ছবি পরিবর্তন / আপলোড করুন", "Change / upload photo")}
                </label>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="my-2" />
              <DropdownMenuItem
                onSelect={() => void nav({ to: "/dashboard" })}
                className="min-h-11 rounded-xl px-3 text-base hover:bg-emerald-50 hover:text-emerald-950 focus:bg-emerald-50 focus:text-emerald-950"
              >
                <LayoutDashboard className="h-5 w-5 text-emerald-700" aria-hidden="true" />
                {L("ড্যাশবোর্ড", "Dashboard")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => void nav({ to: "/security" })}
                className="min-h-11 rounded-xl px-3 text-base hover:bg-emerald-50 hover:text-emerald-950 focus:bg-emerald-50 focus:text-emerald-950"
              >
                <ShieldCheck className="h-5 w-5 text-emerald-700" aria-hidden="true" />
                {L("নিরাপত্তা ও সেশন", "Security & sessions")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={async () => {
                  await logout();
                  await nav({ to: "/", replace: true });
                }}
                className="min-h-11 rounded-xl px-3 text-base text-red-700 hover:bg-red-50 hover:text-red-800 focus:bg-red-50 focus:text-red-800"
              >
                <LogOut className="h-5 w-5" aria-hidden="true" />
                {L("লগআউট", "Logout")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          </>
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
  if (!demoLoginAvailable || user?.role === "super") return null;

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
  const { L, n, demoLoginAvailable, enterDemoLogin, refreshAuth } = useApp();
  const nav = useNavigate();
  const sendOtp = useServerFn(sendPhoneOtp);
  const verifyOtp = useServerFn(verifyPhoneOtp);
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [sent, setSent] = useState(false);
  const [loginMessage, setLoginMessage] = useState<
    "pending" | "suspended" | "cancelled" | null
  >(null);
  const [busy, setBusy] = useState(false);

  const fail = (r: { error?: string; lockedMinutes?: number }) => {
    if (r.error === "pending") {
      setLoginMessage("pending");
    } else if (r.error === "suspended") {
      setLoginMessage("suspended");
    } else if (r.error === "cancelled" || r.error === "rejected") {
      setLoginMessage("cancelled");
    } else if (r.error === "locked" || r.error === "too_many") {
      toast.error(
        L(
          `অনেকবার চেষ্টা করা হয়েছে। ${n(r.lockedMinutes ?? 15)} মিনিট পর আবার চেষ্টা করুন`,
          `Too many attempts. Try again in ${r.lockedMinutes ?? 15} minutes`,
        ),
      );
    } else if (r.error === "bad_phone") {
      toast.error(
        L("সঠিক মোবাইল নম্বর দিন (01XXXXXXXXX)", "Enter a valid mobile number (01XXXXXXXXX)"),
      );
    } else if (r.error === "sms_failed") {
      toast.error(L("SMS পাঠানো যায়নি, পরে চেষ্টা করুন", "Could not send SMS, try later"));
    } else if (r.error === "configuration") {
      toast.error(
        L(
          "লগইন সেবা কনফিগার করা নেই। প্রশাসকের সঙ্গে যোগাযোগ করুন",
          "The sign-in service is not configured. Contact an administrator.",
        ),
      );
    } else {
      toast.error(
        r.error === "unavailable"
          ? L(
              "সেবা সাময়িকভাবে অনুপলব্ধ, পরে চেষ্টা করুন",
              "The service is temporarily unavailable; try again later",
            )
          : L("তথ্য সঠিক নয়", "Details are incorrect"),
      );
    }
  };
  const done = async (tokens: { access_token: string; refresh_token: string }) => {
    const { error } = await supabase.auth.setSession(tokens);
    if (error) {
      console.error("Could not establish Supabase session", { message: error.message });
      toast.error(
        L(
          "লগইন সেশন তৈরি করা যায়নি। আবার চেষ্টা করুন",
          "Could not establish the sign-in session. Please try again.",
        ),
      );
      return;
    }
    await refreshAuth();
    onClose();
    setSent(false);
    setOtp("");
    nav({ to: "/dashboard" });
  };
  const enterLocalRolePreview = (role: "worker" | "police" | "admin" | "uno") => {
    enterDemoLogin(role);
    toast.info(
      L(
        "ডেমো ড্যাশবোর্ড · পরিবর্তন শুধু এই ট্যাবে থাকবে",
        "Demo dashboard · changes stay in this tab",
      ),
    );
    onClose();
    nav({ to: "/dashboard" });
  };
  const run = async (f: () => Promise<void>) => {
    setBusy(true);
    try {
      await f();
    } catch (cause) {
      console.error(
        "Authentication operation failed",
        cause instanceof Error ? cause.message : "Unknown error",
      );
      toast.error(
        L(
          "সেবা সাময়িকভাবে অনুপলব্ধ, পরে চেষ্টা করুন",
          "The service is temporarily unavailable; try again later",
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90svh] w-[calc(100%-2rem)] max-w-4xl overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {L("লগইন বা নিবন্ধনের অনুরোধ", "Login or request registration")}
          </DialogTitle>
          <DialogDescription>
            {L(
              "বিদ্যমান অ্যাকাউন্টে লগইন করুন অথবা কর্মী হিসেবে নিবন্ধনের অনুরোধ পাঠান",
              "Sign in to an existing account or request staff registration",
            )}
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="login">
          <TabsList className="grid h-auto w-full grid-cols-2 rounded-xl border border-emerald-100 bg-emerald-50 p-1.5">
            <TabsTrigger
              className="h-12 text-lg font-bold text-emerald-900 data-[state=active]:bg-white data-[state=active]:text-emerald-800 data-[state=active]:shadow-md"
              value="login"
            >
              {L("লগইন", "Login")}
            </TabsTrigger>
            <TabsTrigger
              className="h-12 text-lg font-bold text-emerald-900 data-[state=active]:bg-white data-[state=active]:text-emerald-800 data-[state=active]:shadow-md"
              value="register"
            >
              {L("নিবন্ধন", "Register")}
            </TabsTrigger>
          </TabsList>
          {loginMessage && (
            <div
              className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"
              role="status"
              aria-live="polite"
            >
              {loginMessage === "pending"
                ? L(
                    "আপনার আবেদন অনুমোদনের অপেক্ষায় আছে। অনুমোদন না হওয়া পর্যন্ত প্যানেলে প্রবেশ করা যাবে না।",
                    "Your application is awaiting approval. Panel access is unavailable until it is approved.",
                  )
                : loginMessage === "suspended"
                  ? L("আপনার অ্যাকাউন্ট সাময়িকভাবে স্থগিত।", "Your account is currently suspended.")
                  : L("আপনার অ্যাকাউন্ট বাতিল করা হয়েছে।", "Your account has been cancelled.")}
            </div>
          )}
          <TabsContent value="login" className="pt-2">
            <Tabs defaultValue="otp">
              <TabsList className="grid w-full grid-cols-2 rounded-lg border border-emerald-100 bg-emerald-50 p-1">
                <TabsTrigger
                  className="text-base font-semibold text-emerald-900 data-[state=active]:bg-white data-[state=active]:text-emerald-800 data-[state=active]:shadow-sm"
                  value="otp"
                >
                  {L("মোবাইল ও OTP", "Mobile & OTP")}
                </TabsTrigger>
                <TabsTrigger
                  className="text-base font-semibold text-emerald-900 data-[state=active]:bg-white data-[state=active]:text-emerald-800 data-[state=active]:shadow-sm"
                  value="pw"
                >
                  {L("পাসওয়ার্ড", "Password")}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="otp" className="space-y-3 pt-2">
            <p className="text-xs text-muted-foreground">{L("স্বাস্থ্যকর্মী ও গ্রাম পুলিশের জন্য", "For Health Workers & Village Police")}</p>
            {demoLoginAvailable && (
              <p className="text-xs text-amber-800">
                {L("লোকাল প্রিভিউতে OTP পাঠানো বন্ধ। নিচে একটি ভূমিকা বেছে নিন।", "OTP is unavailable in local preview. Choose a role below.")}
              </p>
            )}
            <Label>{L("মোবাইল নম্বর", "Mobile number")}</Label>
            <Input className="border-slate-300 bg-slate-50 shadow-sm focus-visible:ring-emerald-700" inputMode="numeric" maxLength={11} value={mobile} disabled={sent} onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))} placeholder="017XXXXXXXX" />
            {sent ? (<>
              <Label>{L("৬ অঙ্কের কোড", "6-digit code")}</Label>
              <Input className="border-slate-300 bg-slate-50 shadow-sm focus-visible:ring-emerald-700" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} />
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
                <p className="text-xs text-muted-foreground">{L("অনুমোদিত কর্মীরা ইমেইল ও পাসওয়ার্ড দিয়ে লগইন করুন", "Approved staff can sign in with email and password")}</p>
                <PasswordLoginForm
                  onAuthenticated={done}
                  onFailure={fail}
                  onStart={() => setLoginMessage(null)}
                />
              </TabsContent>
            </Tabs>
          </TabsContent>
          <TabsContent value="register" className="space-y-3 pt-2">
            <Register />
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
