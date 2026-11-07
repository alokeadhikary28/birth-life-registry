export type Role = "worker" | "admin" | "police" | "uno" | "super" | "district";
export type Bi = { bn: string; en: string };

export interface Village {
  id: string;
  bn: string;
  en: string;
  poBn: string;
  poEn: string;
  ward: number;
}
export interface Union {
  id: string;
  bn: string;
  en: string;
  villages: Village[];
}
export interface Upazila {
  id: string;
  bn: string;
  en: string;
  districtBn: string;
  districtEn: string;
  divisionBn: string;
  divisionEn: string;
  unions: Union[];
}

export interface AdministrativeArea {
  id: string;
  level:
    "division" | "district" | "upazila" | "city_corporation" | "union" | "municipality" | "ward";
  bn: string;
  en: string;
  parentId: string | null;
  divisionId: string;
  districtId: string | null;
  municipalityId: string | null;
  upazilaId: string | null;
  cityCorporationId?: string | null;
  unionId: string | null;
  wardNumber: number | null;
  wardCount?: number;
  wardNumbers?: readonly number[];
}

export interface User {
  id: string;
  name: Bi;
  role: Role;
  active?: boolean | undefined;
  mobile?: string | undefined;
  email?: string | undefined;
  password?: string;
  upazilaId: string;
  stationId?: string | undefined;
  unionId?: string | undefined;
  ward?: number | undefined;
  districtId?: string | undefined;
}

export interface Remark {
  by: string;
  role: Role;
  text: string;
  at: number;
}
export type Status = "pending" | "progress" | "completed" | "rejected";

export interface CaseDetails {
  fatherBrn?: string | undefined;
  motherBrn?: string | undefined;
  fatherDob?: string | undefined;
  motherDob?: string | undefined;
  birthPlace?: Bi | undefined;
  deathPlace?: Bi | undefined;
  presentAddress?: Bi | undefined;
  permanentAddress?: Bi | undefined;
  addressHolding?: string | undefined;
  presentVillageId?: string | undefined;
  permanentVillageId?: string | undefined;
  presentAddressHolding?: string | undefined;
  permanentAddressHolding?: string | undefined;
  spouseName?: Bi | undefined;
  applicantName?: Bi | undefined;
  applicantRelationship?: Bi | undefined;
  applicantNameBn?: string | undefined;
  applicantRelationshipBn?: string | undefined;
  childBrn?: string | undefined;
  correctedAt?: string | undefined;
}

export interface FieldVisitDay {
  day: 1 | 2 | 3 | 4;
  capturedAt: string;
  latitude: number;
  longitude: number;
  photo: {
    name: string;
    size: number;
    path?: string | undefined;
    dataUrl?: string | undefined;
  };
}

export interface PoliceTask {
  epiCard?: boolean | undefined;
  parentNid?: boolean | undefined;
  collected?: boolean | undefined;
  collectedAt?: number | undefined;
  assignedPoliceId?: string | undefined;
  assignedAt?: string | undefined;
  assignedBy?: string | undefined;
  fieldVisitDays?: FieldVisitDay[] | undefined;
  directApproval?: boolean | undefined;
}

export interface CaseFileMetadata {
  fieldVisit?: {
    capturedAt: string;
    latitude?: number | undefined;
    longitude?: number | undefined;
  } | undefined;
}

export interface RegCase {
  details?: CaseDetails | undefined;
  id: string;
  type: "birth" | "death";
  name: Bi;
  father: Bi;
  mother: Bi;
  nid: string; // parent NID (birth) or deceased NID/BRN (death)
  parentMobile?: string | undefined;
  gender: "male" | "female" | "other";
  dob: string;
  order?: string | undefined;
  dod?: string | undefined;
  cause?: Bi | undefined;
  villageId: string;
  files: {
    name: string;
    size: number;
    path?: string;
    url?: string;
    dataUrl?: string;
    mimeType?: string;
    fieldVisit?: CaseFileMetadata["fieldVisit"];
  }[];
  filesPurged?: boolean | undefined;
  status: Status;
  regNo?: string | undefined;
  remarks: Remark[];
  police?: PoliceTask | undefined;
  createdBy: string;
  upazilaId: string;
  stationId?: string | undefined;
  unionId: string;
  ward: number;
  createdAt: number;
  completedAt?: number | undefined;
  synced: boolean;
  smsSent: boolean;
}

export interface AuditEntry {
  at: number;
  userId: string;
  action: string;
  caseId?: string | undefined;
}

export interface AppState {
  upazilas: Upazila[];
  users: User[];
  cases: RegCase[];
  audit: AuditEntry[];
  sessionId: string | null;
}

export const TARGET = { birth: 56, death: 18 };
