import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  admin, clientIp, lockoutMinutes, logAttempt, normalizePhone, origin, publicClient, recentCount, sha256, LIMITS,
} from "./auth.server";
import { EXECUTIVE_PREVIEW_ROLES, EXECUTIVE_ROLE_BY_POSITION } from "./dashboard-roles";
import { MONIRAMPUR_STATIONS } from "./monirampur-stations";

type Tokens = { access_token: string; refresh_token: string };
type Result = { ok: true; tokens: Tokens } | { ok: false; error: string; lockedMinutes?: number };

const PRIV = ["admin", "uno", "super"] as const;

async function rolesOf(userId: string) {
  const db = await admin();
  const { data } = await db.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).map((r) => r.role);
}

/* ---------- Password sign-in (officers) ---------- */
export const passwordSignIn = createServerFn({ method: "POST" })
  .validator((d) => z.object({ email: z.string().trim().toLowerCase().email().max(255), password: z.string().min(1).max(128) }).parse(d))
  .handler(async ({ data }): Promise<Result> => {
    const ip = clientIp(); const id = `email:${data.email}`;
    const lock = await lockoutMinutes(id, ip);
    if (lock) { await logAttempt(id, "password", ip, false, "locked"); return { ok: false, error: "locked", lockedMinutes: lock }; }
    const { data: s, error } = await publicClient().auth.signInWithPassword({ email: data.email, password: data.password });
    if (error || !s.session) { await logAttempt(id, "password", ip, false, error?.code ?? "invalid"); return { ok: false, error: "invalid" }; }
    const db = await admin();
    const { data: profile, error: profileError } = await db.from("profiles").select("active, status").eq("id", s.user.id).maybeSingle();
    if (profileError) {
      console.error("Could not check sign-in approval status", profileError.message);
      return { ok: false, error: "unavailable" };
    }
    if (profile?.status === "pending") {
      await logAttempt(id, "password", ip, false, "pending_approval");
      return { ok: false, error: "pending" };
    }
    if (profile?.status === "rejected") {
      await logAttempt(id, "password", ip, false, "rejected");
      return { ok: false, error: "rejected" };
    }
    if (!profile?.active || profile.status !== "active") {
      await logAttempt(id, "password", ip, false, "inactive");
      return { ok: false, error: "invalid" };
    }
    const roles = await rolesOf(s.user.id);
    if (!roles.some((r) =>
      (PRIV as readonly string[]).includes(r) || r === "worker" || r === "police",
    )) {
      await logAttempt(id, "password", ip, false, "role"); return { ok: false, error: "invalid" };
    }
    await logAttempt(id, "password", ip, true);
    return { ok: true, tokens: { access_token: s.session.access_token, refresh_token: s.session.refresh_token } };
  });

/* ---------- Admin staff approval ---------- */
export const listPendingStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if ((context.claims as { aal?: string }).aal !== "aal2") {
      return { ok: false as const, error: "mfa_required" };
    }
    const { data: roles, error: rolesError } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId);
    if (rolesError) {
      console.error("Could not verify approval-management role", rolesError.message);
      return { ok: false as const, error: "unavailable" };
    }
    const roleList = (roles ?? []).map((item) => item.role);
    const isSuperAdmin = roleList.length === 1 && roleList[0] === "super";
    if (!isSuperAdmin) {
      return { ok: false as const, error: "forbidden" };
    }

    const db = await admin();
    const staleProcessingBefore = new Date(Date.now() - 10 * 60_000).toISOString();
    const { error: recoverError } = await db.from("staff_registration_requests")
      .update({ status: "pending", processing_by: null, processing_at: null })
      .eq("status", "processing")
      .lt("processing_at", staleProcessingBefore);
    if (recoverError) {
      console.error("Could not recover interrupted registration requests", recoverError.message);
      return { ok: false as const, error: "unavailable" };
    }

    let profiles: {
      id: string;
      name_bn: string;
      name_en: string;
      email: string | null;
      mobile: string | null;
      created_at: string;
    }[] = [];
    const { data: pendingProfiles, error: pendingError } = await db.from("profiles")
      .select("id, name_bn, name_en, email, mobile, created_at")
      .eq("approval_status", "pending")
      .order("created_at", { ascending: true });
    if (pendingError) {
      console.error("Could not load pending staff registrations", pendingError.message);
      return { ok: false as const, error: "unavailable" };
    }
    profiles = pendingProfiles ?? [];

    const { data: registrationRequests, error: requestsError } = await db.from("staff_registration_requests")
      .select("id, full_name, email, phone, mobile, admin_area, role, union_name, upazila_id, office_name, category, requested_position, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    if (requestsError) {
      console.error("Could not load staff registration requests", requestsError.message);
      return { ok: false as const, error: "unavailable" };
    }

    let applicants: {
      id: string;
      nameBn: string;
      nameEn: string;
      email: string | null;
      mobile: string | null;
      role: "worker" | "police" | "admin";
      createdAt: string;
    }[] = [];
    if (profiles?.length) {
      const { data: applicantRoles, error: applicantRolesError } = await db.from("user_roles")
        .select("user_id, role").in("user_id", profiles.map((profile) => profile.id));
      if (applicantRolesError) {
        console.error("Could not load pending applicant roles", applicantRolesError.message);
        return { ok: false as const, error: "unavailable" };
      }
      const roleByUserId = new Map(
        (applicantRoles ?? []).map((item) => [item.user_id, item.role]),
      );
      applicants = profiles.flatMap((profile) => {
        const role = roleByUserId.get(profile.id);
        if (role !== "worker" && role !== "police" && role !== "admin") return [];
        return [{
          id: profile.id,
          nameBn: profile.name_bn,
          nameEn: profile.name_en,
          email: profile.email,
          mobile: profile.mobile,
          role,
          createdAt: profile.created_at,
        }];
      });
    }
    return {
      ok: true as const,
      applicants,
      requests: (registrationRequests ?? []).map((request) => {
        const requestStation = MONIRAMPUR_STATIONS.find(
          (station) => station.en === request.union_name && station.type === "union",
        );
        return {
          id: request.id,
          fullName: request.full_name,
          email: request.email,
          mobile: request.mobile ?? request.phone,
          role: request.role,
          category: request.category,
          officeName: request.office_name,
          adminArea: request.admin_area,
          requestedPosition: request.requested_position,
          upazilaId: request.upazila_id,
          unionId: requestStation?.id ?? "",
          unionName: request.union_name,
          createdAt: request.created_at,
        };
      }),
    };
  });

export const reviewStaffRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({
    userId: z.string().uuid(),
    decision: z.enum(["approve", "reject"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    if ((context.claims as { aal?: string }).aal !== "aal2") {
      return { ok: false as const, error: "mfa_required" };
    }
    const { data: roles, error: rolesError } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId);
    if (rolesError) {
      console.error("Could not verify approval-management role", rolesError.message);
      return { ok: false as const, error: "unavailable" };
    }
    const roleList = (roles ?? []).map((item) => item.role);
    if (roleList.length !== 1 || roleList[0] !== "super") {
      return { ok: false as const, error: "forbidden" };
    }

    const db = await admin();
    const { data: applicantRoleRows, error: applicantRoleError } = await db.from("user_roles")
      .select("role").eq("user_id", data.userId);
    if (applicantRoleError) {
      console.error("Could not verify applicant role", applicantRoleError.message);
      return { ok: false as const, error: "unavailable" };
    }
    const applicantRoles = (applicantRoleRows ?? []).map((item) => item.role);
    const canReviewRole = applicantRoles.length === 1 &&
      (applicantRoles[0] === "worker" ||
        applicantRoles[0] === "police" ||
        applicantRoles[0] === "admin");
    if (!canReviewRole) return { ok: false as const, error: "not_pending_or_forbidden" };

    const status = data.decision === "approve" ? "active" : "rejected";
    const updateQuery = db.from("profiles")
      .update({
        approval_status: data.decision === "approve" ? "approved" : "rejected",
        status,
        active: data.decision === "approve",
      })
      .eq("id", data.userId)
      .eq("approval_status", "pending")
      .select("id");
    const { data: updated, error: updateError } = await updateQuery.maybeSingle();
    if (updateError) {
      console.error("Could not update staff approval status", updateError.message);
      return { ok: false as const, error: "unavailable" };
    }
    if (!updated) return { ok: false as const, error: "not_pending_or_forbidden" };

    const { error: auditError } = await db.from("audit_logs").insert({
      user_id: context.userId,
      action: `staff:${data.decision}`,
      details: { target_user: data.userId },
    });
    if (auditError) {
      console.error("Staff approval changed but audit logging failed", auditError.message);
      return { ok: true as const, warning: "audit_failed" };
    }
    return { ok: true as const };
  });

/* ---------- Public registration requests (no auth account is created) ---------- */
export const submitStaffRegistrationRequest = createServerFn({ method: "POST" })
  .validator((d) => z.object({
    fullName: z.string().trim().min(1).max(100),
    email: z.string().trim().toLowerCase().email().max(255),
    mobile: z.string().trim().min(1).max(20),
    officeName: z.string().trim().min(1).max(120),
    category: z.enum([
      "স্বাস্থ্যকর্মী",
      "গ্রাম পুলিশ",
      "ইউপি প্রশাসনিক কর্মকর্তা",
      "উচ্চ পর্যায়ের নির্বাহী প্যানেল",
    ]),
    requestedPosition: z.enum(EXECUTIVE_PREVIEW_ROLES).optional(),
    unionId: z.string().min(1).max(64),
  }).superRefine((request, ctx) => {
    if (
      request.category === "উচ্চ পর্যায়ের নির্বাহী প্যানেল" &&
      !request.requestedPosition
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["requestedPosition"],
        message: "Executive position is required",
      });
    }
    if (
      request.category !== "উচ্চ পর্যায়ের নির্বাহী প্যানেল" &&
      request.requestedPosition
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["requestedPosition"],
        message: "Executive position is only valid for the executive category",
      });
    }
  }).parse(d))
  .handler(async ({ data }) => {
    const email = data.email.trim().toLowerCase();
    const mobile = normalizePhone(data.mobile);
    const roleByCategory = {
      "স্বাস্থ্যকর্মী": "worker",
      "গ্রাম পুলিশ": "police",
      "ইউপি প্রশাসনিক কর্মকর্তা": "admin",
    } as const;
    const role = data.category === "উচ্চ পর্যায়ের নির্বাহী প্যানেল"
      ? data.requestedPosition
        ? EXECUTIVE_ROLE_BY_POSITION[data.requestedPosition]
        : null
      : roleByCategory[data.category];
    if (!role) return { ok: false as const, error: "bad_category" };
    if (!mobile) return { ok: false as const, error: "bad_phone" };

    const ip = clientIp();
    const identifier = `staff-registration:${await sha256(ip)}`;
    try {
      if ((await recentCount(identifier, "staff_registration_request", 60)) >= 5) {
        return { ok: false as const, error: "too_many" };
      }

      const db = await admin();
      const { data: upazila, error: upazilaError } = await db.from("upazilas")
        .select("unions").eq("id", "manirampur").maybeSingle();
      if (upazilaError) {
        console.error("Could not validate staff registration request area", upazilaError.message);
        await logAttempt(identifier, "staff_registration_request", ip, false, "area_lookup");
        return { ok: false as const, error: "unavailable" };
      }
      const unions: unknown = upazila?.unions;
      const selectedUnion = Array.isArray(unions)
        ? unions.find((station: unknown): station is { id: string; en: string } =>
            station !== null &&
            typeof station === "object" &&
            !Array.isArray(station) &&
            "id" in station &&
            typeof station.id === "string" &&
            station.id === data.unionId &&
            station.id !== "mn-pourashava" &&
            "en" in station &&
            typeof station.en === "string",
          )
        : undefined;
      if (!selectedUnion) {
        await logAttempt(identifier, "staff_registration_request", ip, false, "invalid_union");
        return { ok: false as const, error: "bad_union" };
      }

      const { data: emailMatch, error: emailLookupError } = await db
        .from("staff_registration_requests")
        .select("id")
        .eq("email", email)
        .limit(1)
        .maybeSingle();
      if (emailLookupError) {
        console.error("Could not check duplicate staff registration email", emailLookupError.message);
        await logAttempt(identifier, "staff_registration_request", ip, false, "duplicate_check");
        return { ok: false as const, error: "unavailable" };
      }

      const { data: mobileMatch, error: mobileLookupError } = await db
        .from("staff_registration_requests")
        .select("id")
        .eq("mobile", mobile)
        .limit(1)
        .maybeSingle();
      if (mobileLookupError) {
        console.error("Could not check duplicate staff registration mobile", mobileLookupError.message);
        await logAttempt(identifier, "staff_registration_request", ip, false, "duplicate_check");
        return { ok: false as const, error: "unavailable" };
      }

      if (emailMatch || mobileMatch) {
        await logAttempt(identifier, "staff_registration_request", ip, false, "duplicate");
        return { ok: false as const, error: "duplicate" };
      }

      const { error } = await db.from("staff_registration_requests").insert({
        full_name: data.fullName,
        email,
        mobile,
        phone: mobile,
        office_name: data.officeName,
        category: data.category,
        requested_position: data.requestedPosition ?? null,
        role,
        admin_area: selectedUnion.en,
        union_name: selectedUnion.en,
        upazila_id: "manirampur",
        status: "pending",
      });
      if (error) {
        console.error(error);
        if (error.code === "23505") {
          await logAttempt(identifier, "staff_registration_request", ip, false, "duplicate");
          return { ok: false as const, error: "duplicate" };
        }
        await logAttempt(identifier, "staff_registration_request", ip, false, "database_error");
        return {
          ok: false as const,
          error: "unavailable",
          debugMessage: import.meta.env.DEV ? error.message : undefined,
        };
      }
      await logAttempt(identifier, "staff_registration_request", ip, true);
      return { ok: true as const };
    } catch (error) {
      console.log(error);
      console.error("Staff Registration Error Details:", error);
      return {
        ok: false as const,
        error: "unavailable",
        debugMessage:
          import.meta.env.DEV && error instanceof Error ? error.message : undefined,
      };
    }
  });

/* ---------- Phone OTP (field staff) ---------- */
export const sendPhoneOtp = createServerFn({ method: "POST" })
  .validator((d) => z.object({ mobile: z.string().max(20) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string; lockedMinutes?: number }> => {
    const phone = normalizePhone(data.mobile);
    if (!phone) return { ok: false, error: "bad_phone" };
    const ip = clientIp(); const id = `phone:${phone}`;
    const lock = await lockoutMinutes(id, ip);
    if (lock) return { ok: false, error: "locked", lockedMinutes: lock };
    if ((await recentCount(id, "otp_send", 15)) >= LIMITS.otpSends) return { ok: false, error: "too_many", lockedMinutes: 15 };
    await logAttempt(id, "otp_send", ip, true);
    // Only existing field-staff accounts receive codes; response is identical either way (no account enumeration).
    const db = await admin();
    const { data: prof, error: profileError } = await db.from("profiles")
      .select("id, active, status").eq("mobile", phone).maybeSingle();
    if (profileError) {
      console.error("Could not check phone sign-in approval status", profileError.message);
      return { ok: false, error: "unavailable" };
    }
    if (prof && !prof.active) {
      if (prof.status === "pending") return { ok: false, error: "pending" };
      if (prof.status === "rejected") return { ok: false, error: "rejected" };
    }
    if (prof?.active) {
      const roles = await rolesOf(prof.id);
      if (roles.includes("worker") || roles.includes("police")) {
        const { error } = await publicClient().auth.signInWithOtp({ phone, options: { shouldCreateUser: false } });
        if (error) { console.error("OTP send failed", error.message); return { ok: false, error: "sms_failed" }; }
      }
    }
    return { ok: true };
  });

export const verifyPhoneOtp = createServerFn({ method: "POST" })
  .validator((d) => z.object({ mobile: z.string().max(20), code: z.string().regex(/^\d{6}$/) }).parse(d))
  .handler(async ({ data }): Promise<Result> => {
    const phone = normalizePhone(data.mobile);
    if (!phone) return { ok: false, error: "bad_phone" };
    const ip = clientIp(); const id = `phone:${phone}`;
    const lock = await lockoutMinutes(id, ip);
    if (lock) { await logAttempt(id, "otp_verify", ip, false, "locked"); return { ok: false, error: "locked", lockedMinutes: lock }; }
    const { data: s, error } = await publicClient().auth.verifyOtp({ phone, token: data.code, type: "sms" });
    if (error || !s.session || !s.user) { await logAttempt(id, "otp_verify", ip, false, error?.code ?? "invalid"); return { ok: false, error: "invalid" }; }
    const db = await admin();
    const { data: profile, error: profileError } = await db.from("profiles").select("active, status").eq("id", s.user.id).maybeSingle();
    if (profileError) {
      console.error("Could not check OTP approval status", profileError.message);
      return { ok: false, error: "unavailable" };
    }
    if (profile?.status === "pending") {
      await logAttempt(id, "otp_verify", ip, false, "pending_approval");
      return { ok: false, error: "pending" };
    }
    if (profile?.status === "rejected") {
      await logAttempt(id, "otp_verify", ip, false, "rejected");
      return { ok: false, error: "rejected" };
    }
    if (!profile?.active || profile.status !== "active") {
      await logAttempt(id, "otp_verify", ip, false, "inactive");
      return { ok: false, error: "invalid" };
    }
    await logAttempt(id, "otp_verify", ip, true);
    return { ok: true, tokens: { access_token: s.session.access_token, refresh_token: s.session.refresh_token } };
  });

/* ---------- Password reset (expiring one-time email link) ---------- */
export const requestPasswordReset = createServerFn({ method: "POST" })
  .validator((d) => z.object({ email: z.string().trim().toLowerCase().email().max(255) }).parse(d))
  .handler(async ({ data }) => {
    const ip = clientIp(); const id = `email:${data.email}`;
    if ((await recentCount(id, "reset", 60)) < 3) {
      await logAttempt(id, "reset", ip, true);
      const { error } = await publicClient().auth.resetPasswordForEmail(data.email, { redirectTo: `${origin()}/reset-password` });
      if (error) console.error("reset failed", error.message);
    }
    return { ok: true }; // always generic
  });

/* ---------- First-run setup ---------- */
export const needsSetup = createServerFn({ method: "GET" }).handler(async () => {
  const db = await admin();
  const { count } = await db.from("user_roles").select("id", { count: "exact", head: true }).eq("role", "super");
  return { needed: (count ?? 0) === 0 };
});

export const bootstrapSuperAdmin = createServerFn({ method: "POST" })
  .validator((d) => z.object({
    email: z.string().trim().toLowerCase().email().max(255),
    password: z.string().min(12).max(128),
    nameBn: z.string().trim().min(1).max(100), nameEn: z.string().trim().min(1).max(100),
  }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { count } = await db.from("user_roles").select("id", { count: "exact", head: true }).eq("role", "super");
    if ((count ?? 0) > 0) return { ok: false as const, error: "already_setup" };
    const { data: u, error } = await db.auth.admin.createUser({ email: data.email, password: data.password, email_confirm: true });
    if (error || !u.user) return { ok: false as const, error: error?.message ?? "failed" };
    await db.from("profiles").insert({ id: u.user.id, name_bn: data.nameBn, name_en: data.nameEn, email: data.email });
    await db.from("user_roles").insert({ user_id: u.user.id, role: "super" });
    await db.from("audit_logs").insert({ user_id: u.user.id, action: "setup:super_admin" });
    return { ok: true as const };
  });

/* ---------- Staff provisioning (role-scoped, approval required) ---------- */
export const createStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({
    role: z.enum(["worker", "police", "admin", "uno", "district", "super"]),
    nameBn: z.string().trim().min(1).max(100), nameEn: z.string().trim().min(1).max(100),
    contact: z.string().trim().max(255),
    upazilaId: z.string().min(1).max(64),
    unionId: z.string().max(64).optional(),
    ward: z.number().int().min(1).max(9).optional(),
    registrationRequestId: z.string().uuid().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const claims = context.claims as { aal?: string };
    if (claims.aal !== "aal2") return { ok: false as const, error: "mfa_required" };
    const { data: myRoles, error: rolesError } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId);
    if (rolesError) {
      console.error("Could not verify staff-provisioning role", rolesError.message);
      return { ok: false as const, error: "unavailable" };
    }
    const roles = (myRoles ?? []).map((r) => r.role);
    const isSuper = roles.length === 1 && roles[0] === "super";
    const fieldRole = data.role === "worker" || data.role === "police";
    const isRequestApproval = Boolean(data.registrationRequestId) && isSuper;
    if (!isSuper || (data.registrationRequestId && !isRequestApproval)) {
      return { ok: false as const, error: "forbidden" };
    }
    if (isRequestApproval && !data.unionId) {
      return { ok: false as const, error: "bad_request" };
    }
    if (
      !data.registrationRequestId &&
      (data.role === "worker" || data.role === "police" || data.role === "admin") &&
      !data.unionId
    ) {
      return { ok: false as const, error: "union_required" };
    }

    const db = await admin();
    const { data: up, error: upazilaError } = await db.from("upazilas")
      .select("unions").eq("id", data.upazilaId).maybeSingle();
    if (upazilaError) {
      console.error("Could not validate staff upazila", upazilaError.message);
      return { ok: false as const, error: "unavailable" };
    }
    if (!up) return { ok: false as const, error: "bad_upazila" };
    const unions = z.array(z.object({ id: z.string() }).passthrough()).safeParse(up.unions);
    if (!unions.success) {
      console.error("Could not validate staff unions", unions.error.message);
      return { ok: false as const, error: "unavailable" };
    }
    if (data.unionId && !unions.data.some((union) => union.id === data.unionId)) {
      return { ok: false as const, error: "bad_union" };
    }

    let registrationRequestId: string | undefined;
    if (data.registrationRequestId) {
      const requestStation = MONIRAMPUR_STATIONS.find(
        (station) => station.id === data.unionId && station.type === "union",
      );
      if (!isRequestApproval || !data.unionId || !requestStation) {
        return { ok: false as const, error: "bad_request" };
      }
      const { data: request, error: requestError } = await db.from("staff_registration_requests")
        .select("id, full_name, email, phone, role, union_name, upazila_id, category, requested_position")
        .eq("id", data.registrationRequestId)
        .eq("status", "pending")
        .eq("upazila_id", data.upazilaId)
        .eq("union_name", requestStation.en)
        .maybeSingle();
      if (requestError) {
        console.error("Could not verify staff registration request", requestError.message);
        return { ok: false as const, error: "unavailable" };
      }
      const executivePosition = EXECUTIVE_PREVIEW_ROLES.find(
        (position) => position === request?.requested_position,
      );
      const expectedRole = request?.category === "স্বাস্থ্যকর্মী"
        ? "worker"
        : request?.category === "গ্রাম পুলিশ"
          ? "police"
          : request?.category === "ইউপি প্রশাসনিক কর্মকর্তা"
            ? "admin"
            : request?.category === "উচ্চ পর্যায়ের নির্বাহী প্যানেল" &&
                executivePosition
              ? EXECUTIVE_ROLE_BY_POSITION[executivePosition]
              : null;
      if (
        !request ||
        request.role !== data.role ||
        expectedRole !== data.role ||
        request.full_name !== data.nameEn.trim() ||
        (request.email
          ? request.email !== data.contact.trim().toLowerCase()
          : request.phone !== normalizePhone(data.contact)) ||
        request.upazila_id !== data.upazilaId ||
        request.union_name !== requestStation.en
      ) {
        return { ok: false as const, error: "bad_request" };
      }

      const { data: claimedRequest, error: claimError } = await db.from("staff_registration_requests")
        .update({
          status: "processing",
          processing_by: context.userId,
          processing_at: new Date().toISOString(),
        })
        .eq("id", request.id)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();
      if (claimError) {
        console.error("Could not claim staff registration request", claimError.message);
        return { ok: false as const, error: "unavailable" };
      }
      if (!claimedRequest) return { ok: false as const, error: "request_unavailable" };
      registrationRequestId = claimedRequest.id;
    }

    const restoreRegistrationRequest = async () => {
      if (!registrationRequestId) return;
      const { error } = await db.from("staff_registration_requests")
        .update({ status: "pending", processing_by: null, processing_at: null })
        .eq("id", registrationRequestId)
        .eq("status", "processing")
        .eq("processing_by", context.userId);
      if (error) console.error("Could not restore staff registration request", error.message);
    };

    const fieldEmail = fieldRole && data.registrationRequestId
      ? z.string().email().safeParse(data.contact.trim().toLowerCase())
      : null;
    const fieldEmailAddress = fieldEmail?.success ? fieldEmail.data : null;
    let created;
    if (fieldEmailAddress) {
      const password = crypto.randomUUID() + crypto.randomUUID();
      created = await db.auth.admin.createUser({
        email: fieldEmailAddress,
        password,
        email_confirm: true,
      });
    } else if (fieldRole) {
      const phone = normalizePhone(data.contact);
      if (!phone) return { ok: false as const, error: "bad_phone" };
      created = await db.auth.admin.createUser({ phone, phone_confirm: true });
    } else {
      const email = z.string().email().safeParse(data.contact.toLowerCase());
      if (!email.success) return { ok: false as const, error: "bad_email" };
      const pw = crypto.randomUUID() + crypto.randomUUID();
      created = await db.auth.admin.createUser({ email: email.data, password: pw, email_confirm: true });
    }
    if (created.error || !created.data.user) {
      await restoreRegistrationRequest();
      return { ok: false as const, error: created.error?.message ?? "failed" };
    }
    const uid = created.data.user.id;
    let districtId: string | null = null;
    if (data.role === "district") {
      const { data: upazilaArea, error: areaError } = await db.from("administrative_areas")
        .select("district_id").eq("id", data.upazilaId).eq("level", "upazila").maybeSingle();
      if (areaError || !upazilaArea?.district_id) {
        const { error: cleanupError } = await db.auth.admin.deleteUser(uid);
        if (cleanupError) {
          console.error("Could not clean up staff account after district lookup failed", cleanupError.message);
        }
        await restoreRegistrationRequest();
        if (areaError) console.error("Could not determine staff district scope", areaError.message);
        return { ok: false as const, error: areaError ? "unavailable" : "bad_upazila" };
      }
      districtId = upazilaArea.district_id;
    }
    const { error: pe } = await db.from("profiles").insert({
      id: uid, name_bn: data.nameBn, name_en: data.nameEn,
      mobile: fieldEmailAddress ? null : fieldRole ? normalizePhone(data.contact) : null,
      email: fieldRole ? fieldEmailAddress : data.contact.toLowerCase(),
      district_id: districtId,
      upazila_id: data.role === "district" || data.role === "super" ? null : data.upazilaId,
      union_id: data.role === "worker" || data.role === "police" || data.role === "admin"
        ? data.unionId ?? null
        : null,
      ward: fieldRole ? data.ward ?? 1 : null,
      active: true,
      status: "active",
      approval_status: "approved",
    });
    if (pe) {
      const { error: cleanupError } = await db.auth.admin.deleteUser(uid);
      if (cleanupError) console.error("Could not clean up staff account after profile creation failed", cleanupError.message);
      await restoreRegistrationRequest();
      console.error("Could not create staff profile", pe.message);
      return { ok: false as const, error: "profile_failed" };
    }
    const { error: roleError } = await db.from("user_roles").insert({ user_id: uid, role: data.role });
    if (roleError) {
      const { error: cleanupError } = await db.auth.admin.deleteUser(uid);
      if (cleanupError) console.error("Could not clean up staff account after role assignment failed", cleanupError.message);
      await restoreRegistrationRequest();
      console.error("Could not assign staff role", roleError.message);
      return { ok: false as const, error: "role_failed" };
    }
    if (!fieldRole || fieldEmailAddress) {
      const { error: resetError } = await publicClient().auth.resetPasswordForEmail(
        fieldEmailAddress ?? data.contact.toLowerCase(),
        { redirectTo: `${origin()}/reset-password` },
      );
      if (resetError) {
        const { error: cleanupError } = await db.auth.admin.deleteUser(uid);
        if (cleanupError) console.error("Could not clean up staff account after password setup email failed", cleanupError.message);
        await restoreRegistrationRequest();
        console.error("Could not send staff password setup email", resetError.message);
        return { ok: false as const, error: "password_setup_failed" };
      }
    }
    if (registrationRequestId) {
      const { error: requestUpdateError } = await db.from("staff_registration_requests")
        .update({
          status: "approved",
          processing_by: null,
          processing_at: null,
          reviewed_by: context.userId,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", registrationRequestId)
        .eq("status", "processing")
        .eq("processing_by", context.userId);
      if (requestUpdateError) {
        const { error: cleanupError } = await db.auth.admin.deleteUser(uid);
        if (cleanupError) console.error("Could not clean up staff account after registration request update failed", cleanupError.message);
        await restoreRegistrationRequest();
        console.error("Could not complete staff registration request", requestUpdateError.message);
        return { ok: false as const, error: "request_update_failed" };
      }
    }
    const { error: auditError } = await db.from("audit_logs").insert({
      user_id: context.userId,
      action: `staff:create:${data.role}`,
      details: {
        new_user: uid,
        approval_status: "approved",
        ...(registrationRequestId ? { request_id: registrationRequestId } : {}),
      },
    });
    if (auditError) {
      console.error("Staff account created but audit logging failed", auditError.message);
      return { ok: true as const, warning: "audit_failed" };
    }
    return { ok: true as const, approvalStatus: "approved" as const };
  });

export const rejectStaffRegistrationRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ requestId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    if ((context.claims as { aal?: string }).aal !== "aal2") {
      return { ok: false as const, error: "mfa_required" };
    }
    const { data: roles, error: rolesError } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId);
    if (rolesError) {
      console.error("Could not verify registration-request reviewer role", rolesError.message);
      return { ok: false as const, error: "unavailable" };
    }
    const isSuperAdmin = roles?.length === 1 && roles[0]?.role === "super";
    if (!isSuperAdmin) {
      return { ok: false as const, error: "forbidden" };
    }

    const db = await admin();
    const { data: rejected, error: rejectError } = await db.from("staff_registration_requests")
      .update({
        status: "rejected",
        processing_by: null,
        processing_at: null,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.requestId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (rejectError) {
      console.error("Could not reject staff registration request", rejectError.message);
      return { ok: false as const, error: "unavailable" };
    }
    if (!rejected) return { ok: false as const, error: "request_unavailable" };

    const { error: auditError } = await db.from("audit_logs").insert({
      user_id: context.userId,
      action: "staff:registration_request:reject",
      details: { request_id: data.requestId },
    });
    if (auditError) {
      console.error("Staff registration request rejected but audit logging failed", auditError.message);
      return { ok: true as const, warning: "audit_failed" };
    }
    return { ok: true as const };
  });

/* ---------- Recovery codes ---------- */
export const generateRecoveryCodes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if ((context.claims as { aal?: string }).aal !== "aal2") return { ok: false as const, codes: [] as string[] };
    const db = await admin();
    const codes = Array.from({ length: 10 }, () => {
      const b = crypto.getRandomValues(new Uint8Array(5));
      const s = Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("").toUpperCase();
      return `${s.slice(0, 5)}-${s.slice(5)}`;
    });
    await db.from("mfa_recovery_codes").delete().eq("user_id", context.userId);
    await db.from("mfa_recovery_codes").insert(await Promise.all(codes.map(async (c) => ({ user_id: context.userId, code_hash: await sha256(c) }))));
    await db.from("audit_logs").insert({ user_id: context.userId, action: "mfa:recovery_codes_generated" });
    return { ok: true as const, codes };
  });

export const useRecoveryCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ code: z.string().trim().toUpperCase().regex(/^[0-9A-F]{5}-[0-9A-F]{5}$/) }).parse(d))
  .handler(async ({ data, context }) => {
    const ip = clientIp(); const id = `recovery:${context.userId}`;
    const lock = await lockoutMinutes(id, ip);
    if (lock) return { ok: false as const, error: "locked", lockedMinutes: lock };
    const db = await admin();
    const hash = await sha256(data.code);
    const { data: row } = await db.from("mfa_recovery_codes").select("id").eq("user_id", context.userId).eq("code_hash", hash).is("used_at", null).maybeSingle();
    if (!row) { await logAttempt(id, "recovery_code", ip, false, "invalid"); return { ok: false as const, error: "invalid" }; }
    await db.from("mfa_recovery_codes").update({ used_at: new Date().toISOString() }).eq("id", row.id);
    // Remove existing factors so the user re-enrols a new authenticator
    const { data: f } = await db.auth.admin.mfa.listFactors({ userId: context.userId });
    for (const factor of f?.factors ?? []) await db.auth.admin.mfa.deleteFactor({ userId: context.userId, id: factor.id });
    await logAttempt(id, "recovery_code", ip, true);
    await db.from("audit_logs").insert({ user_id: context.userId, action: "mfa:recovery_code_used" });
    return { ok: true as const };
  });

export const logSecurityEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ action: z.enum(["mfa:enrolled", "mfa:verified"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin();
    await db.from("audit_logs").insert({ user_id: context.userId, action: data.action });
    return { ok: true };
  });

/* ---------- Storage purge: files 90 days after completion ---------- */
export const purgeExpiredFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: r } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    if (!(r ?? []).some((x) => (PRIV as readonly string[]).includes(x.role))) return { purged: 0 };
    const db = await admin();
    const cutoff = new Date(Date.now() - 90 * 86400000).toISOString();
    const { data: rows } = await db.from("cases").select("id, files").eq("status", "completed").not("reg_no", "is", null)
      .lt("completed_at", cutoff).eq("files_purged", false).limit(200);
    for (const c of rows ?? []) {
      const paths = ((c.files as { path?: string }[]) ?? []).map((f) => f.path).filter(Boolean) as string[];
      if (paths.length) await db.storage.from("case-files").remove(paths);
      await db.from("cases").update({ files: [], files_purged: true }).eq("id", c.id);
    }
    return { purged: rows?.length ?? 0 };
  });
