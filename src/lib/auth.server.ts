import { createClient } from "@supabase/supabase-js";
import { getRequestHeader } from "@tanstack/react-start/server";
import type { Database } from "@/integrations/supabase/types";

function resolveSupabaseEnv() {
  const url =
    process.env["SUPABASE_URL"] ||
    process.env["VITE_SUPABASE_URL"] ||
    "";
  const key =
    process.env["SUPABASE_PUBLISHABLE_KEY"] ||
    process.env["SUPABASE_ANON_KEY"] ||
    process.env["VITE_SUPABASE_ANON_KEY"] ||
    process.env["SUPABASE_SERVICE_ROLE_KEY"] ||
    "";

  if (!url || !key) {
    console.error("Missing Supabase server env vars", {
      hasUrl: Boolean(url),
      hasKey: Boolean(key),
    });
  }

  return { url, key };
}

function serializeError(err: unknown) {
  if (err instanceof Error) {
    const anyErr = err as Error & { code?: unknown; details?: unknown; hint?: unknown; cause?: unknown };
    return {
      name: err.name,
      code: anyErr.code ?? undefined,
      message: err.message,
      details: anyErr.details,
      hint: anyErr.hint,
      cause: anyErr.cause instanceof Error ? anyErr.cause.message : anyErr.cause,
    };
  }
  return { raw: err };
}

export function publicClient() {
  const { url, key } = resolveSupabaseEnv();
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key && key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
          h.delete("Authorization");
        }
        if (key) {
          h.set("apikey", key);
        }
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

export async function admin() {
  try {
    const mod = await import("@/integrations/supabase/client.server");
    if (mod?.supabaseAdmin) {
      return mod.supabaseAdmin;
    }
  } catch (err) {
    console.warn("client.server unavailable, falling back to publicClient()", serializeError(err));
  }
  return publicClient();
}

export function clientIp() {
  return (
    (getRequestHeader("cf-connecting-ip") || getRequestHeader("x-forwarded-for") || "")
      .split(",")[0]!
      .trim() || "unknown"
  );
}

export function origin() {
  const o = getRequestHeader("origin");
  if (o) return o;
  const host = getRequestHeader("host");
  return host ? `https://${host}` : "";
}

const WINDOW_MIN = 15;
export const LIMITS = { perIdentifier: 5, perIp: 30, otpSends: 3 };

/** Returns minutes remaining in lockout, or 0 if allowed. */
export async function lockoutMinutes(identifier: string, ip: string) {
  try {
    const db = await admin();
    const since = new Date(Date.now() - WINDOW_MIN * 60000).toISOString();
    const [byIdentifier, byIp] = await Promise.all([
      db
        .from("login_attempts")
        .select("at, success")
        .eq("identifier", identifier)
        .gte("at", since)
        .order("at", { ascending: false })
        .limit(20),
      db
        .from("login_attempts")
        .select("id", { count: "exact", head: true })
        .eq("ip", ip)
        .eq("success", false)
        .gte("at", since),
    ]);
    if (byIdentifier.error || byIp.error) {
      const error = byIdentifier.error ?? byIp.error;
      console.error("Could not check authentication lockout", serializeError(error));
      throw error;
    }
    const byId = byIdentifier.data;
    const ipFails = byIp.count;
    // consecutive failures since last success
    const fails: string[] = [];
    for (const a of byId ?? []) {
      if (a.success) break;
      fails.push(a.at);
    }
    if (fails.length >= LIMITS.perIdentifier) {
      const oldest = new Date(fails[LIMITS.perIdentifier - 1]!).getTime();
      return Math.max(1, Math.ceil((oldest + WINDOW_MIN * 60000 - Date.now()) / 60000));
    }
    if ((ipFails ?? 0) >= LIMITS.perIp) return WINDOW_MIN;
    return 0;
  } catch (err) {
    console.error("Could not check authentication lockout", serializeError(err));
    throw err;
  }
}

export async function recentCount(identifier: string, method: string, minutes: number) {
  try {
    const db = await admin();
    const { count, error } = await db
      .from("login_attempts")
      .select("id", { count: "exact", head: true })
      .eq("identifier", identifier)
      .eq("method", method)
      .gte("at", new Date(Date.now() - minutes * 60000).toISOString());
    if (error) {
      console.error("Could not check authentication rate limit", {
        method,
        ...serializeError(error),
      });
      throw error;
    }
    return count ?? 0;
  } catch (err) {
    console.error("Could not check authentication rate limit", {
      method,
      ...serializeError(err),
    });
    throw err;
  }
}

export async function logAttempt(
  identifier: string,
  method: string,
  ip: string,
  success: boolean,
  reason?: string,
) {
  try {
    const db = await admin();
    const { error } = await db
      .from("login_attempts")
      .insert({ identifier, method, ip, success, reason: reason ?? null });
    if (error) {
      console.error("Could not record authentication attempt", {
        method,
        ...serializeError(error),
      });
    }
  } catch (err) {
    console.error("Could not record authentication attempt", {
      method,
      ...serializeError(err),
    });
  }
}

export function normalizePhone(m: string) {
  const d = m.replace(/\D/g, "");
  if (/^01\d{9}$/.test(d)) return "+88" + d;
  if (/^8801\d{9}$/.test(d)) return "+" + d;
  return null;
}

export async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}