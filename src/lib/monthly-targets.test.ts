import { describe, expect, it } from "vitest";
import {
  getCompletionPercent,
  getDhakaMonthYear,
  getMonthlyStationCaseCounts,
  getMonthlyStatusProgress,
} from "./monthly-targets";
import { seedState } from "./seed";

describe("union monthly target helpers", () => {
  it("uses the Bangladesh calendar month when building the month key", () => {
    expect(getDhakaMonthYear(new Date("2026-09-30T19:00:00.000Z"))).toBe("2026-10-01");
  });

  it("calculates combined birth and death target completion", () => {
    expect(getCompletionPercent(28, 9, 56, 18)).toBe(50);
    expect(getCompletionPercent(80, 20, 56, 18)).toBe(135);
    expect(getCompletionPercent(1, 1, 0, 0)).toBe(0);
  });

  it("compares station submissions to target and statuses to total applications", () => {
    const counts = { pending: 2, progress: 1, completed: 3, total: 8 };
    expect(getMonthlyStatusProgress(counts, 10, "submitted")).toEqual({
      value: 8,
      denominator: 10,
      percentage: 80,
    });
    expect(getMonthlyStatusProgress(counts, 10, "completed")).toEqual({
      value: 3,
      denominator: 8,
      percentage: 38,
    });
    expect(getMonthlyStatusProgress(counts, 10, "progress")).toEqual({
      value: 3,
      denominator: 8,
      percentage: 38,
    });
  });

  it("counts assigned union submissions and completions in Dhaka month consistently", () => {
    const base = seedState().cases[0]!;
    const cases = [
      {
        ...base,
        id: "submitted-pending",
        upazilaId: "manirampur",
        stationId: "mn-dhakuria",
        unionId: "mn-dhakuria",
        createdAt: Date.parse("2026-10-10T12:00:00+06:00"),
        status: "pending" as const,
      },
      {
        ...base,
        id: "submitted-progress",
        upazilaId: "manirampur",
        stationId: "mn-dhakuria",
        unionId: "mn-dhakuria",
        createdAt: Date.parse("2026-10-12T12:00:00+06:00"),
        status: "progress" as const,
      },
      {
        ...base,
        id: "submitted-last-moment-of-month",
        upazilaId: "manirampur",
        stationId: "mn-dhakuria",
        unionId: "mn-dhakuria",
        createdAt: Date.parse("2026-10-31T23:59:59+06:00"),
        status: "pending" as const,
      },
      {
        ...base,
        id: "submitted-first-moment-of-next-month",
        upazilaId: "manirampur",
        stationId: "mn-dhakuria",
        unionId: "mn-dhakuria",
        createdAt: Date.parse("2026-11-01T00:00:00+06:00"),
        status: "pending" as const,
      },
      {
        ...base,
        id: "completed-this-month",
        upazilaId: "manirampur",
        stationId: "mn-dhakuria",
        unionId: "mn-dhakuria",
        createdAt: Date.parse("2026-09-20T12:00:00+06:00"),
        completedAt: Date.parse("2026-10-15T12:00:00+06:00"),
        status: "completed" as const,
      },
      {
        ...base,
        id: "other-union",
        upazilaId: "manirampur",
        stationId: "mn-rohita",
        unionId: "mn-rohita",
        createdAt: Date.parse("2026-10-15T12:00:00+06:00"),
        status: "pending" as const,
      },
    ];

    expect(
      getMonthlyStationCaseCounts(cases, "manirampur", "mn-dhakuria", "2026-10-01"),
    ).toEqual({
      birth: { pending: 2, progress: 1, completed: 1, total: 3 },
      death: { pending: 0, progress: 0, completed: 0, total: 0 },
    });
  });
});
