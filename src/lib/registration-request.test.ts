import { describe, expect, it } from "vitest";
import {
  getExecutiveJurisdiction,
  getExecutiveJurisdictionByName,
  staffRegistrationRequestSchema,
} from "./registration-request";

const request = {
  fullName: "Staff Applicant",
  email: "applicant@example.com",
  category: "উচ্চ পর্যায়ের নির্বাহী প্যানেল",
  requestedPosition: "uno",
  jurisdictionId: "manirampur_upazila",
};

describe("staff registration request validation", () => {
  it("accepts requests without an office name and ignores legacy values", () => {
    const parsed = staffRegistrationRequestSchema.safeParse({
      ...request,
      officeName: "Legacy Office",
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).not.toHaveProperty("officeName");
  });

  it("accepts executive jurisdiction without a union ID", () => {
    expect(staffRegistrationRequestSchema.safeParse(request).success).toBe(true);
    expect(
      staffRegistrationRequestSchema.safeParse({
        ...request,
        unionId: "mn-dhakuria",
      }).success,
    ).toBe(false);
  });

  it("rejects a jurisdiction that does not match the selected position", () => {
    expect(
      staffRegistrationRequestSchema.safeParse({
        ...request,
        jurisdictionId: "jashore_district",
      }).success,
    ).toBe(false);
  });

  it("keeps ordinary requests union-scoped", () => {
    const ordinary = {
      ...request,
      category: "স্বাস্থ্যকর্মী",
      requestedPosition: undefined,
      jurisdictionId: undefined,
    };
    expect(staffRegistrationRequestSchema.safeParse(ordinary).success).toBe(false);
    expect(
      staffRegistrationRequestSchema.safeParse({
        ...ordinary,
        unionId: "mn-dhakuria",
      }).success,
    ).toBe(true);
  });

  it("resolves only supported position-jurisdiction pairs", () => {
    expect(getExecutiveJurisdiction("khulna_division", "divisional_commissioner")?.en).toBe(
      "Khulna Division",
    );
    expect(getExecutiveJurisdiction("khulna_division", "uno")).toBeUndefined();
    expect(getExecutiveJurisdictionByName("Khulna Division", "divisional_commissioner")?.id).toBe(
      "khulna_division",
    );
    expect(getExecutiveJurisdictionByName("Khulna Division", "uno")).toBeUndefined();
  });
});
