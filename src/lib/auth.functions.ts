import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import {
  admin,
  clientIp,
  lockoutMinutes,
  logAttempt,
  normalizePhone,
  origin,
  publicClient,
  recentCount,
  serializeSupabaseError,
  sha256,
  LIMITS,
} from "./auth.server";
import {
  EXECUTIVE_PREVIEW_ROLES,
  EXECUTIVE_ROLE_BY_POSITION,
  type ExecutivePreviewRole,
} from "./dashboard-roles";
import {
  MONIRAMPUR_STATIONS,
  resolveMonirampurRegistrationUnion,
  resolveMonirampurStation,
} from "./monirampur-stations";
import {
  EXECUTIVE_CATEGORY,
  getExecutiveJurisdiction,
  getExecutiveJurisdictionByName,
  staffRegistrationRequestSchema,
} from "./registration-request";

type Tokens = { access_token: string; refresh_token: string };
type Result = { ok: true; tokens: Tokens } | { ok: false; error: string; lockedMinutes?: number };

const PRIV = ["admin", "uno", "super"] as const;
const STAFF_APPROVAL_ROLES = ["worker", "police", "admin", "uno", "district", "super"] as const;
type StaffApprovalRole = (typeof STAFF_APPROVAL_ROLES)[number];

async function rolesOf(userId: string) {
  const db = await admin();
  const { data, error } = await db.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).map((r) => r.role);
}

function errorDetails(error: unknown) {
  return serializeSupabaseError(error);
}

function isStaffApprovalRole(role: string | undefined): role is StaffApprovalRole {
  return STAFF_APPROVAL_ROLES.some((candidate) => candidate === role);
}

function missingServerEnvironment(required: string[]) {
  const missing = required.filter((name) => !process.env[name]?.trim());
  if (missing.length) {
    console.error("Required server environment configuration is missing", { variables: missing });
  }
  return missing;
}

function isSupabaseConfigurationError(error: unknown) {
  const message = errorDetails(error)["message"];
  return (
    typeof message === "string" &&
    /Missing Supabase (?:server )?configuration|Missing Supabase environment variable\(s\):.*\b(?:SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_PUBLISHABLE_KEY)\b/.test(
      message,
    )
  );
}

/* ---------- Password sign-in (officers) ---------- */
export const passwordSignIn = createServerFn({ method: "POST" })
  .validator((d) =>
    z
      .object({
        email: z.string().trim().toLowerCase().email().max(255),
        password: z.string().min(1).max(128),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<Result> => {
    if (
      missingServerEnvironment([
        "SUPABASE_URL",
        "SUPABASE_PUBLISHABLE_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
      ]).length
    ) {
      return { ok: false, error: "configuration" };
    }

    const ip = clientIp();
    const id = `email:${data.email}`;
    try {
      const lock = await lockoutMinutes(id, ip);
      if (lock) {
        await logAttempt(id, "password", ip, false, "locked");
        return { ok: false, error: "locked", lockedMinutes: lock };
      }
      const { data: sessionData, error } = await publicClient().auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });
      if (error || !sessionData.session) {
        await logAttempt(id, "password", ip, false, error?.code ?? "invalid");
        return { ok: false, error: "invalid" };
      }
      const db = await admin();
      const { data: profile, error: profileError } = await db
        .from("profiles")
        .select("active, status, approval_status")
        .eq("id", sessionData.user.id)
        .maybeSingle();
      if (profileError) {
        console.error("Could not check sign-in approval status", {
          code: profileError.code,
          message: profileError.message,
        });
        return { ok: false, error: "unavailable" };
      }
      if (profile?.status === "pending" || profile?.approval_status === "pending") {
        await logAttempt(id, "password", ip, false, "pending_approval");
        return { ok: false, error: "pending" };
      }
      if (profile?.status === "suspended" || profile?.approval_status === "suspended") {
        await logAttempt(id, "password", ip, false, "account_suspended");
        return { ok: false, error: "suspended" };
      }
      if (
        profile?.status === "cancelled" ||
        profile?.approval_status === "cancelled" ||
        profile?.status === "rejected" ||
        profile?.approval_status === "rejected"
      ) {
        await logAttempt(id, "password", ip, false, "rejected");
        return { ok: false, error: "cancelled" };
      }
      if (
        !profile?.active ||
        profile.status !== "active" ||
        profile.approval_status !== "approved"
      ) {
        await logAttempt(id, "password", ip, false, "inactive");
        return { ok: false, error: "invalid" };
      }
      const roles = await rolesOf(sessionData.user.id);
      if (
        !roles.some(
          (r) =>
            (PRIV as readonly string[]).includes(r) ||
            r === "worker" ||
            r === "police" ||
            r === "district" ||
            r === "super_admin" ||
            r === "owner",
        )
      ) {
        await logAttempt(id, "password", ip, false, "role");
        return { ok: false, error: "invalid" };
      }
      await logAttempt(id, "password", ip, true);
      return {
        ok: true,
        tokens: {
          access_token: sessionData.session.access_token,
          refresh_token: sessionData.session.refresh_token,
        },
      };
    } catch (error) {
      console.error("Password sign-in service failed", errorDetails(error));
      return {
        ok: false,
        error: isSupabaseConfigurationError(error) ? "configuration" : "unavailable",
      };
    }
  });

/* ---------- Admin staff approval ---------- */
export const listPendingStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if ((context.claims as { aal?: string }).aal !== "aal2") {
      return { ok: false as const, error: "mfa_required" };
    }
    const { data: roles, error: rolesError } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
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
    const { error: recoverError } = await db
      .from("staff_registration_requests")
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
    const { data: pendingProfiles, error: pendingError } = await db
      .from("profiles")
      .select("id, name_bn, name_en, email, mobile, created_at")
      .eq("approval_status", "pending")

      .order("created_at", { ascending: true });
    if (pendingError) {
      console.error("Could not load pending staff registrations", pendingError.message);
      return { ok: false as const, error: "unavailable" };
    }
    profiles = pendingProfiles ?? [];

    const { data: registrationRequests, error: requestsError } = await db
      .from("staff_registration_requests")
      .select(
        "id, full_name, email, phone, role, union_name, upazila_id, category, requested_position, created_at",
      )
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
      role: StaffApprovalRole;
      createdAt: string;
    }[] = [];
    if (profiles?.length) {
      const { data: applicantRoles, error: applicantRolesError } = await db
        .from("user_roles")
        .select("user_id, role")
        .in(
          "user_id",
          profiles.map((profile) => profile.id),
        );
      if (applicantRolesError) {
        console.error("Could not load pending applicant roles", applicantRolesError.message);
        return { ok: false as const, error: "unavailable" };
      }
      const rolesByUserId = new Map<string, string[]>();
      for (const item of applicantRoles ?? []) {
        const userRoles = rolesByUserId.get(item.user_id) ?? [];
        userRoles.push(item.role);
        rolesByUserId.set(item.user_id, userRoles);
      }
      applicants = profiles.flatMap((profile) => {
        const userRoles = rolesByUserId.get(profile.id) ?? [];
        const role = userRoles.length === 1 ? userRoles[0] : undefined;
        if (!isStaffApprovalRole(role)) return [];
        return [
          {
            id: profile.id,
            nameBn: profile.name_bn,
            nameEn: profile.name_en,
            email: profile.email,
            mobile: profile.mobile,
            role,
            createdAt: profile.created_at,
          },
        ];
      });
    }
    return {
      ok: true as const,
      applicants,
      requests: (registrationRequests ?? []).map((request) => {
        const requestStation = MONIRAMPUR_STATIONS.find(
          (station) => station.en === request.union_name && station.type === "union",
        );
        const executivePosition = EXECUTIVE_PREVIEW_ROLES.find(
          (position) => position === request.requested_position,
        );
        const jurisdiction =
          request.category === EXECUTIVE_CATEGORY && executivePosition
            ? getExecutiveJurisdictionByName(request.union_name, executivePosition)
            : undefined;
        return {
          id: request.id,
          fullName: request.full_name,
          email: request.email,
          mobile: request.phone,
          role: request.role,
          category: request.category,
          requestedPosition: request.requested_position,
          upazilaId: request.upazila_id,
          unionId: request.category === EXECUTIVE_CATEGORY ? null : (requestStation?.id ?? null),
          jurisdictionId: jurisdiction?.id ?? null,
          unionName: request.union_name,
          createdAt: request.created_at,
        };
      }),
    };
  });

export const countPendingStaffRegistrations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if ((context.claims as { aal?: string }).aal !== "aal2") {
      return { ok: false as const, error: "mfa_required" };
    }

    const { data: roles, error: rolesError } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (rolesError) {
      console.error("Could not verify pending-count role", rolesError.message);
      return { ok: false as const, error: "unavailable" };
    }
    if (roles?.length !== 1 || roles[0]?.role !== "super") {
      return { ok: false as const, error: "forbidden" };
    }

    const db = await admin();
    const [
      { data: pendingProfiles, error: profilesError },
      { count: pendingRequestCount, error: requestsError },
    ] = await Promise.all([
      db.from("profiles").select("id").eq("approval_status", "pending"),
      db
        .from("staff_registration_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
    ]);

    if (profilesError) {
      console.error("Could not count pending staff profiles", profilesError.message);
      return { ok: false as const, error: "unavailable" };
    }
    if (requestsError) {
      console.error("Could not count pending registration requests", requestsError.message);
      return { ok: false as const, error: "unavailable" };
    }

    const profileIds = (pendingProfiles ?? []).map((profile) => profile.id);
    let pendingApplicantCount = 0;
    if (profileIds.length) {
      const { data: applicantRoles, error: applicantRolesError } = await db
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", profileIds);
      if (applicantRolesError) {
        console.error("Could not count pending applicant roles", applicantRolesError.message);
        return { ok: false as const, error: "unavailable" };
      }

      const rolesByUserId = new Map<string, string[]>();
      for (const item of applicantRoles ?? []) {
        const userRoles = rolesByUserId.get(item.user_id) ?? [];
        userRoles.push(item.role);
        rolesByUserId.set(item.user_id, userRoles);
      }
      pendingApplicantCount = profileIds.filter((userId) => {
        const userRoles = rolesByUserId.get(userId) ?? [];
        return userRoles.length === 1 && isStaffApprovalRole(userRoles[0]);
      }).length;
    }

    return {
      ok: true as const,
      count: pendingApplicantCount + (pendingRequestCount ?? 0),
    };
  });

export const reviewStaffRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({
        userId: z.string().uuid(),
        decision: z.enum(["approve", "reject"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if ((context.claims as { aal?: string }).aal !== "aal2") {
      return { ok: false as const, error: "mfa_required" };
    }
    const { data: roles, error: rolesError } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (rolesError) {
      console.error("Could not verify approval-management role", rolesError.message);
      return { ok: false as const, error: "unavailable" };
    }
    const roleList = (roles ?? []).map((item) => item.role);
    if (roleList.length !== 1 || roleList[0] !== "super") {
      return { ok: false as const, error: "forbidden" };
    }

    const db = await admin();

    const { data: applicantRoleRows, error: applicantRoleError } = await db
      .from("user_roles")
      .select("role")
      .eq("user_id", data.userId);
    if (applicantRoleError) {
      console.error("Could not verify applicant role", applicantRoleError.message);
      return { ok: false as const, error: "unavailable" };
    }
    const applicantRoles = (applicantRoleRows ?? []).map((item) => item.role);
    const canReviewRole = applicantRoles.length === 1 && isStaffApprovalRole(applicantRoles[0]);
    if (!canReviewRole) return { ok: false as const, error: "not_pending_or_forbidden" };

    const status = data.decision === "approve" ? "active" : "rejected";
    const updateQuery = db
      .from("profiles")
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
  .validator((input) => input)
  .handler(async ({ data: input }) => {
    const parsedRequest = staffRegistrationRequestSchema.safeParse(input);
    if (!parsedRequest.success) {
      console.warn("Rejected invalid staff registration request", {
        issues: parsedRequest.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
      return { ok: false as const, error: "invalid_request" };
    }
    const data = parsedRequest.data;
    if (missingServerEnvironment(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]).length) {
      return { ok: false as const, error: "configuration" };
    }

    const email = data.email;
    const mobile = data.mobile ? normalizePhone(data.mobile) : null;
    if (data.mobile && !mobile) return { ok: false as const, error: "bad_phone" };
    const isExecutive = data.category === EXECUTIVE_CATEGORY;
    const role =
      data.category === EXECUTIVE_CATEGORY
        ? data.requestedPosition
          ? EXECUTIVE_ROLE_BY_POSITION[data.requestedPosition]
          : null
        : data.category === "স্বাস্থ্যকর্মী"
          ? "worker"
          : data.category === "গ্রাম পুলিশ"
            ? "police"
            : "admin";
    if (!role) return { ok: false as const, error: "invalid_request" };

    const ip = clientIp();
    const identifier = `staff-registration:${await sha256(ip)}`;
    try {
      if ((await recentCount(identifier, "staff_registration_request", 60)) >= 5) {
        await logAttempt(identifier, "staff_registration_request", ip, false, "too_many");
        return { ok: false as const, error: "too_many" };
      }

      const db = await admin();
      let unionName: string;
      if (isExecutive && data.requestedPosition && data.jurisdictionId) {
        const selectedJurisdiction = getExecutiveJurisdiction(
          data.jurisdictionId,
          data.requestedPosition,
        );
        if (!selectedJurisdiction) {
          await logAttempt(
            identifier,
            "staff_registration_request",
            ip,
            false,
            "invalid_jurisdiction",
          );
          return { ok: false as const, error: "bad_jurisdiction" };
        }
        const { data: upazila, error: upazilaError } = await db
          .from("upazilas")
          .select("id")
          .eq("id", "manirampur")
          .maybeSingle();
        if (upazilaError) {
          console.error("Could not validate executive registration jurisdiction", {
            table: "upazilas",
            operation: "select id",
            error: serializeSupabaseError(upazilaError),
          });
          return { ok: false as const, error: "database" };
        }
        if (!upazila) {
          console.error("Executive registration jurisdiction has no valid request scope");
          return { ok: false as const, error: "bad_jurisdiction" };
        }
        unionName = selectedJurisdiction.en;
      } else if (!isExecutive && data.unionId) {
        const { data: upazila, error: upazilaError } = await db
          .from("upazilas")
          .select("unions")
          .eq("id", "manirampur")
          .maybeSingle();
        if (upazilaError) {
          console.error("Could not validate staff registration union", {
            table: "upazilas",
            operation: "select unions",
            error: serializeSupabaseError(upazilaError),
          });
          return { ok: false as const, error: "database" };
        }
        const unions: unknown = upazila?.unions;
        const selectedUnion = resolveMonirampurRegistrationUnion(unions, data.unionId);
        if (!selectedUnion) {
          console.error("Could not match the selected staff registration union", {
            requestedUnionId: data.unionId,
            unionCount: Array.isArray(unions) ? unions.length : null,
            availableLabels: Array.isArray(unions)
              ? unions.map((entry) => {
                  if (typeof entry === "string") return entry;
                  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
                    return typeof entry;
                  }
                  return Object.values(entry).filter(
                    (value): value is string => typeof value === "string",
                  );
                })
              : typeof unions,
          });
          await logAttempt(identifier, "staff_registration_request", ip, false, "invalid_union");
          return { ok: false as const, error: "bad_union" };
        }
        unionName = selectedUnion.en;
      } else {
        return { ok: false as const, error: "invalid_request" };
      }

      const { error, status, statusText } = await db.from("staff_registration_requests").insert({
        full_name: data.fullName,
        email,
        phone: mobile,
        category: data.category,
        requested_position: data.requestedPosition ?? null,
        role,
        union_name: unionName,
        upazila_id: "manirampur",
        status: "pending",
      });
      if (error) {
        console.error("Could not save staff registration request", {
          table: "staff_registration_requests",
          operation: "insert",
          status,
          statusText,
          error: serializeSupabaseError(error),
        });
        if (error.code === "23505") {
          await logAttempt(identifier, "staff_registration_request", ip, false, "duplicate");
          return { ok: false as const, error: "duplicate" };
        }
        await logAttempt(identifier, "staff_registration_request", ip, false, "database_error");
        return { ok: false as const, error: "database" };
      }
      await logAttempt(identifier, "staff_registration_request", ip, true);
      return { ok: true as const };
    } catch (error) {
      const details = errorDetails(error);
      console.error("Staff registration request failed", details);
      return {
        ok: false as const,
        error: isSupabaseConfigurationError(error) ? "configuration" : "database",
      };
    }
  });

/* ---------- Phone OTP (field staff) ---------- */
export const sendPhoneOtp = createServerFn({ method: "POST" })
  .validator((d) => z.object({ mobile: z.string().max(20) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string; lockedMinutes?: number }> => {
    const phone = normalizePhone(data.mobile);
    if (!phone) return { ok: false, error: "bad_phone" };
    const ip = clientIp();
    const id = `phone:${phone}`;
    const lock = await lockoutMinutes(id, ip);
    if (lock) return { ok: false, error: "locked", lockedMinutes: lock };
    if ((await recentCount(id, "otp_send", 15)) >= LIMITS.otpSends)
      return { ok: false, error: "too_many", lockedMinutes: 15 };
    await logAttempt(id, "otp_send", ip, true);
    // Only existing field-staff accounts receive codes; response is identical either way (no account enumeration).
    const db = await admin();
    const { data: prof, error: profileError } = await db
      .from("profiles")
      .select("id, active, status, approval_status")
      .eq("mobile", phone)
      .maybeSingle();
    if (profileError) {
      console.error("Could not check phone sign-in approval status", profileError.message);
      return { ok: false, error: "unavailable" };
    }
    if (prof?.status === "pending" || prof?.approval_status === "pending") {
      return { ok: false, error: "pending" };
    }
    if (prof?.status === "suspended" || prof?.approval_status === "suspended") {
      return { ok: false, error: "suspended" };
    }
    if (
      prof?.status === "cancelled" ||
      prof?.approval_status === "cancelled" ||
      prof?.status === "rejected" ||
      prof?.approval_status === "rejected"
    ) {
      return { ok: false, error: "cancelled" };
    }
    if (prof?.active && prof.status === "active" && prof.approval_status === "approved") {
      const roles = await rolesOf(prof.id);
      if (roles.includes("worker") || roles.includes("police")) {
        const { error } = await publicClient().auth.signInWithOtp({
          phone,
          options: { shouldCreateUser: false },
        });
        if (error) {
          console.error("OTP send failed", error.message);
          return { ok: false, error: "sms_failed" };
        }
      }
    }
    return { ok: true };
  });

export const verifyPhoneOtp = createServerFn({ method: "POST" })
  .validator((d) =>
    z.object({ mobile: z.string().max(20), code: z.string().regex(/^\d{6}$/) }).parse(d),
  )
  .handler(async ({ data }): Promise<Result> => {
    const phone = normalizePhone(data.mobile);
    if (!phone) return { ok: false, error: "bad_phone" };
    const ip = clientIp();
    const id = `phone:${phone}`;
    const lock = await lockoutMinutes(id, ip);
    if (lock) {
      await logAttempt(id, "otp_verify", ip, false, "locked");
      return { ok: false, error: "locked", lockedMinutes: lock };
    }
    const { data: s, error } = await publicClient().auth.verifyOtp({
      phone,
      token: data.code,
      type: "sms",
    });
    if (error || !s.session || !s.user) {
      await logAttempt(id, "otp_verify", ip, false, error?.code ?? "invalid");
      return { ok: false, error: "invalid" };
    }
    const db = await admin();
    const { data: profile, error: profileError } = await db
      .from("profiles")
      .select("active, status, approval_status")
      .eq("id", s.user.id)
      .maybeSingle();
    if (profileError) {
      console.error("Could not check OTP approval status", profileError.message);
      return { ok: false, error: "unavailable" };
    }
    if (profile?.status === "pending" || profile?.approval_status === "pending") {
      await logAttempt(id, "otp_verify", ip, false, "pending_approval");
      return { ok: false, error: "pending" };
    }
    if (profile?.status === "suspended" || profile?.approval_status === "suspended") {
      await logAttempt(id, "otp_verify", ip, false, "account_suspended");
      return { ok: false, error: "suspended" };
    }
    if (
      profile?.status === "cancelled" ||
      profile?.approval_status === "cancelled" ||
      profile?.status === "rejected" ||
      profile?.approval_status === "rejected"
    ) {
      await logAttempt(id, "otp_verify", ip, false, "rejected");
      return { ok: false, error: "cancelled" };
    }
    if (!profile?.active || profile.status !== "active" || profile.approval_status !== "approved") {
      await logAttempt(id, "otp_verify", ip, false, "inactive");
      return { ok: false, error: "invalid" };
    }
    await logAttempt(id, "otp_verify", ip, true);
    return {
      ok: true,
      tokens: { access_token: s.session.access_token, refresh_token: s.session.refresh_token },
    };
  });

/* ---------- Password reset (expiring one-time email link) ---------- */
export const requestPasswordReset = createServerFn({ method: "POST" })
  .validator((d) => z.object({ email: z.string().trim().toLowerCase().email().max(255) }).parse(d))
  .handler(async ({ data }) => {
    const ip = clientIp();
    const id = `email:${data.email}`;
    if ((await recentCount(id, "reset", 60)) < 3) {
      await logAttempt(id, "reset", ip, true);
      const { error } = await publicClient().auth.resetPasswordForEmail(data.email, {
        redirectTo: `${origin()}/reset-password`,
      });
      if (error) console.error("reset failed", error.message);
    }
    return { ok: true }; // always generic
  });

/* ---------- First-run setup ---------- */
export const needsSetup = createServerFn({ method: "GET" }).handler(async () => {
  const db = await admin();
  const { count } = await db
    .from("user_roles")
    .select("id", { count: "exact", head: true })
    .eq("role", "super");
  return { needed: (count ?? 0) === 0 };
});

export const bootstrapSuperAdmin = createServerFn({ method: "POST" })
  .validator((d) =>
    z
      .object({
        email: z.string().trim().toLowerCase().email().max(255),
        password: z.string().min(12).max(128),
        nameBn: z.string().trim().min(1).max(100),
        nameEn: z.string().trim().min(1).max(100),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const { count } = await db
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("role", "super");
    if ((count ?? 0) > 0) return { ok: false as const, error: "already_setup" };
    const { data: u, error } = await db.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
    });
    if (error || !u.user) return { ok: false as const, error: error?.message ?? "failed" };
    await db
      .from("profiles")
      .insert({ id: u.user.id, name_bn: data.nameBn, name_en: data.nameEn, email: data.email });
    await db.from("user_roles").insert({ user_id: u.user.id, role: "super" });
    await db.from("audit_logs").insert({ user_id: u.user.id, action: "setup:super_admin" });
    return { ok: true as const };
  });

/* ---------- Super Admin staff provisioning and registration approval ---------- */
export const createStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({
        role: z.enum(["worker", "police", "admin", "uno", "district", "super"]),
        executivePosition: z
          .enum([
            "municipal_executive_officer",
            "uno",
            "ddlg",
            "dc",
            "addl_registrar_general",
            "city_corporation_ceo",
            "divisional_commissioner",
            "registrar_general",
          ])
          .optional(),
        nameBn: z.string().trim().min(1).max(100),
        nameEn: z.string().trim().min(1).max(100),
        contact: z.string().trim().max(255),
        initialPassword: z.string().min(12).max(128).optional(),
        upazilaId: z.string().min(1).max(64).optional(),
        unionId: z.string().max(64).optional(),
        jurisdictionId: z.string().max(64).optional(),
        ward: z.number().int().min(1).max(9).optional(),
        registrationRequestId: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const claims = context.claims as { aal?: string };
    if (claims.aal !== "aal2") return { ok: false as const, error: "mfa_required" };
    const { data: myRoles, error: rolesError } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (rolesError) {
      console.error("Could not verify staff-provisioning role", rolesError.message);
      return { ok: false as const, error: "unavailable" };
    }
    const roles = (myRoles ?? []).map((r) => r.role);
    const isSuper = roles.length === 1 && roles[0] === "super";
    const fieldRole = data.role === "worker" || data.role === "police";
    const isRegistrationApproval = Boolean(data.registrationRequestId);
    let profilePosition: ExecutivePreviewRole | null =
      data.executivePosition ?? (data.role === "uno" ? "uno" : null);
    if (!isSuper) {
      return { ok: false as const, error: "forbidden" };
    }
    if (isRegistrationApproval && data.executivePosition) {
      return { ok: false as const, error: "bad_request" };
    }
    if (
      !isRegistrationApproval &&
      profilePosition &&
      EXECUTIVE_ROLE_BY_POSITION[profilePosition] !== data.role
    ) {
      return { ok: false as const, error: "bad_position" };
    }
    const directPositionAllowed =
      profilePosition === "municipal_executive_officer" ||
      profilePosition === "uno" ||
      profilePosition === "ddlg" ||
      profilePosition === "dc" ||
      profilePosition === "divisional_commissioner";
    if (!isRegistrationApproval && profilePosition && !directPositionAllowed) {
      return { ok: false as const, error: "bad_position" };
    }
    if (!isRegistrationApproval && data.role === "district" && !profilePosition) {
      return { ok: false as const, error: "position_required" };
    }
    if (
      (isRegistrationApproval && data.initialPassword) ||
      (!isRegistrationApproval && !data.initialPassword)
    ) {
      return { ok: false as const, error: "password_required" };
    }
    const directEmail = isRegistrationApproval
      ? null
      : z.string().trim().toLowerCase().email().safeParse(data.contact);
    if (directEmail && !directEmail.success) {
      return { ok: false as const, error: "bad_email" };
    }
    const upazilaId = data.upazilaId ?? "";
    if ((data.role !== "super" || isRegistrationApproval) && !upazilaId) {
      return { ok: false as const, error: "bad_upazila" };
    }
    if (
      !isRegistrationApproval &&
      ["worker", "police", "admin"].includes(data.role) &&
      !data.unionId
    ) {
      return { ok: false as const, error: "union_required" };
    }
    if (data.role === "super" && data.unionId) {
      return { ok: false as const, error: "bad_request" };
    }

    const db = await admin();
    let unionRecords: unknown[] = [];
    if (upazilaId) {
      const { data: up, error: upazilaError } = await db
        .from("upazilas")
        .select("unions")
        .eq("id", upazilaId)
        .maybeSingle();
      if (upazilaError) {
        console.error("Could not validate staff upazila", upazilaError.message);
        return { ok: false as const, error: "unavailable" };
      }
      if (!up) return { ok: false as const, error: "bad_upazila" };
      const unions = z.array(z.unknown()).safeParse(up.unions);
      if (!unions.success) {
        console.error("Could not validate staff unions", unions.error.message);
        return { ok: false as const, error: "unavailable" };
      }
      unionRecords = unions.data;
    }
    if (!isRegistrationApproval && data.role === "admin") {
      const selectedUnionIsMunicipal = unionRecords.some((value) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) return false;
        const area = value as Record<string, unknown>;
        if (area["id"] !== data.unionId) return false;
        return /pourashava|municipality|পৌরসভা/i.test(
          ["id", "bn", "en", "name", "name_bn", "name_en"]
            .map((key) => area[key])
            .filter((name): name is string => typeof name === "string")
            .join(" "),
        );
      });
      if (selectedUnionIsMunicipal !== (profilePosition === "municipal_executive_officer")) {
        return { ok: false as const, error: "position_scope_mismatch" };
      }
    }
    if (data.unionId) {
      const unionExists =
        upazilaId === "manirampur"
          ? resolveMonirampurStation(unionRecords, data.unionId) !== undefined
          : unionRecords.some(
              (union) =>
                typeof union === "object" &&
                union !== null &&
                !Array.isArray(union) &&
                "id" in union &&
                union.id === data.unionId,
            );
      if (!unionExists) return { ok: false as const, error: "bad_union" };
    }
    if (data.unionId && (fieldRole || data.role === "admin")) {
      const { data: station, error: stationError } = await db
        .from("administrative_stations")
        .select("station_id")
        .eq("upazila_id", upazilaId)
        .eq("station_id", data.unionId)
        .maybeSingle();
      if (stationError) {
        console.error("Could not verify staff profile station scope", errorDetails(stationError));
        return { ok: false as const, error: "unavailable" };
      }
      if (!station) return { ok: false as const, error: "station_scope_missing" };
    }

    let registrationRequestId: string | undefined;
    let registrationEmail: string | null = null;
    let registrationPhone: string | null = null;
    if (data.registrationRequestId) {
      const { data: request, error: requestError } = await db
        .from("staff_registration_requests")
        .select(
          "id, full_name, email, phone, role, union_name, upazila_id, category, requested_position",
        )
        .eq("id", data.registrationRequestId)
        .eq("status", "pending")
        .eq("upazila_id", upazilaId)
        .maybeSingle();
      if (requestError) {
        console.error("Could not verify staff registration request", errorDetails(requestError));
        return { ok: false as const, error: "unavailable" };
      }
      const executivePosition = EXECUTIVE_PREVIEW_ROLES.find(
        (position) => position === request?.requested_position,
      );
      const requestStation =
        request?.category === EXECUTIVE_CATEGORY
          ? undefined
          : MONIRAMPUR_STATIONS.find(
              (station) => station.id === data.unionId && station.type === "union",
            );
      const jurisdiction =
        request?.category === EXECUTIVE_CATEGORY &&
        executivePosition &&
        data.jurisdictionId &&
        !data.unionId
          ? getExecutiveJurisdiction(data.jurisdictionId, executivePosition)
          : undefined;
      const scopeMatches =
        request?.category === EXECUTIVE_CATEGORY
          ? Boolean(jurisdiction && request.union_name === jurisdiction.en)
          : Boolean(
              requestStation && !data.jurisdictionId && request?.union_name === requestStation.en,
            );
      const expectedRole =
        request?.category === "স্বাস্থ্যকর্মী"
          ? "worker"
          : request?.category === "গ্রাম পুলিশ"
            ? "police"
            : request?.category === "ইউপি প্রশাসনিক কর্মকর্তা"
              ? "admin"
              : request?.category === "উচ্চ পর্যায়ের নির্বাহী প্যানেল" && executivePosition
                ? EXECUTIVE_ROLE_BY_POSITION[executivePosition]
                : null;
      if (
        !request ||
        !scopeMatches ||
        request.role !== data.role ||
        expectedRole !== data.role ||
        request.full_name !== data.nameEn.trim() ||
        (request.email
          ? request.email !== data.contact.trim().toLowerCase()
          : request.phone !== normalizePhone(data.contact)) ||
        request.upazila_id !== upazilaId ||
        request.union_name !== (jurisdiction?.en ?? requestStation?.en)
      ) {
        return { ok: false as const, error: "bad_request" };
      }
      profilePosition =
        request.category === EXECUTIVE_CATEGORY ? (executivePosition ?? null) : null;
      registrationEmail = request.email?.trim().toLowerCase() ?? null;
      registrationPhone = request.phone ? normalizePhone(request.phone) : null;

      const { data: claimedRequest, error: claimError } = await db
        .from("staff_registration_requests")
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
        console.error("Could not claim staff registration request", errorDetails(claimError));
        return { ok: false as const, error: "unavailable" };
      }
      if (!claimedRequest) return { ok: false as const, error: "request_unavailable" };
      registrationRequestId = claimedRequest.id;
    }

    const restoreRegistrationRequest = async () => {
      if (!registrationRequestId) return;
      try {
        const { error } = await db
          .from("staff_registration_requests")
          .update({ status: "pending", processing_by: null, processing_at: null })
          .eq("id", registrationRequestId)
          .eq("status", "processing")
          .eq("processing_by", context.userId);
        if (error) {
          console.error("Could not restore staff registration request", errorDetails(error));
        }
      } catch (error) {
        console.error("Could not restore staff registration request", errorDetails(error));
      }
    };

    const accountEmail = registrationRequestId
      ? registrationEmail
      : directEmail?.success
        ? directEmail.data
        : null;
    let created;
    try {
      if (accountEmail) {
        const password = registrationRequestId
          ? crypto.randomUUID() + crypto.randomUUID()
          : (data.initialPassword ?? "");
        created = await db.auth.admin.createUser({
          email: accountEmail,
          password,
          email_confirm: true,
        });
      } else if (fieldRole && registrationRequestId) {
        const phone = normalizePhone(data.contact);
        if (!phone) {
          await restoreRegistrationRequest();
          return { ok: false as const, error: "bad_phone" };
        }
        created = await db.auth.admin.createUser({ phone, phone_confirm: true });
      } else {
        await restoreRegistrationRequest();
        return { ok: false as const, error: "bad_email" };
      }
    } catch (error) {
      await restoreRegistrationRequest();
      console.error("Could not create staff auth user", errorDetails(error));
      return { ok: false as const, error: "auth_create_failed" };
    }
    if (created.error || !created.data.user) {
      await restoreRegistrationRequest();
      console.error(
        "Could not create staff auth user",
        errorDetails(created.error ?? new Error("Supabase returned no user")),
      );
      return { ok: false as const, error: "auth_create_failed" };
    }
    const uid = created.data.user.id;
    let districtId: string | null = null;
    if (data.role === "district") {
      const { data: upazilaArea, error: areaError } = await db
        .from("administrative_areas")
        .select("district_id")
        .eq("id", upazilaId)
        .eq("level", "upazila")
        .maybeSingle();
      if (areaError || !upazilaArea?.district_id) {
        const { error: cleanupError } = await db.auth.admin.deleteUser(uid);
        if (cleanupError) {
          console.error(
            "Could not clean up staff account after district lookup failed",
            cleanupError.message,
          );
        }
        await restoreRegistrationRequest();
        if (areaError) console.error("Could not determine staff district scope", areaError.message);
        return { ok: false as const, error: areaError ? "unavailable" : "bad_upazila" };
      }
      districtId = upazilaArea.district_id;
    }
    const { error: pe } = await db.from("profiles").insert({
      id: uid,
      name_bn: data.nameBn,
      name_en: data.nameEn,
      mobile: registrationRequestId
        ? (registrationPhone ?? (accountEmail ? null : normalizePhone(data.contact)))
        : null,
      email: accountEmail,
      executive_position: profilePosition,
      district_id: districtId,
      upazila_id: data.role === "district" || data.role === "super" ? null : upazilaId || null,
      union_id:
        data.role === "worker" || data.role === "police" || data.role === "admin"
          ? (data.unionId ?? null)
          : null,
      ward: fieldRole ? (data.ward ?? 1) : null,
      active: true,
      status: "active",
      approval_status: "approved",
    });
    if (pe) {
      const { error: cleanupError } = await db.auth.admin.deleteUser(uid);
      if (cleanupError)
        console.error(
          "Could not clean up staff account after profile creation failed",
          cleanupError.message,
        );
      await restoreRegistrationRequest();
      console.error("Could not create staff profile", errorDetails(pe));
      return { ok: false as const, error: "profile_failed" };
    }
    const { error: roleError } = await db
      .from("user_roles")
      .insert({ user_id: uid, role: data.role });
    if (roleError) {
      const { error: cleanupError } = await db.auth.admin.deleteUser(uid);
      if (cleanupError)
        console.error(
          "Could not clean up staff account after role assignment failed",
          cleanupError.message,
        );
      await restoreRegistrationRequest();
      console.error("Could not assign staff role", errorDetails(roleError));
      return { ok: false as const, error: "role_failed" };
    }
    if (registrationRequestId && accountEmail) {
      let resetError: unknown = null;
      try {
        const { error } = await publicClient().auth.resetPasswordForEmail(accountEmail, {
          redirectTo: `${origin()}/reset-password`,
        });
        resetError = error;
      } catch (error) {
        resetError = error;
      }
      if (resetError) {
        const { error: cleanupError } = await db.auth.admin.deleteUser(uid);
        if (cleanupError)
          console.error(
            "Could not clean up staff account after password setup email failed",
            errorDetails(cleanupError),
          );
        await restoreRegistrationRequest();
        console.error("Could not send staff password setup email", errorDetails(resetError));
        return { ok: false as const, error: "password_setup_failed" };
      }
    }
    if (registrationRequestId) {
      let approvedRequestId: string | null = null;
      let requestUpdateError: unknown = null;
      try {
        const { data: approvedRequest, error } = await db
          .from("staff_registration_requests")
          .update({
            status: "approved",
            processing_by: null,
            processing_at: null,
            reviewed_by: context.userId,
            reviewed_at: new Date().toISOString(),
          })
          .eq("id", registrationRequestId)
          .eq("status", "processing")
          .eq("processing_by", context.userId)
          .select("id")
          .maybeSingle();
        approvedRequestId = approvedRequest?.id ?? null;
        requestUpdateError = error;
      } catch (error) {
        requestUpdateError = error;
      }
      if (requestUpdateError || !approvedRequestId) {
        const { error: cleanupError } = await db.auth.admin.deleteUser(uid);
        if (cleanupError)
          console.error(
            "Could not clean up staff account after registration request update failed",
            errorDetails(cleanupError),
          );
        await restoreRegistrationRequest();
        console.error(
          "Could not complete staff registration request",
          (requestUpdateError && errorDetails(requestUpdateError)) ??
            "The request was no longer in the expected processing state",
        );
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

export const manageSuperAdminProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z.discriminatedUnion("operation", [
      z.object({
        operation: z.literal("status"),
        userId: z.string().uuid(),
        status: z.enum(["approved", "pending", "suspended", "cancelled"]),
      }),
      z.object({
        operation: z.literal("edit"),
        userId: z.string().uuid(),
        nameBn: z.string().trim().min(1).max(100),
        nameEn: z.string().trim().min(1).max(100),
        mobile: z.string().trim().max(20),
      }),
    ]).parse(d),
  )
  .handler(async ({ data, context }) => {
    if ((context.claims as { aal?: string }).aal !== "aal2") {
      return { ok: false as const, error: "mfa_required" };
    }

    const { data: reviewerRoles, error: reviewerRolesError } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (reviewerRolesError) {
      console.error("Could not verify user-management role", reviewerRolesError.message);
      return { ok: false as const, error: "unavailable" };
    }
    if (reviewerRoles?.length !== 1 || reviewerRoles[0]?.role !== "super") {
      return { ok: false as const, error: "forbidden" };
    }

    const db = await admin();
    const { data: targetRoles, error: targetRoleError } = await db
      .from("user_roles")
      .select("role")
      .eq("user_id", data.userId);
    if (targetRoleError) {
      console.error("Could not verify managed user role", targetRoleError.message);
      return { ok: false as const, error: "unavailable" };
    }
    if (
      targetRoles?.length !== 1 ||
      !isStaffApprovalRole(targetRoles[0]?.role) ||
      targetRoles[0]?.role === "super"
    ) {
      return { ok: false as const, error: "protected_account" };
    }

    const mobile =
      data.operation === "edit" && data.mobile ? normalizePhone(data.mobile) : null;
    if (data.operation === "edit" && data.mobile && !mobile) {
      return { ok: false as const, error: "bad_phone" };
    }

    const update: Database["public"]["Tables"]["profiles"]["Update"] =
      data.operation === "status"
        ? {
            approval_status: data.status,
            status: data.status === "approved" ? "active" : data.status,
            active: data.status === "approved",
          }
        : {
            name_bn: data.nameBn,
            name_en: data.nameEn,
            mobile,
          };
    const { data: updated, error: updateError } = await db
      .from("profiles")
      .update(update)
      .eq("id", data.userId)
      .select("id")
      .maybeSingle();
    if (updateError) {
      console.error("Could not update managed user profile", updateError.message);
      return { ok: false as const, error: "unavailable" };
    }
    if (!updated) return { ok: false as const, error: "user_unavailable" };

    const { error: auditError } = await db.from("audit_logs").insert({
      user_id: context.userId,
      action: data.operation === "status" ? "staff:account_status" : "staff:profile_update",
      details: {
        target_user: data.userId,
        ...(data.operation === "status" ? { status: data.status } : {}),
      },
    });
    if (auditError) {
      console.error("Managed user profile changed but audit logging failed", auditError.message);
      return { ok: true as const, warning: "audit_failed" };
    }
    return { ok: true as const };
  });

export const rejectStaffRegistrationRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ requestId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    if ((context.claims as { aal?: string }).aal !== "aal2") {
      return { ok: false as const, error: "mfa_required" };
    }
    const { data: roles, error: rolesError } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (rolesError) {
      console.error("Could not verify registration-request reviewer role", rolesError.message);
      return { ok: false as const, error: "unavailable" };
    }
    const isSuperAdmin = roles?.length === 1 && roles[0]?.role === "super";
    if (!isSuperAdmin) {
      return { ok: false as const, error: "forbidden" };
    }

    const db = await admin();
    const { data: rejected, error: rejectError } = await db
      .from("staff_registration_requests")
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
      console.error(
        "Staff registration request rejected but audit logging failed",
        auditError.message,
      );
      return { ok: true as const, warning: "audit_failed" };
    }
    return { ok: true as const };
  });

/* ---------- Recovery codes ---------- */
export const generateRecoveryCodes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if ((context.claims as { aal?: string }).aal !== "aal2")
      return { ok: false as const, codes: [] as string[] };
    const db = await admin();
    const codes = Array.from({ length: 10 }, () => {
      const b = crypto.getRandomValues(new Uint8Array(5));
      const s = Array.from(b)
        .map((x) => x.toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase();
      return `${s.slice(0, 5)}-${s.slice(5)}`;
    });
    await db.from("mfa_recovery_codes").delete().eq("user_id", context.userId);
    await db
      .from("mfa_recovery_codes")
      .insert(
        await Promise.all(
          codes.map(async (c) => ({ user_id: context.userId, code_hash: await sha256(c) })),
        ),
      );
    await db
      .from("audit_logs")
      .insert({ user_id: context.userId, action: "mfa:recovery_codes_generated" });
    return { ok: true as const, codes };
  });

export const useRecoveryCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({
        code: z
          .string()
          .trim()
          .toUpperCase()
          .regex(/^[0-9A-F]{5}-[0-9A-F]{5}$/),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ip = clientIp();
    const id = `recovery:${context.userId}`;
    const lock = await lockoutMinutes(id, ip);
    if (lock) return { ok: false as const, error: "locked", lockedMinutes: lock };
    const db = await admin();
    const hash = await sha256(data.code);
    const { data: row } = await db
      .from("mfa_recovery_codes")
      .select("id")
      .eq("user_id", context.userId)
      .eq("code_hash", hash)
      .is("used_at", null)
      .maybeSingle();
    if (!row) {
      await logAttempt(id, "recovery_code", ip, false, "invalid");
      return { ok: false as const, error: "invalid" };
    }
    await db
      .from("mfa_recovery_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("id", row.id);
    // Remove existing factors so the user re-enrols a new authenticator
    const { data: f } = await db.auth.admin.mfa.listFactors({ userId: context.userId });
    for (const factor of f?.factors ?? [])
      await db.auth.admin.mfa.deleteFactor({ userId: context.userId, id: factor.id });
    await logAttempt(id, "recovery_code", ip, true);
    await db
      .from("audit_logs")
      .insert({ user_id: context.userId, action: "mfa:recovery_code_used" });
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
    const { data: r } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (!(r ?? []).some((x) => (PRIV as readonly string[]).includes(x.role))) return { purged: 0 };
    const db = await admin();
    const cutoff = new Date(Date.now() - 90 * 86400000).toISOString();
    const { data: rows } = await db
      .from("cases")
      .select("id, files")
      .eq("status", "completed")
      .not("reg_no", "is", null)
      .lt("completed_at", cutoff)
      .eq("files_purged", false)
      .limit(200);
    for (const c of rows ?? []) {
      const paths = ((c.files as { path?: string }[]) ?? [])
        .map((f) => f.path)
        .filter(Boolean) as string[];
      if (paths.length) await db.storage.from("case-files").remove(paths);
      await db.from("cases").update({ files: [], files_purged: true }).eq("id", c.id);
    }
    return { purged: rows?.length ?? 0 };
  });
