import { describe, expect, it } from "vitest";
import type { ExecutivePreviewRole } from "./dashboard-roles";
import type { Role, User } from "./types";
import { filterSuperUsers, getSuperUserAccountStatus } from "./super-dashboard-users";

function staff(id: string, role: Role, executivePosition?: ExecutivePreviewRole): User {
  return {
    id,
    name: { bn: id, en: id },
    role,
    upazilaId: "",
    executivePosition,
  };
}

describe("Super Admin role-specific staff lists", () => {
  const users = [
    staff("health", "worker"),
    staff("police", "police"),
    staff("up-admin", "admin"),
    staff("municipal-executive", "admin", "municipal_executive_officer"),
    staff("uno", "uno", "uno"),
    staff("ddlg", "district", "ddlg"),
    staff("dc", "district", "dc"),
    staff("commissioner", "district", "divisional_commissioner"),
  ];

  it("keeps local administrative and municipal executive users in separate lists", () => {
    expect(filterSuperUsers(users, "users-admin").map((user) => user.id)).toEqual(["up-admin"]);
    expect(filterSuperUsers(users, "users-municipal").map((user) => user.id)).toEqual([
      "municipal-executive",
    ]);
  });

  it("filters district executives by their saved position rather than base role", () => {
    expect(filterSuperUsers(users, "users-ddlg").map((user) => user.id)).toEqual(["ddlg"]);
    expect(filterSuperUsers(users, "users-dc").map((user) => user.id)).toEqual(["dc"]);
    expect(filterSuperUsers(users, "users-commissioner").map((user) => user.id)).toEqual([
      "commissioner",
    ]);
  });
});

describe("Super Admin account status", () => {
  it("maps approval, suspended, cancelled, and legacy rejected profiles", () => {
    expect(getSuperUserAccountStatus({ approvalStatus: "approved", active: true })).toBe(
      "approved",
    );
    expect(getSuperUserAccountStatus({ approvalStatus: "pending", active: false })).toBe("pending");
    expect(getSuperUserAccountStatus({ approvalStatus: "suspended", active: false })).toBe(
      "suspended",
    );
    expect(getSuperUserAccountStatus({ approvalStatus: "cancelled", active: false })).toBe(
      "cancelled",
    );
    expect(getSuperUserAccountStatus({ approvalStatus: "rejected", active: false })).toBe(
      "cancelled",
    );
  });
});
