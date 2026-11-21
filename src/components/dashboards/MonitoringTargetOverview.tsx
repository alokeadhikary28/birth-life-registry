import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { getDhakaMonthYear } from "@/lib/monthly-targets";
import { useApp } from "@/lib/store";

type SubmittedTarget = {
  upazila_id: string;
  union_id: string;
  union_name: string;
  birth_target: number;
  death_target: number;
  updated_at: string;
};

export function MonitoringTargetOverview() {
  const { L, n, state, user } = useApp();
  const [monthYear, setMonthYear] = useState(getDhakaMonthYear);
  const [targets, setTargets] = useState<SubmittedTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!user || !["super", "district"].includes(user.role)) {
      setTargets([]);
      setLoading(false);
      setLoadError(false);
      return;
    }

    let active = true;
    setLoading(true);
    setLoadError(false);
    setTargets([]);

    void supabase
      .from("registration_targets")
      .select("upazila_id, union_id, union_name, birth_target, death_target, updated_at")
      .eq("month_year", monthYear)
      .eq("status", "submitted")
      .order("upazila_id")
      .order("union_id")
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          console.error("Failed to load national registration targets", error);
          setTargets([]);
          setLoadError(true);
        } else {
          setTargets((data ?? []) as SubmittedTarget[]);
        }
      })
      .catch((error: unknown) => {
        if (!active) return;
        console.error("Failed to load national registration targets", error);
        setTargets([]);
        setLoadError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [monthYear, reloadKey, user]);

  const birthTotal = targets.reduce((total, target) => total + target.birth_target, 0);
  const deathTotal = targets.reduce((total, target) => total + target.death_target, 0);
  const upazilaCount = new Set(targets.map((target) => target.upazila_id)).size;

  return (
    <section className="min-h-0 flex-1 space-y-4 overflow-auto p-4 sm:p-5">
      <header className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
        <div>
          <h3 className="font-display text-xl font-semibold leading-8 text-emerald-950">
            {L("উপজেলাভিত্তিক জমা লক্ষ্যমাত্রা", "Submitted targets by Upazila")}
          </h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {L(
              "শুধু চূড়ান্তভাবে জমা দেওয়া তথ্য দেখানো হচ্ছে; খসড়া অন্তর্ভুক্ত নয়।",
              "Only final submissions are shown; drafts are excluded.",
            )}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium leading-6">
          {L("মাস", "Month")}
          <Input
            aria-label={L("লক্ষ্যমাত্রার মাস", "Target month")}
            className="h-10 w-40 bg-background text-base"
            type="month"
            value={monthYear.slice(0, 7)}
            onChange={(event) => {
              if (/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value)) {
                setMonthYear(`${event.target.value}-01`);
              }
            }}
          />
        </label>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          [
            L("জমা দেওয়া উপজেলা", "Upazilas submitted"),
            loading ? "…" : loadError ? "—" : n(upazilaCount),
          ],
          [
            L("জন্ম লক্ষ্যমাত্রা", "Birth targets"),
            loading ? "…" : loadError ? "—" : n(birthTotal),
          ],
          [
            L("মৃত্যু লক্ষ্যমাত্রা", "Death targets"),
            loading ? "…" : loadError ? "—" : n(deathTotal),
          ],
        ].map(([label, value]) => (
          <article key={label} className="rounded-xl border bg-card p-4 shadow-sm">
            <p className="text-sm font-medium leading-6 text-muted-foreground">{label}</p>
            <p className="mt-1 font-display text-2xl font-bold leading-tight text-slate-950">
              {value}
            </p>
          </article>
        ))}
      </div>

      {loadError ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-950"
        >
          <p className="flex items-center gap-2 text-base leading-7">
            <AlertTriangle className="size-5 shrink-0" aria-hidden="true" />
            {L(
              "লক্ষ্যমাত্রার তথ্য লোড করা যায়নি। 0023 migration, MFA সেশন ও RLS যাচাই করুন।",
              "Could not load targets. Verify migration 0023, the MFA session, and RLS.",
            )}
          </p>
          <Button
            type="button"
            variant="outline"
            className="h-10 text-base"
            onClick={() => setReloadKey((key) => key + 1)}
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            {L("আবার চেষ্টা করুন", "Retry")}
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <table className="w-full min-w-[46rem] border-collapse text-base">
            <thead className="bg-slate-50 text-left dark:bg-slate-800">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">
                  {L("উপজেলা", "Upazila")}
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  {L("ইউনিয়ন / পৌরসভা", "Union / Municipality")}
                </th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">
                  {L("জন্ম", "Birth")}
                </th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">
                  {L("মৃত্যু", "Death")}
                </th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">
                  {L("সর্বশেষ জমা", "Last submitted")}
                </th>
              </tr>
            </thead>
            <tbody>
              {targets.map((target) => {
                const upazila = state.upazilas.find((item) => item.id === target.upazila_id);
                const union = upazila?.unions.find((item) => item.id === target.union_id);
                const upazilaLabel = upazila
                  ? L(
                      `${upazila.bn}, ${upazila.districtBn}`,
                      `${upazila.en}, ${upazila.districtEn}`,
                    )
                  : target.upazila_id;
                const unionLabel = union
                  ? L(union.bn, union.en)
                  : target.union_name || target.union_id;

                return (
                  <tr
                    key={`${target.upazila_id}:${target.union_id}`}
                    className="border-t border-slate-200 dark:border-slate-700"
                  >
                    <th scope="row" className="px-4 py-3 text-left font-medium">
                      {upazilaLabel}
                    </th>
                    <td className="px-4 py-3">{unionLabel}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{n(target.birth_target)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{n(target.death_target)}</td>
                    <td className="px-4 py-3 text-right text-sm text-muted-foreground">
                      {new Intl.DateTimeFormat(L("bn-BD", "en-GB"), {
                        dateStyle: "medium",
                        timeZone: "Asia/Dhaka",
                      }).format(new Date(target.updated_at))}
                    </td>
                  </tr>
                );
              })}
              {!targets.length && !loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    {L(
                      "এই মাসে এখনো কোনো লক্ষ্যমাত্রা জমা পড়েনি।",
                      "No targets have been submitted for this month yet.",
                    )}
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    {L("লক্ষ্যমাত্রা লোড হচ্ছে…", "Loading targets…")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
