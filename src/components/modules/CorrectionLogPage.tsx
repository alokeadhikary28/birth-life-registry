import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, ClipboardClock, RefreshCw } from "lucide-react";
import { roleLabel, useApp } from "@/lib/store";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";

type AuditRow = Database["public"]["Tables"]["audit_logs"]["Row"];
type AuditChange = { old: Json; new: Json };
type JsonRecord = { [key: string]: Json | undefined };

const fieldLabels: Record<string, string> = {
  name_bn: "নাম (বাংলা) / Name (Bangla)",
  name_en: "Name (English)",
  father_bn: "পিতার নাম (বাংলা) / Father's name (Bangla)",
  father_en: "Father's name (English)",
  mother_bn: "মাতার নাম (বাংলা) / Mother's name (Bangla)",
  mother_en: "Mother's name (English)",
  nid: "NID / BRN",
  parent_mobile: "মোবাইল / Mobile",
  gender: "লিঙ্গ / Gender",
  dob: "জন্মতারিখ / Date of birth",
  child_order: "সন্তানের ক্রম / Birth order",
  dod: "মৃত্যুর তারিখ / Date of death",
  cause_bn: "মৃত্যুর কারণ (বাংলা) / Cause (Bangla)",
  cause_en: "Cause of death (English)",
  village_id: "গ্রাম / Village",
  details: "অতিরিক্ত তথ্য / Additional details",
  status: "অবস্থা / Status",
  reg_no: "নিবন্ধন নম্বর / Registration number",
  police_task: "যাচাইয়ের কাজ / Police task",
};

function isRecord(value: Json | null | undefined): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formattedValue(value: Json | undefined, L: (bn: string, en: string) => string) {
  if (value === undefined || value === null || value === "") return L("নেই", "Not set");
  if (Array.isArray(value)) return value.map((item) => String(item ?? "")).join(" → ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function parseChanges(details: Json | null): [string, AuditChange][] {
  if (!isRecord(details)) return [];
  const changes = details["changes"];
  if (isRecord(changes)) {
    const parsed = Object.entries(changes).flatMap(([field, change]) => {
      if (!isRecord(change)) return [];
      const oldValue = change["old"];
      const newValue = change["new"];
      if (oldValue === undefined || newValue === undefined) return [];
      return [[field, { old: oldValue, new: newValue }]];
    });
    if (parsed.length) return parsed;
  }

  const legacyStatus = details["status"];
  return Array.isArray(legacyStatus) && legacyStatus.length === 2
    ? [["status", { old: legacyStatus[0], new: legacyStatus[1] }]]
    : [];
}

function actionLabel(action: string, L: (bn: string, en: string) => string) {
  if (action === "update") return L("আবেদনের তথ্য সংশোধন", "Application updated");
  if (action === "remark") return L("মন্তব্য যোগ করা হয়েছে", "Remark added");
  if (action === "session:revoke") return L("সেশন বাতিল করা হয়েছে", "Session revoked");
  if (action.startsWith("create:birth")) return L("জন্ম আবেদন তৈরি", "Birth application created");
  if (action.startsWith("create:death")) return L("মৃত্যু আবেদন তৈরি", "Death application created");
  return action;
}

export function CorrectionLogPage() {
  const { L, state } = useApp();
  const [entries, setEntries] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: queryError } = await supabase
          .from("audit_logs")
          .select("id, at, user_id, action, case_id, details")
          .order("at", { ascending: false })
          .limit(200);
        if (queryError) throw queryError;
        if (active) setEntries(data ?? []);
      } catch (cause) {
        console.error("Failed to load correction audit logs", cause);
        if (active) {
          setEntries([]);
          setError(L("সংশোধন লগ লোড করা যায়নি", "Could not load correction history"));
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [L, reloadKey]);

  return (
    <main className="super-admin-history w-full max-w-none py-4">
      <Link
        to="/dashboard"
        className="mb-2 inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-base font-semibold leading-7 text-emerald-900 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {L("ড্যাশবোর্ডে ফিরে যান", "Back to dashboard")}
      </Link>
      <header className="mb-5">
        <p className="text-base font-semibold leading-7 text-emerald-800">
          {L("নিরাপদ নিরীক্ষা ট্রেইল", "Secure audit trail")}
        </p>
        <h1 className="font-display text-3xl font-bold leading-tight text-emerald-950">
          {L("সংশোধন ও কার্যক্রমের ইতিহাস", "Correction & activity history")}
        </h1>
        <p className="mt-1 text-base leading-7 text-muted-foreground">
          {L(
            "সর্বশেষ ২০০টি কার্যক্রম; পুরোনো ও পরিবর্তিত মানসহ।",
            "Most recent 200 activities, including before-and-after values.",
          )}
        </p>
      </header>

      {error && (
        <div
          role="alert"
          className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-base leading-7 text-red-900"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-1 h-5 w-5 shrink-0" aria-hidden="true" />
            <div>
              <p>{error}</p>
              <p className="text-sm leading-6">
                {L(
                  "audit_logs টেবিল, সুপার অ্যাডমিনের aal2 সেশন ও 0000/0001 migration যাচাই করুন।",
                  "Verify audit_logs, the Super Admin aal2 session, and migrations 0000/0001.",
                )}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-10 text-base"
            onClick={() => setReloadKey((key) => key + 1)}
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            {L("আবার চেষ্টা করুন", "Retry")}
          </Button>
        </div>
      )}

      {loading ? (
        <p
          className="rounded-xl border bg-white p-6 text-base leading-7 text-muted-foreground"
          role="status"
        >
          {L("লগ লোড হচ্ছে…", "Loading audit history…")}
        </p>
      ) : error ? null : entries.length ? (
        <div className="space-y-4">
          {entries.map((entry) => {
            const editor = state.users.find((person) => person.id === entry.user_id);
            const changes = parseChanges(entry.details);
            const targetCase = entry.case_id
              ? state.cases.find((item) => item.id === entry.case_id)
              : undefined;
            return (
              <article
                key={entry.id}
                className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-2">
                    <ClipboardClock className="mt-0.5 h-5 w-5 text-emerald-800" />
                    <div>
                      <h2 className="text-lg font-semibold leading-7 text-emerald-950">
                        {actionLabel(entry.action, L)}
                        {targetCase ? ` · ${L(targetCase.name.bn, targetCase.name.en)}` : ""}
                      </h2>
                      <p className="text-base leading-7 text-muted-foreground">
                        {editor
                          ? L(editor.name.bn, editor.name.en)
                          : (entry.user_id ?? L("অজানা ব্যবহারকারী", "Unknown user"))}
                        {" · "}
                        {editor
                          ? roleLabel(editor.role, L)
                          : L("ভূমিকা পাওয়া যায়নি", "Role unavailable")}
                      </p>
                    </div>
                  </div>
                  <time className="text-sm leading-6 text-muted-foreground" dateTime={entry.at}>
                    {new Intl.DateTimeFormat(L("bn-BD", "en-GB"), {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: "Asia/Dhaka",
                    }).format(new Date(entry.at))}
                  </time>
                </div>

                {changes.length ? (
                  <div className="mt-3 overflow-x-auto rounded-lg border">
                    <table className="w-full min-w-[36rem] text-left text-base">
                      <thead className="bg-emerald-50 text-emerald-950">
                        <tr>
                          <th className="px-3 py-2 font-semibold">
                            {L("পরিবর্তিত ক্ষেত্র", "Changed field")}
                          </th>
                          <th className="px-3 py-2 font-semibold">
                            {L("আগের তথ্য", "Previous value")}
                          </th>
                          <th className="px-3 py-2 font-semibold">
                            {L("পরিবর্তিত তথ্য", "Updated value")}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {changes.map(([field, change]) => (
                          <tr key={field} className="border-t">
                            <th scope="row" className="px-3 py-2 font-medium">
                              {fieldLabels[field] ?? field}
                            </th>
                            <td className="max-w-md break-words px-3 py-2 text-muted-foreground">
                              {formattedValue(change.old, L)}
                            </td>
                            <td className="max-w-md break-words px-3 py-2">
                              {formattedValue(change.new, L)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="mt-3 rounded-lg bg-slate-50 p-3 text-base leading-7 text-muted-foreground">
                    {L(
                      "এই পুরোনো লগে ক্ষেত্রভিত্তিক পরিবর্তনের তথ্য সংরক্ষিত ছিল না।",
                      "This older log does not contain field-level before-and-after values.",
                    )}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed p-8 text-center text-base leading-7 text-muted-foreground">
          {L("এখনও কোনো নিরীক্ষা লগ নেই।", "No audit records are available yet.")}
        </p>
      )}
    </main>
  );
}
