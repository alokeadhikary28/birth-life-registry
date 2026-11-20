import { z } from "zod";
import { EXECUTIVE_PREVIEW_ROLES, type ExecutivePreviewRole } from "./dashboard-roles";

export const EXECUTIVE_CATEGORY = "উচ্চ পর্যায়ের নির্বাহী প্যানেল";

export const EXECUTIVE_JURISDICTIONS = [
  {
    id: "manirampur_upazila",
    bn: "মণিরামপুর উপজেলা",
    en: "Manirampur Upazila",
    positions: ["uno"],
  },
  {
    id: "jashore_district",
    bn: "যশোর জেলা",
    en: "Jashore District",
    positions: ["ddlg", "dc", "addl_registrar_general", "registrar_general"],
  },
  {
    id: "khulna_division",
    bn: "খুলনা বিভাগ",
    en: "Khulna Division",
    positions: ["divisional_commissioner"],
  },
  {
    id: "manirampur_paurasabha",
    bn: "মণিরামপুর পৌরসভা",
    en: "Manirampur Pourashava",
    positions: ["municipal_executive_officer"],
  },
  {
    id: "khulna_city_corporation",
    bn: "খুলনা সিটি কর্পোরেশন",
    en: "Khulna City Corporation",
    positions: ["city_corporation_ceo"],
  },
] as const satisfies readonly {
  id: string;
  bn: string;
  en: string;
  positions: readonly ExecutivePreviewRole[];
}[];

export function getExecutiveJurisdiction(jurisdictionId: string, position: ExecutivePreviewRole) {
  return EXECUTIVE_JURISDICTIONS.find(
    (jurisdiction) =>
      jurisdiction.id === jurisdictionId &&
      jurisdiction.positions.some((allowedPosition) => allowedPosition === position),
  );
}

export function getExecutiveJurisdictionByName(name: string, position: ExecutivePreviewRole) {
  return EXECUTIVE_JURISDICTIONS.find(
    (jurisdiction) =>
      jurisdiction.en === name &&
      jurisdiction.positions.some((allowedPosition) => allowedPosition === position),
  );
}

export const staffRegistrationRequestSchema = z
  .object({
    fullName: z.string().trim().min(1).max(100),
    email: z.string().trim().toLowerCase().email().max(255),
    mobile: z.string().trim().max(20).optional(),
    category: z.enum([
      "স্বাস্থ্যকর্মী",
      "গ্রাম পুলিশ",
      "ইউপি প্রশাসনিক কর্মকর্তা",
      EXECUTIVE_CATEGORY,
    ]),
    requestedPosition: z.enum(EXECUTIVE_PREVIEW_ROLES).optional(),
    unionId: z.string().trim().min(1).max(64).optional(),
    jurisdictionId: z.string().trim().min(1).max(64).optional(),
  })
  .superRefine((request, ctx) => {
    const isExecutive = request.category === EXECUTIVE_CATEGORY;
    if (isExecutive && !request.requestedPosition) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["requestedPosition"],
        message: "Executive position is required",
      });
    }
    if (!isExecutive && request.requestedPosition) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["requestedPosition"],
        message: "Executive position is only valid for the executive category",
      });
    }
    if (isExecutive && request.unionId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["unionId"],
        message: "Executive requests must use a jurisdiction, not a union",
      });
    }
    if (isExecutive && !request.jurisdictionId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["jurisdictionId"],
        message: "Executive jurisdiction is required",
      });
    }
    if (!isExecutive && request.jurisdictionId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["jurisdictionId"],
        message: "Ordinary staff requests must use a union",
      });
    }
    if (!isExecutive && !request.unionId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["unionId"],
        message: "Union is required",
      });
    }
    if (isExecutive && request.requestedPosition && request.jurisdictionId) {
      if (!getExecutiveJurisdiction(request.jurisdictionId, request.requestedPosition)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["jurisdictionId"],
          message: "Jurisdiction does not match the executive position",
        });
      }
    }
  });
