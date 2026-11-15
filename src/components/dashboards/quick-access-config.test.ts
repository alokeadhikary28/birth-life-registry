import { describe, expect, it } from "vitest";
import { getQuickAccessActionsForRole } from "./quick-access-config";
import type { Role } from "@/lib/types";

const expectedActions = [
  ["শিশুর জন্ম তথ্য ও ডকুমেন্টস আপলোড", "নতুন জন্ম তথ্য ও পরিদর্শনের ছবি জমা দিন"],
  ["মৃত ব্যক্তির তথ্য ও ডকুমেন্টস আপলোড", "নতুন মৃত্যু তথ্য ও পরিদর্শনের ছবি জমা দিন"],
  ["জন্ম নিবন্ধনের আবেদন তালিকা", "ওয়ার্ডের জন্ম আবেদন ও পরিদর্শন ছবি"],
  ["মৃত্যু নিবন্ধনের আবেদন তালিকা", "ওয়ার্ডের মৃত্যু আবেদন ও পরিদর্শন ছবি"],
  ["রিপোর্ট প্রস্তুত করুন", "নিবন্ধন প্রতিবেদন তৈরি, ডাউনলোড বা প্রিন্ট করুন"],
  ["স্মার্ট মনিটরিং সিস্টেম", "সার্বিক অগ্রগতি, টার্গেট ও ডাটা মনিটরিং"],
  ["অভিযোগ ও পরামর্শ", "অভিযোগ বা পরামর্শ জমা দিন"],
];

describe("role-based quick access actions", () => {
  it("shows the seven shortcuts in the required order for every dashboard role", () => {
    const roles: Array<Role | "public"> = [
      "public",
      "worker",
      "police",
      "admin",
      "uno",
      "district",
      "super",
    ];

    for (const role of roles) {
      expect(
        getQuickAccessActionsForRole(role).map(({ titleBn, descriptionBn }) => [
          titleBn,
          descriptionBn,
        ]),
      ).toEqual(expectedActions);
    }
  });

  it("preserves role-specific report and monitoring destinations", () => {
    expect(getQuickAccessActionsForRole("public")[4]?.id).toBe("reports");
    expect(getQuickAccessActionsForRole("uno")[4]?.id).toBe("reports");
    expect(getQuickAccessActionsForRole("worker")[4]?.id).toBe("worker-report");

    expect(getQuickAccessActionsForRole("admin")[5]?.link).toBe("/union-master");
    expect(getQuickAccessActionsForRole("uno")[5]?.link).toBe("/monitoring");
    expect(getQuickAccessActionsForRole("worker")[5]?.link).toBeUndefined();
  });
});
