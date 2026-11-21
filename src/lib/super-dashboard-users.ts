import type { User } from "./types";

export const SUPER_USER_LIST_PANELS = [
  "users-all",
  "users-worker",
  "users-police",
  "users-admin",
  "users-municipal",
  "users-uno",
  "users-ddlg",
  "users-dc",
  "users-commissioner",
] as const;

export type SuperUserListPanel = (typeof SUPER_USER_LIST_PANELS)[number];
export type SuperUserAccountStatus = "pending" | "approved" | "suspended" | "cancelled";

export function getSuperUserAccountStatus(
  user: Pick<User, "approvalStatus" | "active">,
): SuperUserAccountStatus {
  if (user.approvalStatus === "pending") return "pending";
  if (user.approvalStatus === "suspended") return "suspended";
  if (user.approvalStatus === "cancelled" || user.approvalStatus === "rejected") {
    return "cancelled";
  }
  if (user.approvalStatus === "approved" || user.active === true) return "approved";
  return "pending";
}

export function isSuperUserListPanel(panel: string): panel is SuperUserListPanel {
  return SUPER_USER_LIST_PANELS.some((candidate) => candidate === panel);
}

export function filterSuperUsers(users: readonly User[], panel: SuperUserListPanel): User[] {
  return users.filter((user) => {
    switch (panel) {
      case "users-worker":
        return user.role === "worker";
      case "users-police":
        return user.role === "police";
      case "users-admin":
        return user.role === "admin" && !user.executivePosition;
      case "users-municipal":
        return user.role === "admin" && user.executivePosition === "municipal_executive_officer";
      case "users-uno":
        return user.role === "uno";
      case "users-ddlg":
        return user.role === "district" && user.executivePosition === "ddlg";
      case "users-dc":
        return user.role === "district" && user.executivePosition === "dc";
      case "users-commissioner":
        return user.role === "district" && user.executivePosition === "divisional_commissioner";
      case "users-all":
        return true;
    }
  });
}
