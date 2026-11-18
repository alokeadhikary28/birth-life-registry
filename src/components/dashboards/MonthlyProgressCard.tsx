import { useId, useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApp } from "@/lib/store";
import { downloadCSV, printPDF } from "@/lib/report";
import { filterAdvancedReport, type AdvancedReportFilters } from "@/lib/advanced-report";
import { getCompletionPercent, getDhakaMonthYear, getMonthlyStatusProgress } from "@/lib/monthly-targets";
import type { RegCase } from "@/lib/types";

type CaseTypeCounts = {
  pending: number;
  progress: number;
  completed: number;
  total?: number;
};

export type MonthlyProgressCounts = {
  birth: CaseTypeCounts;
  death: CaseTypeCounts;
};

const EMPTY_REPORT_CASES: RegCase[] = [];

function MetricProgress({
  value,
  target,
  color,
  trackColor,
}: {
  value: number;
  target: number;
  color: string;
  trackColor: string;
}) {
  const { n } = useApp();
  const percentage = target ? Math.round((value / target) * 100) : 0;

  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1 flex items-center justify-between gap-2 text-base font-semibold">
        <span className="text-slate-700">{n(value)} / {n(target)}</span>
        <span className="text-lg font-extrabold text-slate-900">{n(percentage)}%</span>
      </div>
      <div
        className={`h-1.5 overflow-hidden rounded-full shadow-inner ${trackColor}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, Math.max(0, percentage))}
        aria-label={`${n(percentage)}%`}
      >
        <div
          className={`h-full rounded-full shadow-sm transition-[width] duration-700 ease-out ${color}`}
          style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
        />
      </div>
    </div>
  );
}

export function MonthlyProgressCard({
  counts,
  received,
  targets,
  warning,
  compact = false,
  featured = false,
  reportCases: reportCasesProp,
  reportsEnabled = false,
}: {
  counts: MonthlyProgressCounts;
  received: number;
  targets: { birth: number; death: number };
  warning?: string;
  compact?: boolean;
  featured?: boolean;
  reportCases?: RegCase[];
  reportsEnabled?: boolean;
}) {
  const { L, n } = useApp();
  const [selectedReport, setSelectedReport] = useState<
    "overall" | "submitted" | "completed" | "progress" | "advanced" | null
  >(null);
  const [reportType, setReportType] = useState<AdvancedReportFilters["type"]>("all");
  const [reportStatus, setReportStatus] = useState<AdvancedReportFilters["status"]>("all");
  const [reportFromDate, setReportFromDate] = useState("");
  const [reportToDate, setReportToDate] = useState("");
  const [reportThreshold, setReportThreshold] = useState("45");
  const reportCases = reportCasesProp ?? EMPTY_REPORT_CASES;
  const thresholdDays = reportThreshold.trim() === "" ? null : Number(reportThreshold);
  const reportRows = useMemo(
    () =>
      filterAdvancedReport(reportCases, {
        type: reportType,
        status: reportStatus,
        fromDate: reportFromDate,
        toDate: reportToDate,
        thresholdDays,
      }),
    [reportCases, reportFromDate, reportStatus, thresholdDays, reportToDate, reportType],
  );
  const within45Days = useMemo(
    () =>
      filterAdvancedReport(reportCases, {
        type: "birth",
        status: "completed",
        fromDate: "",
        toDate: "",
        thresholdDays: 45,
      }).length,
    [reportCases],
  );
  const now = new Date();
  const monthYear = getDhakaMonthYear();
  const dhakaYear = Number(monthYear.slice(0, 4));
  const dhakaMonth = Number(monthYear.slice(5, 7));
  const monthDate = new Date(Date.UTC(dhakaYear, dhakaMonth - 1, 15));
  const monthName = new Intl.DateTimeFormat(L("bn-BD", "en-US"), {
    month: "long",
    timeZone: "UTC",
  }).format(monthDate);
  const monthYearBn = new Intl.DateTimeFormat("bn-BD", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(monthDate);
  const monthYearEn = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(monthDate);
  const monthlyProgressTitle = L(
    `${monthYearBn} অগ্রগতির বিস্তারিত`,
    `${monthYearEn} progress details`,
  );
  const dhakaDay = Number(new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Dhaka",
    day: "numeric",
  }).format(now));
  const daysInMonth = new Date(Date.UTC(dhakaYear, dhakaMonth, 0)).getUTCDate();
  const remainingDays = daysInMonth - dhakaDay;
  const gradientId = `monthly-progress-${useId().replaceAll(":", "")}`;
  const target = targets.birth + targets.death;
  const completed = counts.birth.completed + counts.death.completed;
  const submitted =
    getMonthlyStatusProgress(counts.birth, targets.birth, "submitted").value +
    getMonthlyStatusProgress(counts.death, targets.death, "submitted").value;
  const inFlight = counts.birth.pending + counts.birth.progress + counts.death.pending + counts.death.progress;
  const circumference = 2 * Math.PI * 88;
  const completion = getCompletionPercent(
    counts.birth.completed,
    counts.death.completed,
    targets.birth,
    targets.death,
  );
  const completionArc = (Math.min(completed, target) / Math.max(1, target)) * circumference;
  const statusDetails = (status: "submitted" | "completed" | "progress") =>
    (["birth", "death"] as const).map((type) => {
      const progress = getMonthlyStatusProgress(counts[type], targets[type], status);
      return L(
        `${type === "birth" ? "জন্ম" : "মৃত্যু"} ${n(progress.value)} / ${n(progress.denominator)} (${n(progress.percentage)}%)`,
        `${type === "birth" ? "Birth" : "Death"} ${n(progress.value)} / ${n(progress.denominator)} (${n(progress.percentage)}%)`,
      );
    });
  const statusItems = [
    {
      id: "submitted",
      label: L("জমা হয়েছে", "Submitted"),
      value: submitted,
      details: statusDetails("submitted"),
      classes: "border-blue-200 bg-gradient-to-r from-blue-50 to-cyan-50 shadow-blue-500/10",
      dot: "bg-blue-500",
      text: "text-blue-800",
    },
    {
      id: "completed",
      label: L("নিবন্ধন সম্পন্ন", "Registrations completed"),
      value: completed,
      details: statusDetails("completed"),
      classes: "border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 shadow-emerald-500/10",
      dot: "bg-emerald-500",
      text: "text-emerald-800",
    },
    {
      id: "progress",
      label: L("প্রক্রিয়াধীন", "In progress"),
      value: inFlight,
      details: statusDetails("progress"),
      classes: "border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 shadow-amber-500/10",
      dot: "bg-amber-500",
      text: "text-amber-800",
    },
  ] as const;
  const selectedStatus =
    selectedReport && selectedReport !== "overall"
      ? statusItems.find((item) => item.id === selectedReport)
      : undefined;
  const reportStatuses = selectedStatus
    ? [selectedStatus]
    : statusItems;
  const countForStatus = (status: (typeof statusItems)[number]["id"], type: "birth" | "death") =>
    getMonthlyStatusProgress(counts[type], targets[type], status).value;
  const printCurrentReport = () => {
    const headers = [
      L("সূচক", "Metric"),
      L("ধরন", "Type"),
      L("সংখ্যা", "Count"),
      L("লক্ষ্যমাত্রা", "Target"),
      L("শতাংশ", "Percentage"),
    ];
    if (selectedReport === "advanced") {
      printPDF(L("উন্নত নিবন্ধন প্রতিবেদন", "Advanced registration report"), [
        [
          L("আবেদন আইডি", "Application ID"),
          L("নাম", "Name"),
          L("ধরন", "Type"),
          L("অবস্থা", "Status"),
          L("জন্ম তারিখ", "Date of birth"),
          L("নিবন্ধন / জমার তারিখ", "Registration / submission date"),
          L("জন্মের পর দিন", "Days from birth"),
        ],
        ...reportRows.map(({ item, registrationDate, daysFromBirth }) => [
          item.id,
          L(item.name.bn, item.name.en),
          L(item.type === "birth" ? "জন্ম" : "মৃত্যু", item.type),
          L(
            {
              pending: "জমা হয়েছে",
              progress: "প্রক্রিয়াধীন",
              completed: "নিবন্ধন সম্পন্ন",
              rejected: "বাতিল",
            }[item.status],
            item.status,
          ),
          item.dob,
          registrationDate ?? "",
          daysFromBirth ?? "",
        ]),
      ]);
      return;
    }

    const statusRows = (selectedStatus ? [selectedStatus] : reportStatuses).flatMap((status) =>
      (["birth", "death"] as const).map((type) => {
        const value = countForStatus(status.id, type);
        const typeTarget = getMonthlyStatusProgress(counts[type], targets[type], status.id);
        return [
          status.label,
          L(type === "birth" ? "জন্ম" : "মৃত্যু", type),
          value,
          typeTarget.denominator,
          `${typeTarget.percentage}%`,
        ];
      }),
    );
    if (!selectedStatus) {
      statusRows.push([
        L("লক্ষ্যমাত্রা সম্পন্ন", "Target completed"),
        L("মোট", "Total"),
        completed,
        target,
        `${completion}%`,
      ]);
      if (reportsEnabled) {
        statusRows.push([
          L("৪৫ দিনের মধ্যে জন্ম নিবন্ধন", "Births registered within 45 days"),
          L("জন্ম", "Birth"),
          within45Days,
          reportCases.length,
          reportCases.length ? `${Math.round((within45Days / reportCases.length) * 100)}%` : "0%",
        ]);
      }
    }
    printPDF(
      selectedStatus?.label ?? monthlyProgressTitle,
      [headers, ...statusRows],
    );
  };

  return (
    <>
      <section
        className={`flex w-full flex-col rounded-2xl border border-emerald-200 bg-gradient-to-br from-white via-white to-emerald-50/70 shadow-lg shadow-emerald-900/10 ${
          featured
            ? "gap-2 p-3 sm:min-h-[20rem] sm:gap-3 sm:p-4 xl:min-h-[22rem] xl:p-5"
            : compact
              ? "min-h-[17rem] gap-1.5 p-2.5 sm:min-h-[18rem] sm:gap-2 sm:p-3"
              : "min-h-[24rem] p-5 sm:min-h-[25rem] sm:p-6"
        }`}
        aria-label={L("চলতি মাসের কাজের অগ্রগতি", "Current month work progress")}
      >
      <div
        className={`grid flex-1 items-center ${
          compact
            ? "gap-1.5 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] sm:gap-2"
            : featured
              ? "gap-2 sm:grid-cols-[minmax(12rem,0.9fr)_minmax(0,1.1fr)] sm:gap-4 xl:gap-6"
              : "gap-5 sm:grid-cols-[minmax(14rem,0.9fr)_minmax(0,1.1fr)] sm:gap-6"
        }`}
      >
        <div
          className={`flex min-w-0 flex-col items-center rounded-xl border border-slate-100 bg-white shadow-sm ${
            featured ? "gap-2 p-2 sm:gap-3 sm:p-3" : compact ? "gap-1.5 p-2" : "gap-3 p-4"
          }`}
        >
          <h2
            className={`text-center font-bold text-slate-800 ${
              featured ? "text-sm sm:text-lg xl:text-xl" : compact ? "text-sm" : "text-lg"
            }`}
          >
            {L(`${monthName} মাসের অগ্রগতি`, `${monthName} progress`)}
          </h2>
          <button
            type="button"
            onClick={() => setSelectedReport("overall")}
            className={`group relative mx-auto shrink-0 transform cursor-pointer rounded-full shadow-md transition-all duration-300 hover:-translate-y-1 hover:scale-105 hover:shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 ${
              featured
                ? "h-40 w-40 sm:h-52 sm:w-52 xl:h-60 xl:w-60"
                : compact
                  ? "h-44 w-44 sm:h-52 sm:w-52"
                  : "h-52 w-52 sm:h-56 sm:w-56"
            }`}
            aria-label={L("সামগ্রিক অগ্রগতির বিস্তারিত প্রতিবেদন দেখুন", "View overall progress report")}
          >
            <svg
              viewBox="0 0 220 220"
              className="h-full w-full -rotate-90"
              role="img"
              aria-label={`${n(completion)}% ${L("মাসিক লক্ষ্যমাত্রা সম্পন্ন", "of monthly target completed")}`}
            >
              <defs>
                <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.32" />
                  <stop offset="35%" stopColor="#3b82f6" stopOpacity="0.32" />
                  <stop offset="68%" stopColor="#f59e0b" stopOpacity="0.32" />
                  <stop offset="100%" stopColor="#a855f7" stopOpacity="0.32" />
                </linearGradient>
              </defs>
              <circle
                cx="110"
                cy="110"
                r="88"
                fill="none"
                stroke={`url(#${gradientId})`}
                strokeWidth={featured ? "22" : "20"}
              />
              <circle
                cx="110"
                cy="110"
                r="88"
                fill="none"
                stroke="#10b981"
                strokeWidth={featured ? "22" : "20"}
                strokeDasharray={`${completionArc} ${circumference - completionArc}`}
                className="drop-shadow-[0_0_5px_rgba(16,185,129,0.35)] transition-all duration-500"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span
                className={`font-extrabold leading-none text-slate-800 ${
                  featured ? "text-3xl sm:text-4xl xl:text-5xl" : "text-3xl sm:text-4xl"
                }`}
              >
                {n(completion)}%
              </span>
              <span
                className={`font-semibold text-slate-500 ${
                  featured
                    ? "mt-1 text-xs sm:mt-2 sm:text-sm"
                    : compact
                      ? "mt-1 text-xs sm:text-sm"
                      : "mt-1 text-sm"
                }`}
              >
                {L("লক্ষ্যমাত্রা", "Monthly target")}
              </span>
            </div>
            <span className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-emerald-100 bg-white/95 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 opacity-0 shadow-sm transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 sm:text-xs">
              {L("বিস্তারিত দেখতে বৃত্তে ক্লিক করুন", "Click the chart for details")}
            </span>
          </button>
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <p
            className={`monthly-remaining-pulse flex w-full items-center justify-center text-center font-extrabold text-emerald-700 ${
              compact ? "text-sm sm:text-lg" : "text-lg sm:text-xl"
            }`}
          >
            {L(
              `চলতি মাসের অবশিষ্ট সময়: ${n(remainingDays)} দিন`,
              `Time remaining this month: ${n(remainingDays)} days`,
            )}
          </p>
          <div
          className={`grid w-full font-bold text-slate-700 ${
            featured
              ? "gap-2 text-sm sm:gap-2.5 sm:text-base"
              : compact
                ? "gap-1.5 text-xs"
                : "gap-3 text-sm sm:text-base"
          }`}
        >
          {statusItems.map((item) => (
            <button
              type="button"
              key={item.id}
              onClick={() => setSelectedReport(item.id)}
              aria-label={L(`${item.label} বিস্তারিত প্রতিবেদন দেখুন`, `View detailed ${item.label} report`)}
              className={`flex min-w-0 cursor-pointer items-center justify-between rounded-xl border shadow-md transition-all hover:scale-[1.01] hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 ${
                featured && item.details.length > 0
                  ? "gap-3 p-3 sm:gap-4 sm:p-4"
                  : featured
                    ? "gap-3 p-2.5 sm:gap-4 sm:p-3"
                    : compact
                      ? "gap-2 p-2"
                      : "gap-3 p-3"
              } ${item.classes}`}
            >
              <span
                className={`flex min-w-0 items-center font-semibold text-slate-700 ${
                  featured ? "gap-2.5" : compact ? "gap-1.5" : "gap-2"
                }`}
              >
                <span
                  className={`block shrink-0 rounded-full shadow-[0_0_10px_currentColor] ${
                    featured ? "h-3 w-3" : compact ? "h-2.5 w-2.5" : "h-3 w-3"
                  } ${item.dot}`}
                />
                <span>{item.label}</span>
              </span>
              <span className={`shrink-0 text-right ${item.text}`}>
                <span
                  className={`block font-extrabold ${
                    featured ? "text-lg sm:text-xl" : compact ? "text-sm" : "text-base sm:text-lg"
                  }`}
                >
                  {n(item.value)}
                </span>
                {item.details.length > 0 && (
                  <span
                    className={`mt-1 flex flex-wrap justify-end ${
                      featured ? "gap-1.5" : "gap-1"
                    }`}
                  >
                    {item.details.map((detail) => (
                      <span
                        key={detail}
                        className={`rounded-md border border-emerald-200/80 bg-white/80 font-semibold text-emerald-900 ${
                          featured
                            ? "px-2 py-1 text-[10px] leading-tight sm:text-xs"
                            : compact
                              ? "px-1 py-0.5 text-[9px] leading-tight sm:text-[10px]"
                              : "px-2 py-1 text-xs sm:text-sm"
                        }`}
                      >
                        {detail}
                      </span>
                    ))}
                  </span>
                )}
              </span>
            </button>
          ))}
          </div>
        </div>
      </div>
      <div
        className={`flex w-full flex-wrap justify-between border-t border-emerald-100 font-semibold text-slate-600 ${
          featured
            ? "gap-x-3 gap-y-1.5 px-1 pt-2 text-xs sm:pt-3 sm:text-sm"
            : compact
              ? "gap-x-2 gap-y-1 px-1 pt-2 text-[11px]"
              : "mt-4 gap-x-4 gap-y-2 px-2 pt-3 text-sm sm:text-base"
        }`}
      >
        <span>{L("মাসিক সম্পন্ন", "Completed this month")}: {n(completed)} / {n(target)}</span>
        <span>{L("মোট প্রাপ্ত আবেদন", "Total applications received")}: {n(received)}</span>
      </div>
      {warning && (
        <p
          className={`text-center font-medium text-amber-800 ${
            featured ? "text-xs sm:text-sm" : compact ? "text-xs" : "mt-2 text-sm"
          }`}
        >
          {warning}
        </p>
      )}
      </section>
      <Dialog open={selectedReport !== null} onOpenChange={(open) => !open && setSelectedReport(null)}>
        <DialogContent
          className={`mx-auto w-[calc(100%-2rem)] max-w-[1100px] gap-3 rounded-2xl border border-white/70 bg-white/95 p-4 shadow-2xl backdrop-blur-md sm:p-5 ${
            selectedReport === "advanced"
              ? "max-h-[90vh] overflow-y-auto"
              : "max-h-[calc(100dvh-1rem)] overflow-hidden"
          }`}
        >
          <DialogHeader className="rounded-xl border border-emerald-100 bg-gradient-to-r from-emerald-50 via-white to-blue-50 p-3 pr-8">
            <DialogTitle className="text-2xl font-bold leading-tight sm:text-3xl">
              {selectedReport === "overall"
                ? monthlyProgressTitle
                : selectedReport === "advanced"
                  ? L("উন্নত নিবন্ধন প্রতিবেদন", "Advanced registration report")
                : selectedStatus?.label}
            </DialogTitle>
            <DialogDescription className="text-base leading-snug">
              {selectedReport === "advanced"
                ? L(
                    "মাস্টার ডেটা থেকে তারিখ, নিবন্ধনের অবস্থা ও জন্মের পর দিনের সীমা অনুযায়ী রেকর্ড দেখুন।",
                    "Filter authorized master-dataset records by date, status, and days from birth.",
                  )
                : L(
                    "জন্ম ও মৃত্যু আবেদনের মাসিক লক্ষ্যমাত্রার তুলনামূলক প্রতিবেদন।",
                    "Monthly status report compared with birth and death targets.",
                  )}
            </DialogDescription>
          </DialogHeader>
          {selectedReport === "overall" ? (
            <div className="space-y-2">
              <div className="grid gap-3 md:grid-cols-3">
              {reportStatuses.map((item) => (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedReport(item.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedReport(item.id);
                    }
                  }}
                  aria-label={L(`${item.label} বিস্তারিত দেখুন`, `View ${item.label} breakdown`)}
                  className={`cursor-pointer rounded-2xl border p-3 text-left shadow-lg shadow-slate-900/5 transition hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${item.classes}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-2xl font-bold leading-tight">{item.label}</p>
                    <span className={`rounded-full bg-white/80 px-2.5 py-0.5 text-3xl font-extrabold shadow-sm ${item.text}`}>
                      {n(item.value)}
                    </span>
                  </div>
                  <p className="mt-1 text-base font-bold uppercase tracking-wide text-slate-700">
                    {L("মোট", "Total")}: {n(item.value)}
                  </p>
                  <div className="mt-2 space-y-2">
                  {(["birth", "death"] as const).map((type) => {
                    const value = countForStatus(item.id, type);
                    const typeTarget = getMonthlyStatusProgress(counts[type], targets[type], item.id);
                    return (
                      <div key={type} className="flex items-center gap-2">
                        <span
                          className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 text-lg font-bold ${
                            type === "birth"
                              ? "border-blue-200 bg-blue-100 text-blue-800"
                              : "border-slate-200 bg-slate-100 text-slate-700"
                          }`}
                        >
                          {type === "birth" ? L("জন্ম", "Birth") : L("মৃত্যু", "Death")}
                        </span>
                        <MetricProgress
                          value={value}
                          target={typeTarget.denominator}
                          color={type === "birth" ? "bg-blue-500" : "bg-slate-500"}
                          trackColor={type === "birth" ? "bg-blue-100" : "bg-slate-200"}
                        />
                      </div>
                    );
                  })}
                  </div>
                </div>
              ))}
              <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-3 shadow-lg shadow-emerald-900/5 md:col-span-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-2xl font-bold leading-tight text-emerald-950">
                      {L("লক্ষ্যমাত্রা সম্পন্ন", "Target completed")}
                    </p>
                    <p className="text-base font-semibold text-slate-700">
                      {L("মোট প্রাপ্ত আবেদন", "Total applications received")}: {n(received)}
                    </p>
                  </div>
                  <span className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-3xl font-extrabold text-emerald-800 shadow-sm">
                    {n(completed)} / {n(target)} · {n(completion)}%
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-emerald-100 shadow-inner" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, completion)} aria-label={`${n(completion)}%`}>
                  <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 shadow-sm transition-[width] duration-700 ease-out" style={{ width: `${Math.min(100, completion)}%` }} />
                </div>
              </div>
              </div>
              {reportsEnabled && (
                <div className="grid gap-2 md:grid-cols-3">
                  <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white p-3 shadow-lg shadow-blue-900/5">
                    <p className="text-base font-bold leading-tight text-cyan-950">
                      {L("৪৫ দিনের মধ্যে জন্ম নিবন্ধন", "Births registered within 45 days")}
                    </p>
                    <p className="text-3xl font-extrabold text-blue-900">{n(within45Days)}</p>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-blue-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={reportCases.length ? Math.round((within45Days / reportCases.length) * 100) : 0} aria-label={L("মোট রেকর্ডের অনুপাত", "Share of total records")}>
                      <div className="h-full rounded-full bg-blue-500" style={{ width: `${reportCases.length ? Math.min(100, (within45Days / reportCases.length) * 100) : 0}%` }} />
                    </div>
                    <button
                      type="button"
                      className="mt-1 text-base font-bold text-blue-800 underline underline-offset-4 hover:text-blue-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                      onClick={() => {
                        setReportType("birth");
                        setReportStatus("completed");
                        setReportFromDate("");
                        setReportToDate("");
                        setReportThreshold("45");
                        setSelectedReport("advanced");
                      }}
                    >
                      {L("রেকর্ড দেখুন", "View records")}
                    </button>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-3 shadow-lg shadow-slate-900/5">
                    <p className="text-base font-bold leading-tight text-blue-950">
                      {L("বর্তমান শর্তে মিলে যাওয়া রেকর্ড", "Records matching current filters")}
                    </p>
                    <p className="text-3xl font-extrabold text-slate-900">{n(reportRows.length)}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-base font-bold leading-tight text-slate-800">
                      {L("মাস্টার ডেটার আবেদন", "Applications in the master dataset")}
                    </p>
                    <p className="text-3xl font-bold text-slate-900">{n(reportCases.length)}</p>
                  </div>
                  <Button
                    type="button"
                    className="text-lg font-medium md:col-span-3"
                    onClick={() => setSelectedReport("advanced")}
                  >
                    {L("উন্নত প্রতিবেদন তৈরি করুন", "Open advanced report")}
                  </Button>
                </div>
              )}
            </div>
          ) : selectedStatus ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {(["birth", "death"] as const).map((type) => {
                const value = countForStatus(selectedStatus.id, type);
                const typeTarget = targets[type];
                return (
                  <div key={type} className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 shadow-lg shadow-slate-900/5">
                    <span className={`inline-flex rounded-full border px-3 py-1 text-sm font-bold ${type === "birth" ? "border-blue-200 bg-blue-100 text-blue-800" : "border-slate-200 bg-slate-100 text-slate-700"}`}>
                      {type === "birth" ? L("জন্ম আবেদন", "Birth applications") : L("মৃত্যু আবেদন", "Death applications")}
                    </span>
                    <div className="mt-4">
                      <MetricProgress
                        value={value}
                        target={typeTarget}
                        color={type === "birth" ? "bg-blue-500" : "bg-slate-500"}
                        trackColor={type === "birth" ? "bg-blue-100" : "bg-slate-200"}
                      />
                    </div>
                  </div>
                );
              })}
              <p className="text-lg font-semibold text-slate-700 md:col-span-3">
                {L("মোট", "Total")}: {n(selectedStatus.value)}
              </p>
            </div>
          ) : selectedReport === "advanced" ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <label className="space-y-1 text-lg font-medium">
                  <span>{L("আবেদনের ধরন", "Application type")}</span>
                  <Select value={reportType} onValueChange={(value) => setReportType(value as AdvancedReportFilters["type"])}>
                    <SelectTrigger aria-label={L("আবেদনের ধরন", "Application type")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{L("সব ধরন", "All types")}</SelectItem>
                      <SelectItem value="birth">{L("জন্ম", "Birth")}</SelectItem>
                      <SelectItem value="death">{L("মৃত্যু", "Death")}</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
                <label className="space-y-1 text-lg font-medium">
                  <span>{L("নিবন্ধনের অবস্থা", "Registration status")}</span>
                  <Select value={reportStatus} onValueChange={(value) => setReportStatus(value as AdvancedReportFilters["status"])}>
                    <SelectTrigger aria-label={L("নিবন্ধনের অবস্থা", "Registration status")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{L("সব অবস্থা", "All statuses")}</SelectItem>
                      <SelectItem value="pending">{L("জমা হয়েছে", "Submitted")}</SelectItem>
                      <SelectItem value="progress">{L("প্রক্রিয়াধীন", "In progress")}</SelectItem>
                      <SelectItem value="completed">{L("নিবন্ধন সম্পন্ন", "Completed")}</SelectItem>
                      <SelectItem value="rejected">{L("বাতিল", "Rejected")}</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
                <label className="space-y-1 text-lg font-medium">
                  <span>{L("জন্মের পর কত দিনের মধ্যে (ঐচ্ছিক)", "Within days of birth (optional)")}</span>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={reportThreshold}
                    onChange={(event) => setReportThreshold(event.target.value)}
                    aria-label={L("জন্মের পর কত দিনের মধ্যে", "Days after birth")}
                  />
                </label>
                <label className="space-y-1 text-lg font-medium">
                  <span>{L("তারিখের পরিসর — শুরু", "Date range — from")}</span>
                  <Input
                    type="date"
                    value={reportFromDate}
                    onChange={(event) => setReportFromDate(event.target.value)}
                  />
                </label>
                <label className="space-y-1 text-lg font-medium">
                  <span>{L("তারিখের পরিসর — শেষ", "Date range — to")}</span>
                  <Input
                    type="date"
                    value={reportToDate}
                    onChange={(event) => setReportToDate(event.target.value)}
                  />
                </label>
              </div>
              <p className="text-sm text-muted-foreground">
                {L(
                  "তারিখের পরিসর সম্পন্ন নিবন্ধনের তারিখ এবং অসম্পন্ন আবেদনের জমার তারিখ ধরে। দিনের সীমা শুধু সম্পন্ন জন্ম নিবন্ধনে প্রযোজ্য।",
                  "Date range uses the completion date for completed registrations and submission date for other applications. The day threshold applies only to completed birth registrations.",
                )}
              </p>
              {thresholdDays !== null && (!Number.isInteger(thresholdDays) || thresholdDays < 0) && (
                <p role="alert" className="text-lg font-medium text-destructive">
                  {L("দিনের সীমা শূন্য বা তার বেশি পূর্ণসংখ্যা হতে হবে।", "Enter a whole-number day threshold of zero or more.")}
                </p>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-lg font-semibold text-emerald-950">
                  {L("মিল পাওয়া রেকর্ড", "Matching records")}: {n(reportRows.length)}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  disabled={reportRows.length === 0}
                  onClick={() =>
                    downloadCSV(
                      [
                        [
                          L("আবেদন আইডি", "Application ID"),
                          L("নাম", "Name"),
                          L("ধরন", "Type"),
                          L("অবস্থা", "Status"),
                          L("জন্ম তারিখ", "Date of birth"),
                          L("নিবন্ধন / জমার তারিখ", "Registration / submission date"),
                          L("জন্মের পর দিন", "Days from birth"),
                        ],
                        ...reportRows.map(({ item, registrationDate, daysFromBirth }) => [
                          item.id,
                          L(item.name.bn, item.name.en),
                          L(item.type === "birth" ? "জন্ম" : "মৃত্যু", item.type),
                          L(
                            {
                              pending: "জমা হয়েছে",
                              progress: "প্রক্রিয়াধীন",
                              completed: "নিবন্ধন সম্পন্ন",
                              rejected: "বাতিল",
                            }[item.status],
                            item.status,
                          ),
                          item.dob,
                          registrationDate ?? "",
                          daysFromBirth ?? "",
                        ]),
                      ],
                      "advanced-registration-report.csv",
                    )
                  }
                >
                  {L("CSV ডাউনলোড", "Download CSV")}
                </Button>
              </div>
              <div className="max-h-[40vh] overflow-auto rounded-lg border">
                <table className="w-full min-w-[48rem] text-left text-base">
                  <thead className="sticky top-0 bg-slate-100 text-sm">
                    <tr>
                      <th className="p-2">{L("আবেদনকারী / শিশু", "Applicant / child")}</th>
                      <th className="p-2">{L("ধরন", "Type")}</th>
                      <th className="p-2">{L("অবস্থা", "Status")}</th>
                      <th className="p-2">{L("জন্ম তারিখ", "Date of birth")}</th>
                      <th className="p-2">{L("নিবন্ধন / জমার তারিখ", "Registration / submission date")}</th>
                      <th className="p-2">{L("জন্মের পর দিন", "Days from birth")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportRows.map(({ item, registrationDate, daysFromBirth }) => (
                      <tr key={item.id} className="border-t">
                        <td className="p-2">
                          <span className="block font-medium">{L(item.name.bn, item.name.en)}</span>
                          <span className="text-sm text-muted-foreground">{item.id}</span>
                        </td>
                        <td className="p-2">{L(item.type === "birth" ? "জন্ম" : "মৃত্যু", item.type)}</td>
                        <td className="p-2">
                          {L(
                            {
                              pending: "জমা হয়েছে",
                              progress: "প্রক্রিয়াধীন",
                              completed: "নিবন্ধন সম্পন্ন",
                              rejected: "বাতিল",
                            }[item.status],
                            item.status,
                          )}
                        </td>
                        <td className="p-2">{item.dob}</td>
                        <td className="p-2">{registrationDate ?? L("তারিখ নেই", "No date")}</td>
                        <td className="p-2">{daysFromBirth === null ? "—" : n(daysFromBirth)}</td>
                      </tr>
                    ))}
                    {reportRows.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-muted-foreground">
                          {L("নির্বাচিত শর্তে কোনো রেকর্ড নেই।", "No records match the selected criteria.")}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-2">
            {selectedReport === "advanced" && (
              <Button variant="outline" onClick={() => setSelectedReport("overall")} className="text-lg font-medium">
                {L("সারাংশে ফিরে যান", "Back to summary")}
              </Button>
            )}
            <Button
              variant="outline"
              onClick={printCurrentReport}
              className="border-emerald-200 text-lg font-medium text-emerald-800 hover:bg-emerald-50"
            >
              <Printer className="mr-2 h-4 w-4" />
              {L("প্রিন্ট রিপোর্ট", "Print report")}
            </Button>
            <Button variant="outline" onClick={() => setSelectedReport(null)} className="text-lg font-medium">
              {L("বন্ধ করুন", "Close")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
