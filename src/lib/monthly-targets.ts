import type { RegCase } from "./types";

export function getDhakaMonthYear(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  if (!year || !month) {
    throw new Error("Could not determine the current Bangladesh month");
  }
  return `${year}-${month}-01`;
}

export function getMonthlyStationCaseCounts(
  cases: readonly RegCase[],
  upazilaId: string,
  stationId: string,
  monthYear: string,
) {
  const counts = {
    birth: { pending: 0, progress: 0, completed: 0, total: 0 },
    death: { pending: 0, progress: 0, completed: 0, total: 0 },
  };
  const monthStart = new Date(`${monthYear.slice(0, 7)}-01T00:00:00+06:00`).getTime();
  const year = Number(monthYear.slice(0, 4));
  const month = Number(monthYear.slice(5, 7));
  const monthEndTime = Date.UTC(year, month, 1) - 6 * 60 * 60 * 1000;

  for (const item of cases) {
    if (
      item.upazilaId !== upazilaId ||
      (item.stationId ?? item.unionId) !== stationId
    ) continue;

    const typeCounts = counts[item.type];
    const submittedAt = item.createdAt;
    const completedAt = item.completedAt ?? item.createdAt;
    if (submittedAt >= monthStart && submittedAt < monthEndTime) {
      typeCounts.total += 1;
      if (item.status === "pending" || item.status === "progress") {
        typeCounts[item.status] += 1;
      }
    }
    if (
      item.status === "completed" &&
      completedAt >= monthStart &&
      completedAt < monthEndTime
    ) {
      typeCounts.completed += 1;
    }
  }
  return counts;
}

export function getCompletionPercent(
  achievedBirth: number,
  achievedDeath: number,
  targetBirth: number,
  targetDeath: number,
): number {
  const totalTarget = targetBirth + targetDeath;
  return totalTarget > 0
    ? Math.round(((achievedBirth + achievedDeath) / totalTarget) * 100)
    : 0;
}

export type MonthlyCaseStatusCounts = {
  pending: number;
  progress: number;
  completed: number;
  total?: number;
};

export type MonthlyStatusComparison = "submitted" | "completed" | "progress";

export function getMonthlyStatusProgress(
  counts: MonthlyCaseStatusCounts,
  target: number,
  status: MonthlyStatusComparison,
) {
  const total = counts.total ?? counts.pending + counts.progress + counts.completed;
  const value =
    status === "submitted"
      ? total
      : status === "completed"
        ? counts.completed
        : counts.pending + counts.progress;
  const denominator = status === "submitted" ? target : total;
  return {
    value,
    denominator,
    percentage: denominator ? Math.round((value / denominator) * 100) : 0,
  };
}
