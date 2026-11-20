import { createClient } from "@supabase/supabase-js";
import { getRequestHeader } from "@tanstack/react-start/server";
import type { Database } from "@/integrations/supabase/types";

export function publicClient() {
  const url = process.env["SUPABASE_URL"]!;
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`)
          h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

export async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
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
    console.error("Could not check authentication lockout", {
      code: error.code,
      message: error.message,
    });
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
}

export async function recentCount(identifier: string, method: string, minutes: number) {
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
      code: error.code,
      message: error.message,
    });
    throw error;
  }
  return count ?? 0;
}

export async function logAttempt(
  identifier: string,
  method: string,
  ip: string,
  success: boolean,
  reason?: string,
) {
  const db = await admin();
  const { error } = await db
    .from("login_attempts")
    .insert({ identifier, method, ip, success, reason: reason ?? null });
  if (error) {
    console.error("Could not record authentication attempt", {
      method,
      code: error.code,
      message: error.message,
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
