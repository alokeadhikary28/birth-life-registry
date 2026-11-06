export const PREVIEW_ROLES = [
  "main",
  "health_worker",
  "village_police",
  "up_official",
  "up_secretary",
  "up_chairman",
  "municipal_secretary",
  "city_zonal_officer",
  "municipal_executive_officer",
  "uno",
  "ddlg",
  "dc",
  "ddlg_dc",
  "divisional_commissioner",
  "addl_registrar_general",
  "city_corporation_ceo",
  "registrar_general",
] as const;

export type PreviewRole = (typeof PREVIEW_ROLES)[number];

export const EXECUTIVE_PREVIEW_ROLES = [
  "municipal_executive_officer",
  "uno",
  "ddlg",
  "dc",
  "addl_registrar_general",
  "city_corporation_ceo",
  "divisional_commissioner",
  "registrar_general",
] as const satisfies readonly PreviewRole[];

export type ExecutivePreviewRole = (typeof EXECUTIVE_PREVIEW_ROLES)[number];

export const EXECUTIVE_POSITIONS = [
  { role: "municipal_executive_officer", bn: "পৌর নির্বাহী কর্মকর্তা", en: "Municipal Executive Officer" },
  { role: "uno", bn: "ইউএনও (UNO)", en: "Upazila Nirbahi Officer (UNO)" },
  { role: "ddlg", bn: "ডিডিএলজি (DDLG)", en: "Deputy Director, Local Government (DDLG)" },
  { role: "dc", bn: "ডিসি (DC)", en: "District Commissioner (DC)" },
  { role: "addl_registrar_general", bn: "অতিরিক্ত রেজিস্টার জেনারেল", en: "Additional Registrar General" },
  { role: "city_corporation_ceo", bn: "সিটি কর্পোরেশনের প্রধান নির্বাহী কর্মকর্তা", en: "CEO of City Corporation" },
  { role: "divisional_commissioner", bn: "বিভাগীয় কমিশনার", en: "Divisional Commissioner" },
  { role: "registrar_general", bn: "রেজিস্টার জেনারেল", en: "Registrar General" },
] as const satisfies readonly {
  role: ExecutivePreviewRole;
  bn: string;
  en: string;
}[];

export const EXECUTIVE_ROLE_BY_POSITION = {
  municipal_executive_officer: "admin",
  uno: "uno",
  ddlg: "district",
  dc: "district",
  addl_registrar_general: "super",
  city_corporation_ceo: "admin",
  divisional_commissioner: "district",
  registrar_general: "super",
} as const satisfies Record<
  ExecutivePreviewRole,
  "admin" | "uno" | "district" | "super"
>;

export const POLICY_READ_ONLY_ROLES = [
  "up_chairman",
  "municipal_secretary",
  "city_zonal_officer",
  "municipal_executive_officer",
  "uno",
  "ddlg",
  "dc",
  "ddlg_dc",
  "divisional_commissioner",
  "addl_registrar_general",
  "city_corporation_ceo",
  "registrar_general",
] as const satisfies readonly PreviewRole[];

export function isPolicyReadOnlyRole(value: unknown): value is (typeof POLICY_READ_ONLY_ROLES)[number] {
  return typeof value === "string" && POLICY_READ_ONLY_ROLES.some((role) => role === value);
}

export function isPreviewRole(value: unknown): value is PreviewRole {
  return typeof value === "string" && PREVIEW_ROLES.some((role) => role === value);
}
