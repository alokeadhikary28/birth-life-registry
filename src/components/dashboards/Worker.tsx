import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  CloudOff,
  Download,
  Eye,
  FileImage,
  FileText,
  HeartPulse,
  Home,
  MessageSquareWarning,
  Pencil,
  Plus,
  Syringe,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCaseHelpers } from "@/components/shared";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { compressImage } from "@/lib/compress-image";
import { isValidBrn, normalizeBdDigits } from "@/lib/bd-identifiers";
import { checkCaseDuplicate } from "@/lib/case.functions";
import { getCaseDeadline, getDeadlineBand } from "@/lib/compliance";
import { downloadCSV, printPDF } from "@/lib/report";
import { getUnionVillages, resolveVillageAddress } from "@/lib/geography";
import { roleLabel, scopedCases, useApp } from "@/lib/store";
import type { Bi, CaseFileMetadata, RegCase, Union, Upazila, Village } from "@/lib/types";
import { UnifiedStationDashboardTop } from "./UnifiedStationDashboardTop";

const emptyBi: Bi = { bn: "", en: "" };
type CaseType = "birth" | "death";
type RegistrationDraft = {
  name: Bi;
  father: Bi;
  mother: Bi;
  spouseName: Bi;
  applicantNameBn: string;
  applicantRelationshipBn: string;
  cause: Bi;
  nid: string;
  mobile: string;
  gender: RegCase["gender"];
  dob: string;
  dod: string;
  order: string;
  fatherBrn: string;
  motherBrn: string;
  villageId: string;
  addressHolding: string;
};
type DialogState =
  | { kind: "form"; type: CaseType; entry?: RegCase | undefined }
  | { kind: "entries"; type: CaseType }
  | { kind: "epi" }
  | null;
type EpiVisit = Tables<"epi_visits">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBi(value: unknown): value is Bi {
  return (
    isRecord(value) &&
    typeof value["bn"] === "string" &&
    typeof value["en"] === "string"
  );
}

function readRegistrationDraft(key: string): Partial<RegistrationDraft> | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const stored = window.localStorage.getItem(key);
    if (!stored) return undefined;
    const value: unknown = JSON.parse(stored);
    if (!isRecord(value)) return undefined;
    const draft: Partial<RegistrationDraft> = {};
    for (const field of ["name", "father", "mother", "spouseName", "cause"] as const) {
      if (isBi(value[field])) draft[field] = value[field];
    }
    for (const field of ["applicantNameBn", "applicantRelationshipBn", "nid", "mobile", "dob", "dod", "order", "fatherBrn", "motherBrn", "villageId", "addressHolding"] as const) {
      if (typeof value[field] === "string") draft[field] = value[field];
    }
    if (
      value["gender"] === "male" ||
      value["gender"] === "female" ||
      value["gender"] === "other"
    ) {
      draft.gender = value["gender"];
    }
    return draft;
  } catch (cause) {
    console.error("Could not load registration draft", cause);
    return undefined;
  }
}

function normalizeDuplicateName(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function normalizeBengaliDigits(value: string) {
  return value.replace(/[০-৯]/g, (digit) =>
    String("০১২৩৪৫৬৭৮৯".indexOf(digit)),
  );
}

function childOrderLabel(order: number) {
  const bengaliNumber = String(order).replace(/\d/g, (digit) => "০১২৩৪৫৬৭৮৯".charAt(Number(digit)));
  const suffix = ["ম", "য়", "য়", "র্থ", "ম", "ষ্ঠ", "ম", "ম", "ম", "ম"][order - 1] ?? "তম";
  return `${bengaliNumber}${suffix} সন্তান`;
}

function configuredAddress(
  village: Village,
  union: Union,
  upazila: Upazila,
  holding: string,
): Bi {
  const holdingBn = holding.trim() ? `বাসা/হোল্ডিং: ${holding.trim()}` : "";
  const holdingEn = holding.trim() ? `House/holding: ${holding.trim()}` : "";
  return {
    bn: [
      village.bn,
      `${village.ward} নং ওয়ার্ড`,
      `ডাকঘর: ${village.poBn}`,
      union.bn,
      `${upazila.bn} উপজেলা`,
      `${upazila.districtBn} জেলা`,
      holdingBn,
    ].filter(Boolean).join(", "),
    en: [
      village.en,
      `Ward ${village.ward}`,
      `Post office: ${village.poEn}`,
      union.en,
      `${upazila.en} Upazila`,
      `${upazila.districtEn} District`,
      holdingEn,
    ].filter(Boolean).join(", "),
  };
}

function isValidIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function captureCoordinates(): Promise<{ latitude: number; longitude: number }> {
  if (!navigator.geolocation) {
    return Promise.reject(new Error("এই ডিভাইসে GPS পাওয়া যায়নি"));
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
      (error) => reject(new Error(error.message || "GPS লোকেশন পাওয়া যায়নি")),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  });
}

function FormRow({
  labelBn,
  labelEn,
  required = false,
  compact = false,
  inline = false,
  inlineProminent = false,
  inlineLarger = false,
  stacked = false,
  labelAccessory,
  children,
}: {
  labelBn: string;
  labelEn: string;
  required?: boolean;
  compact?: boolean;
  inline?: boolean;
  inlineProminent?: boolean;
  inlineLarger?: boolean;
  stacked?: boolean;
  labelAccessory?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className={
        stacked
          ? "grid min-w-0 gap-1"
          : inlineProminent
            ? "grid min-w-0 grid-cols-[max-content_minmax(0,1fr)] items-center gap-1"
            : inline
              ? "flex min-w-0 flex-row items-center gap-1"
              : compact
                ? "grid min-w-0 gap-1 lg:grid-cols-[8rem_minmax(0,1fr)] lg:items-center lg:gap-2"
                : "grid gap-2 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-start sm:gap-4"
      }
    >
      <div
        className={`flex items-start ${inline ? "shrink-0" : ""} ${labelAccessory ? "gap-2" : ""} ${
          stacked ? "" : compact ? "lg:pt-0" : "pt-2"
        }`}
      >
        {labelAccessory}
        <div className={inline ? "min-w-0 whitespace-nowrap" : "min-w-0"}>
          <p className={`${inline ? inlineProminent ? "text-base font-medium" : inlineLarger ? "text-lg font-semibold" : "text-xs font-bold" : compact ? "text-base font-bold" : "text-sm font-bold"} text-slate-800`}>
            {labelBn}{required && <span className="text-red-600"> *</span>}
          </p>
          <p className={`${inline ? "text-[10px]" : compact ? "text-sm" : "text-[11px]"} text-slate-500`}>{labelEn}</p>
        </div>
      </div>
      <div className={inlineProminent ? "min-w-0" : inline ? "min-w-0 flex-1" : "min-w-0"}>{children}</div>
    </div>
  );
}

function VillageAddressField({
  union,
  upazila,
  districtBn,
  districtEn,
  villageId,
  onVillageChange,
  holding,
  onHoldingChange,
  L,
  n,
}: {
  union: Union;
  upazila: Upazila;
  districtBn: string;
  districtEn: string;
  villageId: string;
  onVillageChange: (id: string) => void;
  holding: string;
  onHoldingChange: (value: string) => void;
  L: (bn: string, en: string) => string;
  n: (value: number | string) => string;
}) {
  const villages = getUnionVillages(upazila, union.id);
  const address = resolveVillageAddress(upazila, union.id, villageId);
  const resolvedUnion = address?.union ?? union;

  const details = [
    [L("ডাকঘর", "Post office"), address ? L(address.postOfficeBn, address.postOfficeEn) : ""],
    [L("ইউনিয়ন", "Union"), L(resolvedUnion.bn, resolvedUnion.en)],
    [L("উপজেলা", "Upazila"), L(upazila.bn, upazila.en)],
    [L("জেলা", "District"), L(districtBn, districtEn)],
  ];

  return (
    <fieldset className="min-w-0 space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/40 p-2">
      <legend className="px-1 text-sm font-bold text-slate-800">
        {L("গ্রাম/মহল্লা ও ঠিকানা", "Village/neighborhood address")}
        <span className="text-red-600"> *</span>
      </legend>
      <Label htmlFor="village-select" className="text-xs font-semibold">
        {L("গ্রাম/মহল্লা নির্বাচন", "Select village/neighborhood")}
      </Label>
      <Select value={villageId} onValueChange={onVillageChange} required>
        <SelectTrigger id="village-select" className="h-10 w-full min-w-0">
          <SelectValue placeholder={L("গ্রাম/মহল্লা নির্বাচন করুন", "Choose village/neighborhood")} />
        </SelectTrigger>
        <SelectContent>
          {villages.map((item) => (
            <SelectItem key={item.id} value={item.id}>{L(item.bn, item.en)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0 rounded-md bg-white px-2 py-1">
          <p className="text-[10px] font-medium text-slate-500">{L("ওয়ার্ড নং", "Ward number")}</p>
          <p className="truncate text-xs font-semibold text-slate-800">
            {address ? n(address.ward) : "—"}
          </p>
        </div>
        {details.map(([label, value]) => (
          <div key={label} className="min-w-0 rounded-md bg-white px-2 py-1">
            <p className="text-[10px] font-medium text-slate-500">{label}</p>
            <p className="truncate text-xs font-semibold text-slate-800">{value || "—"}</p>
          </div>
        ))}
      </div>
      <div>
        <Label htmlFor="address-holding" className="text-xs font-medium">
          {L("বাসা/হোল্ডিং নম্বর বা সড়ক (ঐচ্ছিক)", "House/holding number or road (optional)")}
        </Label>
        <Input
          id="address-holding"
          className="mt-1 h-9"
          maxLength={160}
          value={holding}
          onChange={(event) => onHoldingChange(event.target.value)}
        />
      </div>
    </fieldset>
  );
}

function BiField({
  label,
  labelEn,
  value,
  onChange,
  required = false,
  compact = false,
}: {
  label: string;
  labelEn?: string;
  value: Bi;
  onChange: (next: Bi) => void;
  required?: boolean;
  compact?: boolean;
}) {
  const fields = (
    <div className={compact ? "grid grid-cols-2 gap-2" : "grid grid-cols-1 gap-2 sm:grid-cols-2"}>
      <Input
        className={compact ? "h-12 px-3 text-base md:text-base placeholder:text-base" : undefined}
        aria-label={`${label} — বাংলা`}
        autoComplete="off"
        maxLength={100}
        placeholder="বাংলায় লিখুন"
        required={required}
        value={value.bn}
        onChange={(event) => onChange({ ...value, bn: event.target.value })}
      />
      <Input
        className={compact ? "h-12 px-3 text-base md:text-base placeholder:text-base" : undefined}
        aria-label={`${label} — English`}
        autoComplete="off"
        maxLength={100}
        placeholder="Enter in English (optional)"
        required={false}
        value={value.en}
        onChange={(event) => onChange({ ...value, en: event.target.value })}
      />
    </div>
  );
  if (labelEn) {
    return <FormRow labelBn={label} labelEn={labelEn} required={required} compact={compact}>{fields}</FormRow>;
  }
  return (
    <fieldset className="min-w-0 space-y-1">
      <legend className="text-xs font-semibold text-slate-700">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </legend>
      {fields}
    </fieldset>
  );
}

export function RegForm({
  type,
  entry,
  onSaved,
  onCancel,
  onEdit,
}: {
  type: CaseType;
  entry?: RegCase | undefined;
  onSaved: () => void;
  onCancel?: () => void;
  onEdit?: () => void;
}) {
  const { L, n, user, state, addCase, updateCase, demoMode, online, enterDemoLogin } = useApp();
  const checkForDuplicate = useServerFn(checkCaseDuplicate);
  const upazila = user ? state.upazilas.find((area) => area.id === user.upazilaId) : undefined;
  const union = upazila?.unions.find((area) => area.id === user?.unionId);
  const draftKey = `birth-life-registry:entry-draft:${user?.id ?? "unassigned"}:${type}:${entry?.id ?? "new"}`;
  const savedDraft = useMemo(() => readRegistrationDraft(draftKey), [draftKey]);
  const [name, setName] = useState<Bi>(savedDraft?.name ?? entry?.name ?? emptyBi);
  const [father, setFather] = useState<Bi>(savedDraft?.father ?? entry?.father ?? emptyBi);
  const [mother, setMother] = useState<Bi>(savedDraft?.mother ?? entry?.mother ?? emptyBi);
  const [spouseName, setSpouseName] = useState<Bi>(
    savedDraft?.spouseName ?? entry?.details?.spouseName ?? emptyBi,
  );
  const [applicantNameBn, setApplicantNameBn] = useState(
    savedDraft?.applicantNameBn ?? entry?.details?.applicantNameBn ?? entry?.details?.applicantName?.bn ?? "",
  );
  const [applicantRelationshipBn, setApplicantRelationshipBn] = useState(
    savedDraft?.applicantRelationshipBn ?? entry?.details?.applicantRelationshipBn ?? entry?.details?.applicantRelationship?.bn ?? "",
  );
  const [cause, setCause] = useState<Bi>(savedDraft?.cause ?? entry?.cause ?? emptyBi);
  const [nid, setNid] = useState(
    normalizeBengaliDigits(savedDraft?.nid ?? entry?.nid ?? ""),
  );
  const [mobile, setMobile] = useState(savedDraft?.mobile ?? entry?.parentMobile ?? "");
  const [gender, setGender] = useState<RegCase["gender"]>(savedDraft?.gender ?? entry?.gender ?? "male");
  const [dob, setDob] = useState(normalizeBengaliDigits(savedDraft?.dob ?? entry?.dob ?? ""));
  const [dod, setDod] = useState(normalizeBengaliDigits(savedDraft?.dod ?? entry?.dod ?? ""));
  const [order, setOrder] = useState(savedDraft?.order ?? entry?.order ?? "1");
  const [fatherBrn, setFatherBrn] = useState(savedDraft?.fatherBrn ?? entry?.details?.fatherBrn ?? "");
  const [motherBrn, setMotherBrn] = useState(savedDraft?.motherBrn ?? entry?.details?.motherBrn ?? "");
  const [villageId, setVillageId] = useState(savedDraft?.villageId ?? entry?.villageId ?? "");
  const [addressHolding, setAddressHolding] = useState(
    savedDraft?.addressHolding ?? entry?.details?.addressHolding ?? "",
  );
  const resolvedVillageAddress = resolveVillageAddress(upazila, union?.id, villageId);
  const selectedUnion = resolvedVillageAddress?.union ?? union;
  const selectedVillage = resolvedVillageAddress?.village ?? undefined;
  const [attachments, setAttachments] = useState<(File | null)[]>([null, null, null]);
  const [visitPhoto, setVisitPhoto] = useState<File | null>(null);
  const [visitPhotoMetadata, setVisitPhotoMetadata] =
    useState<CaseFileMetadata["fieldVisit"]>();
  const [gpsEnabled, setGpsEnabled] = useState(false);
  const gpsEnabledRef = useRef(false);
  const [visitPhotoLoading, setVisitPhotoLoading] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [filesChanged, setFilesChanged] = useState(false);
  const [compressing, setCompressing] = useState<number | null>(null);
  const [imagePreview, setImagePreview] = useState<{ src: string; title: string; objectUrl: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [error, setError] = useState("");
  const draftSaveErrorShown = useRef(false);
  const submissionSucceeded = useRef(false);
  const [activeDraftKey, setActiveDraftKey] = useState(draftKey);
  const oldFiles = entry?.files ?? [];
  const oldVisitPhoto = oldFiles.find((file) => file.fieldVisit);

  useEffect(() => {
    if (!imagePreview?.objectUrl) return;
    const objectUrl = imagePreview.src;
    return () => URL.revokeObjectURL(objectUrl);
  }, [imagePreview]);

  useEffect(() => {
    if (activeDraftKey === draftKey) return;
    const draft = readRegistrationDraft(draftKey);
    setName(draft?.name ?? entry?.name ?? emptyBi);
    setFather(draft?.father ?? entry?.father ?? emptyBi);
    setMother(draft?.mother ?? entry?.mother ?? emptyBi);
    setSpouseName(draft?.spouseName ?? entry?.details?.spouseName ?? emptyBi);
    setApplicantNameBn(
      draft?.applicantNameBn ??
        entry?.details?.applicantNameBn ??
        entry?.details?.applicantName?.bn ??
        "",
    );
    setApplicantRelationshipBn(
      draft?.applicantRelationshipBn ??
        entry?.details?.applicantRelationshipBn ??
        entry?.details?.applicantRelationship?.bn ??
        "",
    );
    setCause(draft?.cause ?? entry?.cause ?? emptyBi);
    setNid(normalizeBengaliDigits(draft?.nid ?? entry?.nid ?? ""));
    setMobile(draft?.mobile ?? entry?.parentMobile ?? "");
    setGender(draft?.gender ?? entry?.gender ?? "male");
    setDob(normalizeBengaliDigits(draft?.dob ?? entry?.dob ?? ""));
    setDod(normalizeBengaliDigits(draft?.dod ?? entry?.dod ?? ""));
    setOrder(draft?.order ?? entry?.order ?? "1");
    setFatherBrn(draft?.fatherBrn ?? entry?.details?.fatherBrn ?? "");
    setMotherBrn(draft?.motherBrn ?? entry?.details?.motherBrn ?? "");
    setVillageId(draft?.villageId ?? entry?.villageId ?? "");
    setAddressHolding(draft?.addressHolding ?? entry?.details?.addressHolding ?? "");
    setActiveDraftKey(draftKey);
  }, [activeDraftKey, draftKey, entry, type]);

  useEffect(() => {
    if (activeDraftKey !== draftKey || submissionSucceeded.current) return;
    const draft: RegistrationDraft = {
      name,
      father,
      mother,
      spouseName,
      applicantNameBn,
      applicantRelationshipBn,
      cause,
      nid,
      mobile,
      gender,
      dob,
      dod,
      order,
      fatherBrn,
      motherBrn,
      villageId,
      addressHolding,
    };
    const timeout = window.setTimeout(() => {
      try {
        window.localStorage.setItem(draftKey, JSON.stringify(draft));
        draftSaveErrorShown.current = false;
      } catch (causeError) {
        console.error("Could not save registration draft", causeError);
        if (!draftSaveErrorShown.current) {
          toast.error(
            L("খসড়া সংরক্ষণ করা যায়নি", "Could not save this form draft"),
          );
          draftSaveErrorShown.current = true;
        }
      }
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [
    activeDraftKey,
    applicantNameBn,
    applicantRelationshipBn,
    addressHolding,
    cause,
    dob,
    dod,
    draftKey,
    father,
    fatherBrn,
    gender,
    L,
    mobile,
    mother,
    motherBrn,
    name,
    nid,
    order,
    villageId,
    spouseName,
  ]);

  const chooseImage = async (index: number, file?: File) => {
    if (!file) return;
    setCompressing(index);
    setError("");
    try {
      const compressed = await compressImage(file);
      setAttachments((current) =>
        current.map((item, position) => (position === index ? compressed : item)),
      );
      setFilesChanged(true);
      toast.success(
        L(
          `ছবি সংকুচিত হয়েছে · ${Math.ceil(compressed.size / 1024)} KB`,
          `Image compressed · ${Math.ceil(compressed.size / 1024)} KB`,
        ),
      );
    } catch (causeError) {
      const message =
        causeError instanceof Error
          ? causeError.message
          : L("ছবি প্রস্তুত করা যায়নি", "Could not prepare image");
      setError(message);
      toast.error(message);
    } finally {
      setCompressing(null);
    }
  };

  const chooseVisitPhoto = async (file?: File) => {
    if (!file) return;
    const capturedAt = new Date().toISOString();
    setVisitPhotoLoading(true);
    setLocationError("");
    setError("");
    try {
      const compressed = await compressImage(file);
      let coordinates: { latitude: number; longitude: number } | undefined;
      if (gpsEnabledRef.current) {
        try {
          const currentCoordinates = await captureCoordinates();
          if (gpsEnabledRef.current) coordinates = currentCoordinates;
        } catch (causeError) {
          if (gpsEnabledRef.current) {
            const message = causeError instanceof Error ? causeError.message : "GPS লোকেশন পাওয়া যায়নি";
            setLocationError(message);
            toast.error(L(`GPS লোকেশন নেওয়া যায়নি: ${message}`, `Could not capture GPS location: ${message}`));
          }
        }
      }
      setVisitPhoto(compressed);
      setVisitPhotoMetadata({ capturedAt, ...coordinates });
      setFilesChanged(true);
      toast.success(
        L(
          `পরিদর্শনের ছবি প্রস্তুত · ${Math.ceil(compressed.size / 1024)} KB`,
          `Visit photo ready · ${Math.ceil(compressed.size / 1024)} KB`,
        ),
      );
    } catch (causeError) {
      const message =
        causeError instanceof Error
          ? causeError.message
          : L("পরিদর্শনের ছবি প্রস্তুত করা যায়নি", "Could not prepare the visit photo");
      setError(message);
      toast.error(message);
    } finally {
      setVisitPhotoLoading(false);
    }
  };

  const showImagePreview = async (
    title: string,
    file?: File | null,
    storedFile?: RegCase["files"][number],
  ) => {
    try {
      if (file) {
        setImagePreview({ src: URL.createObjectURL(file), title, objectUrl: true });
        return;
      }
      if (storedFile?.dataUrl) {
        setImagePreview({ src: storedFile.dataUrl, title, objectUrl: false });
        return;
      }
      if (storedFile?.path) {
        const { data, error: downloadError } = await supabase.storage
          .from("case-files")
          .download(storedFile.path);
        if (downloadError) throw downloadError;
        setImagePreview({ src: URL.createObjectURL(data), title, objectUrl: true });
        return;
      }
      if (storedFile?.url) {
        setImagePreview({ src: storedFile.url, title, objectUrl: false });
        return;
      }
      toast.error(L("ছবির প্রিভিউ পাওয়া যায়নি", "Image preview is unavailable"));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      toast.error(L(`ছবি খোলা যায়নি: ${message}`, `Could not open image: ${message}`));
    }
  };

  const attachmentFields = (
    <fieldset className="space-y-1">
      <legend className="text-sm font-semibold text-slate-700">
        {L("ছবি সংযুক্তি · প্রতিটি সর্বোচ্চ ৭৫০ KB", "Photo attachments · maximum 750 KB each")}
      </legend>
      <div className={`grid grid-cols-3 ${type === "birth" ? "gap-1.5 sm:gap-2" : "gap-1"}`}>
        {attachments.map((file, index) => {
          const savedFile = !filesChanged ? oldFiles[index] : undefined;
          const canPreview = Boolean(file || savedFile?.path || savedFile?.url || savedFile?.dataUrl);
          return (
            <div
              key={index}
              className={`flex min-w-0 items-center gap-0.5 rounded-lg border border-dashed border-emerald-300 bg-white hover:bg-emerald-50 ${type === "birth" ? "min-h-12 px-1 py-1" : "min-h-10 px-1 py-1"}`}
            >
              <label className={`flex min-w-0 flex-1 cursor-pointer items-center gap-1 ${type === "birth" ? "text-xs sm:text-sm" : "text-[11px]"}`}>
                <FileImage className={`${type === "birth" ? "h-4 w-4" : "h-3.5 w-3.5"} shrink-0 text-emerald-700`} />
                <span className="min-w-0 flex-1 truncate">
                  {compressing === index
                    ? L("সংকুচিত হচ্ছে…", "Compressing…")
                    : file
                      ? `${file.name} · ${Math.ceil(file.size / 1024)} KB`
                      : (savedFile?.name ?? L(`ছবি ${index + 1} বাছুন`, `Choose image ${index + 1}`))}
                </span>
                <input
                  accept="image/*"
                  className="sr-only"
                  disabled={compressing !== null}
                  type="file"
                  onChange={(event) => void chooseImage(index, event.target.files?.[0])}
                />
              </label>
              {canPreview && (
                <button
                  type="button"
                  className="rounded p-1 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-800"
                  aria-label={L(`ছবি ${index + 1} দেখুন`, `Preview image ${index + 1}`)}
                  onClick={() =>
                    void showImagePreview(
                      L(`ছবি ${index + 1}`, `Image ${index + 1}`),
                      file,
                      savedFile,
                    )
                  }
                >
                  <Eye className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
              {file && (
                <button
                  type="button"
                  className="px-1 font-bold text-red-700"
                  aria-label={L("ছবি সরান", "Remove image")}
                  onClick={() => {
                    setAttachments((current) =>
                      current.map((item, position) => (position === index ? null : item)),
                    );
                    setFilesChanged(true);
                  }}
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
      </div>
      {entry && oldFiles.length > 0 && !filesChanged && (
        <p className="text-[11px] text-slate-500">
          {L(
            "সংরক্ষিত ছবি অপরিবর্তিত থাকবে; নতুন ছবি দিলে সংযুক্তি প্রতিস্থাপিত হবে।",
            "Saved photos remain unless new photos are selected; selecting new photos replaces the attachments.",
          )}
        </p>
      )}
    </fieldset>
  );

  const visitPhotoField = (
    <fieldset className={`rounded-lg border border-emerald-200 bg-emerald-50/50 ${type === "birth" ? "space-y-2 p-3" : "space-y-1.5 p-2"}`}>
      <legend className="px-1 text-sm font-semibold text-emerald-950">
        {L("বাড়ি পরিদর্শন ও ছবি আপলোড", "House visit and photo upload")}
      </legend>
      <label className={`flex cursor-pointer items-center rounded-md px-1 font-medium text-slate-800 ${type === "birth" ? "min-h-11 gap-3 text-sm" : "min-h-9 gap-2 text-xs"}`}>
        <input
          type="checkbox"
          role="switch"
          checked={gpsEnabled}
          onChange={(event) => {
            const enabled = event.target.checked;
            gpsEnabledRef.current = enabled;
            setGpsEnabled(enabled);
            setLocationError("");
            if (!enabled) {
              setVisitPhotoMetadata((current) =>
                current ? { capturedAt: current.capturedAt } : undefined,
              );
            } else if (visitPhoto && visitPhotoMetadata) {
              void captureCoordinates()
                .then((coordinates) => {
                  if (gpsEnabledRef.current) {
                    setVisitPhotoMetadata((current) => current ? { ...current, ...coordinates } : current);
                  }
                })
                .catch((causeError: unknown) => {
                  if (!gpsEnabledRef.current) return;
                  const message = causeError instanceof Error ? causeError.message : "GPS লোকেশন পাওয়া যায়নি";
                  setLocationError(message);
                  toast.error(L(`GPS লোকেশন নেওয়া যায়নি: ${message}`, `Could not capture GPS location: ${message}`));
                });
            }
          }}
          className="h-4 w-4 accent-emerald-700"
        />
        <span>{L("GPS লোকেশন যুক্ত করুন (ঐচ্ছিক)", "Add GPS location (optional)")}</span>
      </label>
      <div className="flex min-w-0 items-center gap-1">
        <label className={`flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-emerald-300 bg-white text-slate-700 hover:bg-emerald-50 ${type === "birth" ? "min-h-12 px-3 py-2 text-sm" : "min-h-10 px-2 py-1.5 text-xs"}`}>
          <FileImage className="h-4 w-4 shrink-0 text-emerald-700" />
          <span className="min-w-0 flex-1 truncate">
            {visitPhotoLoading
              ? L("ছবি প্রস্তুত হচ্ছে…", "Preparing photo…")
              : visitPhoto
                ? `${visitPhoto.name} · ${Math.ceil(visitPhoto.size / 1024)} KB`
                : oldVisitPhoto && !filesChanged
                  ? `${oldVisitPhoto.name} · ${L("সংরক্ষিত", "saved")}`
                : L("পরিদর্শনের ছবি বাছুন বা তুলুন", "Choose or take a visit photo")}
          </span>
          <input
            accept="image/*"
            capture="environment"
            className="sr-only"
            disabled={visitPhotoLoading}
            type="file"
            onChange={(event) => {
              void chooseVisitPhoto(event.currentTarget.files?.[0]);
              event.currentTarget.value = "";
            }}
          />
        </label>
        {(visitPhoto || (!filesChanged && oldVisitPhoto)) && (
          <button
            type="button"
            className="rounded p-1.5 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-800"
            aria-label={L("পরিদর্শনের ছবি দেখুন", "Preview visit photo")}
            onClick={() =>
              void showImagePreview(
                L("পরিদর্শনের ছবি", "Inspection photo"),
                visitPhoto,
                oldVisitPhoto,
              )
            }
          >
            <Eye className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
        {visitPhoto && (
          <button
            type="button"
            className="rounded px-1 font-bold text-red-700"
            aria-label={L("পরিদর্শনের ছবি সরান", "Remove visit photo")}
            onClick={() => {
              setVisitPhoto(null);
              setVisitPhotoMetadata(undefined);
              setFilesChanged(true);
            }}
          >
            ×
          </button>
        )}
      </div>
      {visitPhotoMetadata && (
        <p className="text-xs text-slate-600">
          {L("ছবির সময়", "Photo time")}:{" "}
          {new Intl.DateTimeFormat(L("bn-BD", "en-GB"), {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: "Asia/Dhaka",
          }).format(new Date(visitPhotoMetadata.capturedAt))}
          {visitPhotoMetadata.latitude !== undefined && visitPhotoMetadata.longitude !== undefined
            ? ` · GPS: ${visitPhotoMetadata.latitude.toFixed(6)}, ${visitPhotoMetadata.longitude.toFixed(6)}`
            : gpsEnabled
              ? ` · ${L("GPS লোকেশন সংরক্ষিত হয়নি", "GPS location was not saved")}`
              : ""}
        </p>
      )}
      {!visitPhoto && !filesChanged && oldVisitPhoto?.fieldVisit && (
        <p className="text-xs text-slate-600">
          {L("সংরক্ষিত ছবির সময়", "Saved photo time")}:{" "}
          {new Intl.DateTimeFormat(L("bn-BD", "en-GB"), {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: "Asia/Dhaka",
          }).format(new Date(oldVisitPhoto.fieldVisit.capturedAt))}
          {oldVisitPhoto.fieldVisit.latitude !== undefined &&
            oldVisitPhoto.fieldVisit.longitude !== undefined &&
            ` · GPS: ${oldVisitPhoto.fieldVisit.latitude.toFixed(6)}, ${oldVisitPhoto.fieldVisit.longitude.toFixed(6)}`}
        </p>
      )}
      {locationError && (
        <p className="text-xs text-amber-800">
          {L("GPS ছাড়াই ছবি জমা দেওয়া যাবে", "The photo can still be submitted without GPS")}: {locationError}
        </p>
      )}
    </fieldset>
  );

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    const parseDateInput = (value: string): string | undefined => {
      const normalized = value
        .replace(/[০-৯]/g, (digit) =>
          String("০১২৩৪৫৬৭৮৯".indexOf(digit)),
        )
        .trim();
      const parts = normalized.split(/[./-]/);
      if (parts.length !== 3) return undefined;

      const yearFirst = parts[0]?.length === 4;
      const year = yearFirst ? parts[0] : parts[2];
      const month = parts[1];
      const day = yearFirst ? parts[2] : parts[0];
      if (
        !year ||
        !month ||
        !day ||
        !/^\d{4}$/.test(year) ||
        !/^\d{1,2}$/.test(month) ||
        !/^\d{1,2}$/.test(day)
      ) {
        return undefined;
      }

      const isoDate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
      return isValidIsoDate(isoDate) ? isoDate : undefined;
    };
    const submittedDob = parseDateInput(dob);
    const submittedDod = type === "death" ? parseDateInput(dod) : undefined;
    if (!user || !union || !upazila) {
      setError(L("আপনার নির্ধারিত এলাকা পাওয়া যায়নি", "Your assigned area could not be found"));
      return;
    }
    if (!name.bn.trim() || !father.bn.trim() || !mother.bn.trim()) {
      setError(
        L(
          "শিশু/ব্যক্তি, পিতা ও মাতার নাম বাংলায় দিন",
          "Enter the child/person, father and mother's names in Bangla",
        ),
      );
      return;
    }
    if (!applicantNameBn.trim() || !applicantRelationshipBn.trim()) {
      setError(L("আবেদনকারীর নাম ও সম্পর্ক পূরণ করুন", "Enter the applicant's name and relationship"));
      return;
    }
    if (!/^01[3-9]\d{8}$/.test(mobile)) {
      setError(
        L(
          "সক্রিয় ১১ অঙ্কের বাংলাদেশি মোবাইল নম্বর দিন",
          "Enter an active 11-digit Bangladesh mobile number",
        ),
      );
      return;
    }
    if (
      !submittedDob ||
      (type === "death" && (!submittedDod || !cause.bn.trim()))
    ) {
      setError(
        L(
          "তারিখ, গ্রাম এবং প্রযোজ্য মৃত্যুর কারণ পূরণ করুন",
          "Complete the dates, village and, for death entries, cause of death",
        ),
      );
      return;
    }
    if ((fatherBrn && !isValidBrn(fatherBrn)) || (motherBrn && !isValidBrn(motherBrn))) {
      setError(L("পিতা/মাতার জন্ম নিবন্ধন নম্বর ১৭ অঙ্কের হতে হবে", "Father's/mother's BRN must be exactly 17 digits"));
      return;
    }
    if (!selectedVillage) {
      setError(L("গ্রাম/মহল্লা নির্বাচন করুন", "Select a village/neighborhood"));
      return;
    }
    if (submittedDob > new Date().toISOString().slice(0, 10) || (submittedDod && (submittedDod < submittedDob || submittedDod > new Date().toISOString().slice(0, 10)))) {
      setError(L("তারিখ ভবিষ্যতের হতে পারবে না এবং মৃত্যুর তারিখ জন্ম তারিখের পরে হতে হবে", "Dates can't be in the future and date of death must be after date of birth"));
      return;
    }
    if (type === "birth" && (!/^\d+$/.test(order) || Number(order) < 1 || Number(order) > 20)) {
      setError(L("সন্তানের ক্রম ১ থেকে ২০-এর মধ্যে দিন", "Child order must be between 1 and 20"));
      return;
    }
    const normalize = normalizeDuplicateName;
    const duplicate = state.cases.some(
      (existing) =>
        existing.id !== entry?.id &&
        existing.type === type &&
        existing.dob === submittedDob &&
        existing.upazilaId === user.upazilaId &&
        existing.unionId === user.unionId &&
        existing.ward === (user.ward ?? 1) &&
        normalize(existing.father.bn) === normalize(father.bn) &&
        normalize(existing.mother.bn) === normalize(mother.bn),
    );
    if (duplicate) {
      setDuplicateOpen(true);
      return;
    }

    setSaving(true);
    try {
      if (!demoMode && navigator.onLine) {
        let serverDuplicate: boolean;
        try {
          const result = await checkForDuplicate({
            data: {
              type,
              dob: submittedDob,
              fatherBn: father.bn,
              motherBn: mother.bn,
              ...(entry ? { excludeId: entry.id } : {}),
            },
          });
          serverDuplicate = result.duplicate;
        } catch (causeError) {
          console.error("Duplicate case check failed", causeError);
          setError(
            L(
              "ডুপ্লিকেট আবেদন যাচাই করা যায়নি। সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।",
              "Could not check for duplicate applications. Check your connection and try again.",
            ),
          );
          return;
        }
        if (serverDuplicate) {
          setDuplicateOpen(true);
          return;
        }
      }
      let submittedVisitPhotoMetadata = visitPhotoMetadata;
      if (
        gpsEnabled &&
        visitPhoto &&
        (submittedVisitPhotoMetadata?.latitude === undefined ||
          submittedVisitPhotoMetadata.longitude === undefined)
      ) {
        try {
          const coordinates = await captureCoordinates();
          submittedVisitPhotoMetadata = {
            capturedAt: submittedVisitPhotoMetadata?.capturedAt ?? new Date().toISOString(),
            ...coordinates,
          };
          setVisitPhotoMetadata(submittedVisitPhotoMetadata);
          setLocationError("");
        } catch (causeError) {
          const message =
            causeError instanceof Error
              ? causeError.message
              : L("GPS লোকেশন পাওয়া যায়নি", "Could not capture GPS location");
          setLocationError(message);
          setError(
            L(
              `GPS লোকেশন নেওয়া যায়নি: ${message}। লোকেশন ছাড়া জমা দিতে GPS বন্ধ করুন।`,
              `Could not capture GPS: ${message}. Turn off GPS to submit without location.`,
            ),
          );
          return;
        }
      }
      const registryAddress = configuredAddress(
        selectedVillage,
        selectedUnion ?? union,
        upazila,
        addressHolding,
      );
      const data = {
        type,
        name,
        father,
        mother,
        nid,
        parentMobile: mobile,
        gender,
        dob: submittedDob,
        order: type === "birth" ? order : undefined,
        dod: submittedDod,
        cause: type === "death" ? cause : undefined,
        villageId: selectedVillage.id,
        details: {
          fatherBrn: fatherBrn || undefined,
          motherBrn: motherBrn || undefined,
          birthPlace: type === "birth" ? registryAddress : undefined,
          deathPlace: type === "death" ? registryAddress : undefined,
          presentAddress: registryAddress,
          permanentAddress: registryAddress,
          addressHolding: addressHolding.trim() || undefined,
          spouseName: type === "death" ? spouseName : undefined,
          applicantName: undefined,
          applicantRelationship: undefined,
          applicantNameBn: applicantNameBn.trim(),
          applicantRelationshipBn: applicantRelationshipBn.trim(),
        },
      };
      const selectedAttachments = attachments.filter((file): file is File => file !== null);
      const selectedFiles = [...selectedAttachments, ...(visitPhoto ? [visitPhoto] : [])];
      const fileMetadata: CaseFileMetadata[] = [
        ...selectedAttachments.map(() => ({})),
        ...(visitPhoto && submittedVisitPhotoMetadata
          ? [{ fieldVisit: submittedVisitPhotoMetadata }]
          : []),
      ];
      if (entry) {
        const updated = await updateCase(entry.id, {
          ...data,
          ...(filesChanged
            ? { files: selectedFiles, fileMetadata }
            : {}),
        });
        if (!updated) return;
        toast.success(L("এন্ট্রি সংশোধন হয়েছে", "Entry corrected"));
      } else {
        const addError = await addCase({
          ...data,
          files: selectedFiles,
          fileMetadata,
        });
        if (addError) {
          setError(addError);
          toast.error(addError);
          return;
        }
        toast.success(L("এন্ট্রি জমা হয়েছে", "Entry submitted"));
      }
      try {
        window.localStorage.removeItem(draftKey);
      } catch (causeError) {
        console.error("Could not clear submitted registration draft", causeError);
      }
      submissionSucceeded.current = true;
      setSuccessOpen(true);
    } finally {
      setSaving(false);
    }
  };

  const needsTestArea = !upazila || !union;
  useEffect(() => {
    // Local testing mode: open the form with the sample health worker's area.
    if (needsTestArea && (!user || demoMode)) {
      try { enterDemoLogin("worker"); } catch (e) { console.error(e); }
    }
  }, [needsTestArea, user, demoMode, enterDemoLogin]);

  if (!upazila || !union) {
    return (
      <p className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
        {L(
          "এই কর্মী অ্যাকাউন্টের জন্য উপজেলা/ইউনিয়ন নির্ধারিত নেই। প্রশাসককে জানান।",
          "No upazila/union is assigned to this worker account. Contact an administrator.",
        )}
      </p>
    );
  }

  return (
    <form
      className={`w-full max-w-full rounded-2xl border border-emerald-100 bg-white p-2 shadow-sm sm:p-3 ${
        type === "death"
          ? "grid w-full grid-cols-1 gap-3 md:grid-cols-2 md:gap-6"
          : "space-y-1"
      }`}
      onSubmit={submit}
    >
      <div className={`border-b border-emerald-100 pb-1.5 ${type === "death" ? "md:col-span-full" : ""}`}>
        <div className="flex items-center justify-between gap-3">
          <h2 className={`${type === "birth" ? "text-base" : "text-lg"} font-bold text-emerald-950`}>
            {type === "birth" ? "জন্ম নিবন্ধনের আবেদন" : "মৃত্যু নিবন্ধনের আবেদন"}
          </h2>
          <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={onCancel}>
            <Home className="mr-1.5 h-4 w-4" />{L("হোম পেজে ফিরে যান", "Home")}
          </Button>
        </div>
        <p className={`${type === "birth" ? "text-xs" : "text-sm"} text-slate-500`}>
          {type === "birth" ? "Birth Registration Application" : "Death Registration Application"}
        </p>
        {!online && (
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-950" role="status">
            {L(
              "অফলাইন: খসড়া এই ডিভাইসে সংরক্ষিত হবে। জমা দেওয়া ফাইলবিহীন আবেদন সংযোগ ফিরলে সিঙ্ক হবে।",
              "Offline: this draft is saved on this device. Submitted applications without files will sync when connection returns.",
            )}
          </p>
        )}
        {online && (
          <p className="mt-1 text-[11px] font-medium text-emerald-800" role="status">
            {L("খসড়া স্বয়ংক্রিয়ভাবে এই ডিভাইসে সংরক্ষিত", "Draft autosaves on this device")}
          </p>
        )}
      </div>

      {type === "birth" ? (
        <div className="grid min-w-0 items-start gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-4">
          <div className="min-w-0 space-y-1">
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
              <FormRow labelBn="জন্মতারিখ" labelEn="Date of Birth" required stacked>
                <Input
                  className="h-11 w-full text-sm"
                  type="text"
                  inputMode="text"
                  maxLength={10}
                  placeholder="দিন/মাস/বছর (যেমন: ৩১/১০/২০২৬ বা 31/10/2026)"
                  aria-label="জন্মতারিখ / Date of birth"
                  required
                  value={dob}
                  onChange={(event) => setDob(event.target.value)}
                />
              </FormRow>
              <FormRow labelBn="কত তম সন্তান" labelEn="Child Order" required stacked>
                <Select value={order} onValueChange={setOrder} required>
                  <SelectTrigger className="h-11 w-full min-w-0 px-3 text-sm" aria-label="কত তম সন্তান / Child order">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 20 }, (_, index) => index + 1).map((childOrder) => (
                      <SelectItem key={childOrder} value={String(childOrder)}>
                        {childOrderLabel(childOrder)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormRow>
            </div>
            <FormRow labelBn="লিঙ্গ" labelEn="Gender" required compact>
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="লিঙ্গ / Gender">
                {([
                  ["female", "নারী", "Female"],
                  ["male", "পুরুষ", "Male"],
                  ["other", "তৃতীয় লিঙ্গ", "Other"],
                ] as const).map(([value, labelBn, labelEn]) => (
                  <label key={value} className="flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5 hover:border-emerald-400">
                    <input className="h-4 w-4 shrink-0 accent-emerald-600" type="radio" name="gender-birth" value={value} checked={gender === value} onChange={() => setGender(value)} required />
                    <span><span className="block text-sm font-semibold text-slate-800">{labelBn}</span><span className="block text-xs text-slate-500">{labelEn}</span></span>
                  </label>
                ))}
              </div>
            </FormRow>
            <FormRow labelBn="সক্রিয় মোবাইল নম্বর" labelEn="Active Mobile Number" required compact>
              <Input className="h-11 text-base md:text-base placeholder:text-base" autoComplete="tel" inputMode="tel" maxLength={11} placeholder="01XXXXXXXXX" required value={mobile} onChange={(event) => setMobile(event.target.value.replace(/\D/g, "").slice(0, 11))} />
            </FormRow>
            <BiField label="শিশুর নাম" labelEn="Child's Name" value={name} onChange={setName} required compact />
            <BiField label="পিতার নাম" labelEn="Father's Name" value={father} onChange={setFather} required compact />
            <BiField label="মাতার নাম" labelEn="Mother's Name" value={mother} onChange={setMother} required compact />
            <FormRow labelBn="পিতা ও মাতার জন্ম নিবন্ধন নং" labelEn="Parent's Birth Registration Numbers" compact>
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <Input className="h-10 px-2 text-sm md:text-sm placeholder:text-xs" autoComplete="off" inputMode="numeric" maxLength={17} placeholder="পিতার BRN" aria-label="পিতার জন্ম নিবন্ধন নম্বর / Father's BRN" aria-invalid={fatherBrn.length > 0 && !isValidBrn(fatherBrn)} value={fatherBrn} onChange={(event) => setFatherBrn(normalizeBdDigits(event.target.value).replace(/\D/g, "").slice(0, 17))} />
                  {fatherBrn.length > 0 && !isValidBrn(fatherBrn) && <p className="mt-1 text-[10px] font-medium text-red-700">{L("BRN ১৭ অঙ্কের হতে হবে", "BRN must be 17 digits")}</p>}
                </div>
                <div>
                  <Input className="h-10 px-2 text-sm md:text-sm placeholder:text-xs" autoComplete="off" inputMode="numeric" maxLength={17} placeholder="মাতার BRN" aria-label="মাতার জন্ম নিবন্ধন নম্বর / Mother's BRN" aria-invalid={motherBrn.length > 0 && !isValidBrn(motherBrn)} value={motherBrn} onChange={(event) => setMotherBrn(normalizeBdDigits(event.target.value).replace(/\D/g, "").slice(0, 17))} />
                  {motherBrn.length > 0 && !isValidBrn(motherBrn) && <p className="mt-1 text-[10px] font-medium text-red-700">{L("BRN ১৭ অঙ্কের হতে হবে", "BRN must be 17 digits")}</p>}
                </div>
              </div>
            </FormRow>
            {attachmentFields}
          </div>

          <div className="min-w-0 space-y-1">
            {union && upazila && (
              <VillageAddressField
                union={union}
                upazila={upazila}
                districtBn={upazila.districtBn}
                districtEn={upazila.districtEn}
                villageId={villageId}
                onVillageChange={setVillageId}
                holding={addressHolding}
                onHoldingChange={setAddressHolding}
                L={L}
                n={n}
              />
            )}
            <FormRow labelBn="আবেদনকারীর তথ্য" labelEn="Applicant Details" required compact>
              <div className="grid gap-2">
                <Input className="h-10 text-sm md:text-sm" autoComplete="name" maxLength={100} placeholder="আবেদনকারীর নাম" aria-label="আবেদনকারীর নাম" required value={applicantNameBn} onChange={(event) => setApplicantNameBn(event.target.value)} />
                <Input className="h-10 text-sm md:text-sm" maxLength={100} placeholder="আবেদনকারীর সাথে সম্পর্ক" aria-label="আবেদনকারীর সাথে সম্পর্ক" required value={applicantRelationshipBn} onChange={(event) => setApplicantRelationshipBn(event.target.value)} />
              </div>
            </FormRow>
            {visitPhotoField}
          </div>
        </div>
      ) : (
        <>
          <div className="min-w-0 space-y-1">
            <div className="grid min-w-0 grid-cols-1 gap-1.5 sm:grid-cols-2">
              <FormRow labelBn="মৃত্যুর তারিখ" labelEn="Date of Death" required stacked>
                <Input
                  className="h-11 w-full text-sm"
                  type="text"
                  inputMode="text"
                  maxLength={10}
                  placeholder="দিন/মাস/বছর (যেমন: ৩১/১০/২০২৬ বা 31/10/2026)"
                  aria-label="মৃত্যুর তারিখ / Date of death"
                  required
                  value={dod}
                  onChange={(event) => setDod(event.target.value)}
                />
              </FormRow>
              <FormRow labelBn="কত তম সন্তান" labelEn="Child Order" required stacked>
                <Select value={order} onValueChange={setOrder} required>
                  <SelectTrigger className="h-11 w-full min-w-0 px-3 text-sm" aria-label="কত তম সন্তান / Child order">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 20 }, (_, index) => index + 1).map((childOrder) => (
                      <SelectItem key={childOrder} value={String(childOrder)}>
                        {childOrderLabel(childOrder)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormRow>
            </div>
            <FormRow labelBn="লিঙ্গ" labelEn="Gender" required compact>
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="লিঙ্গ / Gender">
                {([
                  ["female", "নারী", "Female"],
                  ["male", "পুরুষ", "Male"],
                  ["other", "তৃতীয় লিঙ্গ", "Other"],
                ] as const).map(([value, labelBn, labelEn]) => (
                  <label key={value} className="flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5 hover:border-emerald-400">
                    <input className="h-4 w-4 shrink-0 accent-emerald-600" type="radio" name="gender-death" value={value} checked={gender === value} onChange={() => setGender(value)} required />
                    <span><span className="block text-sm font-semibold text-slate-800">{labelBn}</span><span className="block text-xs text-slate-500">{labelEn}</span></span>
                  </label>
                ))}
              </div>
            </FormRow>
            <BiField label="মৃত্যুর কারণ" labelEn="Cause of Death" value={cause} onChange={setCause} required compact />
            <FormRow labelBn="জন্ম তারিখ" labelEn="Date of Birth" required compact>
              <Input
                className="h-11 w-full text-sm"
                type="text"
                inputMode="text"
                maxLength={10}
                placeholder="দিন/মাস/বছর (যেমন: ৩১/১০/২০২৬ বা 31/10/2026)"
                aria-label="জন্মতারিখ / Date of birth"
                required
                value={dob}
                onChange={(event) => setDob(event.target.value)}
              />
            </FormRow>
            <BiField label="মৃত ব্যক্তির নাম" labelEn="Deceased Name" value={name} onChange={setName} required compact />
            <BiField label="পিতার নাম" labelEn="Father's Name" value={father} onChange={setFather} required compact />
            <BiField label="মাতার নাম" labelEn="Mother's Name" value={mother} onChange={setMother} required compact />
            <BiField label="স্বামী/স্ত্রীর নাম" labelEn="Spouse's Name" value={spouseName} onChange={setSpouseName} compact />
            <FormRow labelBn="জাতীয় পরিচয়পত্র নং" labelEn="National ID No." compact>
              <Input
                className="h-11 text-base"
                autoComplete="off"
                inputMode="numeric"
                maxLength={17}
                placeholder="ঐচ্ছিক / Optional"
                value={nid}
                onChange={(event) => setNid(normalizeBdDigits(event.target.value).replace(/\D/g, "").slice(0, 17))}
              />
            </FormRow>
            <FormRow labelBn="মোবাইল নম্বর" labelEn="Mobile Number" required compact><Input className="h-11 text-base" autoComplete="tel" inputMode="tel" maxLength={11} placeholder="01XXXXXXXXX" required value={mobile} onChange={(event) => setMobile(event.target.value.replace(/\D/g, "").slice(0, 11))} /></FormRow>
          </div>
          <div className="min-w-0 space-y-1">
            {union && upazila && (
              <VillageAddressField
                union={union}
                upazila={upazila}
                districtBn={upazila.districtBn}
                districtEn={upazila.districtEn}
                villageId={villageId}
                onVillageChange={setVillageId}
                holding={addressHolding}
                onHoldingChange={setAddressHolding}
                L={L}
                n={n}
              />
            )}
            <FormRow labelBn="আবেদনকারীর তথ্য" labelEn="Applicant Details" required compact><div className="grid gap-2"><Input className="h-10 text-sm" placeholder="আবেদনকারীর নাম" required value={applicantNameBn} onChange={(event) => setApplicantNameBn(event.target.value)} /><Input className="h-10 text-sm" placeholder="আবেদনকারীর সাথে সম্পর্ক" required value={applicantRelationshipBn} onChange={(event) => setApplicantRelationshipBn(event.target.value)} /></div>            </FormRow>
            {attachmentFields}
            {visitPhotoField}
          </div>
        </>
      )}

      {error && (
        <p role="alert" className={`rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-800 ${type === "death" ? "md:col-span-full" : ""}`}>
          {error}
        </p>
      )}
      <div className={`sticky bottom-0 z-10 -mx-2 flex flex-wrap gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-2 shadow-[0_-6px_16px_-14px_rgba(15,23,42,0.6)] ${type === "death" ? "md:col-span-full" : ""}`}>
        {type === "death" && (
        <p className="text-xs font-medium text-emerald-900">
          {L("আবেদনটি যাচাইয়ের জন্য জমা হবে", "This application will be submitted for review")}
        </p>
        )}
        <div className="ml-auto flex flex-wrap justify-end gap-1.5">
        <Button
          type="submit"
          className="bg-emerald-600 text-white hover:bg-emerald-700"
          disabled={saving || compressing !== null}
        >
          {saving ? L("সংরক্ষণ হচ্ছে…", "Saving…") : L("সংরক্ষণ করুন", "Save")}
        </Button>
        <Button
          type={entry ? "submit" : "button"}
          className="bg-amber-500 text-white hover:bg-amber-600"
          disabled={saving || (!entry && !onEdit)}
          onClick={entry ? undefined : onEdit}
        >
          {L("সংশোধন করুন", "Edit / Modify")}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
          {L("বন্ধ করুন", "Close")}
        </Button>
        </div>
      </div>
      <Dialog
        open={imagePreview !== null}
        onOpenChange={(open) => {
          if (!open) setImagePreview(null);
        }}
      >
        <DialogContent className="max-h-[90svh] max-w-4xl overflow-hidden rounded-2xl border-emerald-200 p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="pr-8 text-center text-lg font-bold text-emerald-950">
              {imagePreview?.title ?? L("ছবির প্রিভিউ", "Image preview")}
            </DialogTitle>
          </DialogHeader>
          {imagePreview && (
            <div className="flex max-h-[75svh] items-center justify-center overflow-hidden">
              <img
                src={imagePreview.src}
                alt={imagePreview.title}
                className="max-h-[75svh] max-w-full rounded-lg object-contain"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={successOpen}
        onOpenChange={(open) => {
          setSuccessOpen(open);
          if (!open) onSaved();
        }}
      >
        <DialogContent className="max-w-sm rounded-2xl border-emerald-200 p-6">
          <DialogHeader>
            <DialogTitle className="text-center text-xl font-bold text-emerald-900">
              {L("তথ্য সফলভাবে সংরক্ষিত হয়েছে", "Data successfully saved")}
            </DialogTitle>
            <DialogDescription className="text-center">
              {L(
                "নতুন আবেদন শুরু করতে নিচের বোতামে চাপ দিন।",
                "Select below to start a fresh application.",
              )}
            </DialogDescription>
          </DialogHeader>
          <Button
            type="button"
            className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
            onClick={() => {
              setSuccessOpen(false);
              onSaved();
            }}
          >
            {L("ওকে", "OK")}
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog open={duplicateOpen} onOpenChange={setDuplicateOpen}>
        <DialogContent className="max-w-sm rounded-2xl border-amber-200 p-6">
          <DialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <AlertTriangle className="h-6 w-6" aria-hidden="true" />
            </div>
            <DialogTitle className="text-center text-lg font-bold text-amber-950">
              {L("আবেদনটি আগে থেকেই রয়েছে", "Application already exists")}
            </DialogTitle>
            <DialogDescription className="text-center text-slate-700">
              {L(
                "সতর্কতা: এই জন্মতারিখ ও পিতা-মাতার নামে ইতিমধ্যে একটি আবেদন রয়েছে।",
                "Warning: An application with this date of birth and parents' names already exists.",
              )}
            </DialogDescription>
          </DialogHeader>
          <Button
            type="button"
            variant="outline"
            className="w-full border-amber-300 text-amber-900 hover:bg-amber-50"
            onClick={() => setDuplicateOpen(false)}
          >
            {L("ঠিক আছে", "OK")}
          </Button>
        </DialogContent>
      </Dialog>
    </form>
  );
}

function EpiAttendanceForm({ onSaved }: { onSaved: () => void }) {
  const { L, n, user, state, addEpiVisit } = useApp();
  const assignedUpazila = user
    ? state.upazilas.find((item) => item.id === user.upazilaId)
    : undefined;
  const assignedUnion = assignedUpazila?.unions.find((item) => item.id === user?.unionId);
  const [name, setName] = useState<Bi>(emptyBi);
  const [mobile, setMobile] = useState("");
  const [villageId, setVillageId] = useState("");
  const selectedVillageAddress = resolveVillageAddress(assignedUpazila, assignedUnion?.id, villageId);
  const selectedVillage = selectedVillageAddress?.village ?? undefined;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || !assignedUnion || !assignedUpazila) return;
    if (!name.bn.trim() || !name.en.trim() || !/^01[3-9]\d{8}$/.test(mobile) || !villageId) {
      setError(
        L(
          "নাম, সক্রিয় মোবাইল ও গ্রাম সঠিকভাবে পূরণ করুন",
          "Enter the child's name, active mobile and village",
        ),
      );
      return;
    }
    setSaving(true);
    const insertError = await addEpiVisit({
      child_name_bn: name.bn.trim(),
      child_name_en: name.en.trim(),
      parent_mobile: mobile,
      village_id: villageId,
    });
    setSaving(false);
    if (insertError) {
      setError(insertError);
      toast.error(insertError);
      return;
    }
    toast.success(L("EPI উপস্থিতি সংরক্ষিত হয়েছে", "EPI attendance recorded"));
    onSaved();
  };

  if (!assignedUpazila || !assignedUnion) {
    return (
      <p className="text-sm text-red-700">
        {L("কর্মীর নির্ধারিত এলাকা পাওয়া যায়নি", "Worker's assigned area is unavailable")}
      </p>
    );
  }
  return (
    <form className="space-y-4" onSubmit={submit}>
      <BiField label={L("শিশুর নাম", "Infant's name")} value={name} onChange={setName} required />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs font-semibold">
            {L("অভিভাবকের সক্রিয় মোবাইল", "Parent's active mobile")}
          </Label>
          <Input
            inputMode="tel"
            maxLength={11}
            placeholder="01XXXXXXXXX"
            required
            value={mobile}
            onChange={(event) => setMobile(event.target.value.replace(/\D/g, "").slice(0, 11))}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-semibold">{L("গ্রাম", "Village")}</Label>
          <Select value={villageId} onValueChange={setVillageId}>
            <SelectTrigger>
              <SelectValue placeholder={L("গ্রাম নির্বাচন", "Select village")} />
            </SelectTrigger>
            <SelectContent>
              {assignedUnion.villages.map((village) => (
                <SelectItem key={village.id} value={village.id}>
                  {village.bn} / {village.en}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-semibold">{L("ওয়ার্ড নং", "Ward number")}</Label>
          <Input value={selectedVillage ? String(n(selectedVillage.ward)) : ""} readOnly placeholder="—" />
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? L("সংরক্ষণ হচ্ছে…", "Saving…") : L("উপস্থিতি সংরক্ষণ", "Record attendance")}
        </Button>
      </div>
    </form>
  );
}

export function WorkerDashboard() {
  const { L, n, user, state, refresh, demoMode, epiVisits, activeUnionId } = useApp();
  const { address, date, rows } = useCaseHelpers();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [formInstance, setFormInstance] = useState(0);
  const [visits, setVisits] = useState<EpiVisit[]>([]);
  const [loadingVisits, setLoadingVisits] = useState(true);
  const mine = scopedCases(state, user);
  const workerCases = useMemo(
    () => mine.filter((item) => item.createdBy === user?.id),
    [mine, user?.id],
  );
  const births = workerCases.filter((item) => item.type === "birth");
  const deaths = workerCases.filter((item) => item.type === "death");
  const adminMessages = workerCases.flatMap((entry) =>
    entry.remarks.filter((remark) => remark.role === "admin").map((remark) => ({ entry, remark })),
  );

  const loadVisits = useCallback(async () => {
    if (!user?.id) return;
    setLoadingVisits(true);
    if (demoMode) {
      setVisits(epiVisits.filter((visit) => visit.created_by === user.id));
      setLoadingVisits(false);
      return;
    }
    const { data, error } = await supabase
      .from("epi_visits")
      .select("*")
      .eq("created_by", user.id)
      .order("attended_at", { ascending: false })
      .limit(50);
    setLoadingVisits(false);
    if (error) {
      console.error("Failed to load EPI attendance records", error);
      toast.error(
        L("EPI উপস্থিতির তালিকা লোড করা যায়নি", "Could not load EPI attendance records"),
      );
      return;
    }
    setVisits(data);
  }, [L, user?.id, demoMode, epiVisits]);

  useEffect(() => {
    void loadVisits();
  }, [loadVisits]);

  useEffect(() => {
    if (!user?.id) return;
    if (demoMode) return;
    const channel = supabase
      .channel(`worker-admin-notices-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "case_remarks",
          filter: "role=eq.admin",
        },
        () => void refresh(),
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "cases",
        },
        () => void refresh(),
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error("Live administrative notice subscription failed", status);
          toast.error(
            L("লাইভ প্রশাসনিক বার্তা সংযোগ বিচ্ছিন্ন", "Live officer-notice connection failed"),
          );
        }
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [L, refresh, user?.id, demoMode]);

  const pendingVisits = visits.filter((visit) => {
    const linkedCase = visit.registration_case_id
      ? state.cases.find((item) => item.id === visit.registration_case_id)
      : undefined;
    return !linkedCase || (linkedCase.status !== "completed" && linkedCase.status !== "rejected");
  });

  const urgency = useMemo(() => {
    const counts = { green: 0, yellow: 0, red: 0, expired: 0 };
    for (const entry of workerCases) {
      if (entry.status === "completed" || entry.status === "rejected") continue;
      const deadline = getCaseDeadline(entry);
      if (!deadline) continue;
      const band = getDeadlineBand(deadline.elapsedDays);
      if (band === "safe") counts.green++;
      else if (band === "warning") counts.yellow++;
      else if (band === "near-deadline") counts.red++;
      else counts.expired++;
    }
    return counts;
  }, [workerCases]);

  if (!user) return null;
  const goToForm = (type: CaseType, entry?: RegCase) =>
    setDialog(entry ? { kind: "form", type, entry } : { kind: "form", type });
  const stationId = demoMode
    ? activeUnionId ?? user.stationId ?? user.unionId
    : user.stationId ?? user.unionId;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-50 via-white to-lime-50 p-2 text-slate-900 sm:gap-3 sm:p-4">
      <UnifiedStationDashboardTop headerStationId={stationId} />
      <div className="flex shrink-0 items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-800 sm:text-xs">
            {L("স্বাস্থ্যকর্মী / ইপিআই কর্মী", "Health Worker / EPI Worker")}
          </p>
          <h1 className="truncate font-display text-lg font-bold text-emerald-950 sm:text-2xl">
            {L(`স্বাগতম, ${user.name.bn}`, `Welcome, ${user.name.en}`)}
          </h1>
        </div>
        {demoMode && (
          <span className="inline-flex shrink-0 rounded-full border border-amber-300 bg-amber-50 px-2 py-1 text-[9px] font-bold text-amber-950">
            <span className="sm:hidden">DEMO</span>
            <span className="hidden sm:inline">LOCAL DEMO · NOT SAVED</span>
          </span>
        )}
        <span className="hidden rounded-full border border-emerald-200 bg-white/90 px-3 py-1 text-xs font-semibold text-emerald-900 sm:inline-flex">
          {L("ওয়ার্ড", "Ward")} {n(user.ward ?? 1)}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 bg-white/90"
          aria-label={L("রিপোর্ট ডাউনলোড", "Download report")}
          onClick={() => downloadCSV(rows(workerCases), "my-report.csv")}
        >
          <Download className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 bg-white/90"
          aria-label={L("রিপোর্ট প্রিন্ট বা PDF", "Print or save report as PDF")}
          onClick={() =>
            printPDF(L("স্বাস্থ্যকর্মী প্রতিবেদন", "Health Worker Report"), rows(workerCases))
          }
        >
          <FileText className="h-4 w-4" />
        </Button>
      </div>

      {adminMessages.length > 0 && (
        <div
          className="flex shrink-0 items-center gap-2 overflow-hidden rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-900"
          role="alert"
        >
          <MessageSquareWarning className="h-4 w-4 shrink-0 text-red-700" aria-hidden="true" />
          <span className="shrink-0">{L("জরুরি প্রশাসনিক বার্তা", "Urgent officer message")}</span>
          <span className="truncate font-normal">
            {L(adminMessages[0]!.remark.text, adminMessages[0]!.remark.text)} ·{" "}
            {L(adminMessages[0]!.entry.name.bn, adminMessages[0]!.entry.name.en)}
          </span>
          {adminMessages.length > 1 && (
            <span className="ml-auto shrink-0">+{n(adminMessages.length - 1)}</span>
          )}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1.1fr)_minmax(0,0.9fr)] gap-2 overflow-hidden lg:grid-cols-[1.15fr_0.85fr] lg:grid-rows-1 lg:gap-3">
        <section
          className="flex min-h-0 flex-col gap-2 sm:gap-3"
          aria-label={L("সম্মতি ও EPI পর্যবেক্ষণ", "Compliance and EPI monitoring")}
        >
          <div className="shrink-0 rounded-xl border border-emerald-200 bg-white/95 p-3 shadow-sm sm:p-4">
            <div className="mb-2 flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-emerald-700" aria-hidden="true" />
              <h2 className="text-sm font-bold text-emerald-950">
                {L("৩৬৫ দিনের সম্মতি ও বয়স সতর্কতা", "365-day compliance & age alerts")}
              </h2>
            </div>
            <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
              {[
                {
                  label: L("০–৯০ দিন · নিরাপদ", "0–90 days · safe"),
                  count: urgency.green,
                  tone: "border-emerald-200 bg-emerald-50 text-emerald-900",
                  dot: "bg-emerald-500",
                },
                {
                  label: L("৯১–১৮০ দিন · সতর্কতা", "91–180 days · warning"),
                  count: urgency.yellow,
                  tone: "border-amber-200 bg-amber-50 text-amber-950",
                  dot: "bg-amber-400",
                },
                {
                  label: L("১৮১–৩৬৫ দিন · জরুরি", "181–365 days · urgent"),
                  count: urgency.red,
                  tone: "border-red-200 bg-red-50 text-red-900",
                  dot: "bg-red-500",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className={`min-w-0 rounded-lg border px-2 py-2 ${item.tone}`}
                >
                  <p className="flex items-center gap-1 truncate text-[9px] font-semibold sm:text-xs">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${item.dot}`} />
                    {item.label}
                  </p>
                  <p className="mt-1 font-display text-lg font-bold leading-none sm:text-2xl">
                    {n(item.count)}
                  </p>
                </div>
              ))}
            </div>
            {urgency.expired > 0 && (
              <p className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-red-800 sm:text-xs">
                <AlertTriangle className="h-3.5 w-3.5" />
                {L("৩৬৫ দিনের সময়সীমা অতিক্রান্ত", "Past 365-day deadline")}: {n(urgency.expired)}
              </p>
            )}
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-emerald-200 bg-white/95 shadow-sm">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-emerald-100 px-3 py-2.5 sm:px-4">
              <div className="flex items-center gap-2">
                <Syringe className="h-4 w-4 text-emerald-700" aria-hidden="true" />
                <div>
                  <h2 className="text-xs font-bold text-emerald-950 sm:text-sm">
                    {L("EPI সেশন · নিবন্ধন অনুসরণ", "EPI session · registration follow-up")}
                  </h2>
                  <p className="text-[9px] text-slate-500 sm:text-[11px]">
                    {L(
                      "টিকা নিতে আসা শিশুদের উপস্থিতি ও জন্ম নিবন্ধন অবস্থা",
                      "Attendance and birth-registration status of infants seen",
                    )}
                  </p>
                </div>
                <span className="ml-auto rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-900">
                  {n(pendingVisits.length)}
                </span>
              </div>
              <Button
                size="sm"
                className="h-8 shrink-0 px-2 text-[10px] sm:text-xs"
                onClick={() => setDialog({ kind: "epi" })}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                {L("উপস্থিতি", "Attendance")}
              </Button>
            </div>
            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2 sm:p-3">
              {loadingVisits ? (
                <p className="p-3 text-center text-xs text-slate-500">
                  {L("EPI তালিকা লোড হচ্ছে…", "Loading EPI list…")}
                </p>
              ) : pendingVisits.length ? (
                pendingVisits.map((visit) => {
                  const linkedCase = visit.registration_case_id
                    ? state.cases.find((item) => item.id === visit.registration_case_id)
                    : undefined;
                  const village = state.upazilas
                    .find((item) => item.id === visit.upazila_id)
                    ?.unions.find((item) => item.id === visit.union_id)
                    ?.villages.find((item) => item.id === visit.village_id);
                  return (
                    <div
                      key={visit.id}
                      className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/70 px-2.5 py-2"
                    >
                      <span
                        className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${linkedCase ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-700"}`}
                      >
                        {linkedCase ? (
                          <ClipboardList className="h-4 w-4" />
                        ) : (
                          <HeartPulse className="h-4 w-4" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold">
                          {L(visit.child_name_bn, visit.child_name_en)}
                        </p>
                        <p className="truncate text-[10px] text-slate-500">
                          {village ? L(village.bn, village.en) : visit.village_id} ·{" "}
                          {date(Date.parse(visit.attended_at))} · {visit.parent_mobile}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-bold ${linkedCase ? "bg-amber-100 text-amber-900" : "bg-red-100 text-red-800"}`}
                      >
                        {linkedCase
                          ? L("UP অনুমোদন পেন্ডিং", "UP approval pending")
                          : L("জন্ম এন্ট্রি বাকি", "Entry needed")}
                      </span>
                    </div>
                  );
                })
              ) : (
                <div className="flex h-full min-h-16 items-center justify-center text-center text-xs text-slate-500">
                  {L(
                    "সব উপস্থিত শিশু নিবন্ধিত/অনুমোদিত — নতুন EPI উপস্থিতি যোগ করুন",
                    "All infants are registered/approved — add a new EPI attendance",
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        <section
          className="flex min-h-0 flex-col gap-2 sm:gap-3"
          aria-label={L("দ্রুত এন্ট্রি ও তালিকা", "Quick entry and registers")}
        >
          <div className="shrink-0 rounded-xl border border-emerald-200 bg-white/95 p-3 shadow-sm sm:p-4">
            <div className="mb-2 flex items-center gap-2">
              <Plus className="h-4 w-4 text-emerald-700" />
              <h2 className="text-sm font-bold text-emerald-950">
                {L("দ্রুত প্রাথমিক এন্ট্রি", "Quick registration entry")}
              </h2>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => goToForm("birth")}
                className="flex min-h-16 cursor-pointer items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 text-left transition-all hover:scale-[1.02] hover:shadow-md sm:min-h-20 sm:px-3"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-700 text-white">
                  <Plus className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-bold text-emerald-950 sm:text-sm">
                    {L("জন্ম নিবন্ধন", "Birth entry")}
                  </span>
                  <span className="block text-[9px] text-emerald-800 sm:text-[11px]">
                    {L("নবজাতকের তথ্য", "Newborn details")}
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => goToForm("death")}
                className="flex min-h-16 cursor-pointer items-center gap-2 rounded-lg border border-teal-200 bg-teal-50 px-2.5 text-left transition-all hover:scale-[1.02] hover:shadow-md sm:min-h-20 sm:px-3"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-teal-800 text-white">
                  <Plus className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-bold text-teal-950 sm:text-sm">
                    {L("মৃত্যু নিবন্ধন", "Death entry")}
                  </span>
                  <span className="block text-[9px] text-teal-800 sm:text-[11px]">
                    {L("প্রাথমিক তথ্য", "Initial details")}
                  </span>
                </span>
              </button>
            </div>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-2 gap-2">
            {[
              {
                type: "birth" as const,
                title: L("জন্ম এন্ট্রি তালিকা", "Birth registry entries"),
                rows: births,
                tone: "border-emerald-200 bg-emerald-50 text-emerald-900",
              },
              {
                type: "death" as const,
                title: L("মৃত্যু এন্ট্রি তালিকা", "Death registry entries"),
                rows: deaths,
                tone: "border-teal-200 bg-teal-50 text-teal-950",
              },
            ].map((list) => {
              const awaiting = list.rows.filter((entry) => entry.status !== "completed" && entry.status !== "rejected").length;
              return (
                <button
                  key={list.type}
                  type="button"
                  onClick={() => setDialog({ kind: "entries", type: list.type })}
                  className={`flex min-h-0 cursor-pointer flex-col rounded-xl border p-3 text-left shadow-sm transition-all hover:scale-[1.02] hover:shadow-md sm:p-4 ${list.tone}`}
                >
                  <ClipboardList className="mb-2 h-5 w-5" aria-hidden="true" />
                  <span className="text-xs font-bold sm:text-sm">{list.title}</span>
                  <span className="mt-auto pt-2 font-display text-2xl font-bold sm:text-3xl">
                    {n(list.rows.length)}
                  </span>
                  <span className="text-[9px] sm:text-[11px]">
                    {L("UP অনুমোদন অপেক্ষমাণ", "Awaiting UP approval")}: {n(awaiting)}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="hidden shrink-0 rounded-xl border border-emerald-100 bg-white/90 px-3 py-2 text-[10px] text-slate-600 lg:block lg:text-xs">
            <div className="flex items-center gap-2">
              {workerCases.some((entry) => !entry.synced) ? (
                <CloudOff className="h-4 w-4 text-amber-700" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-emerald-700" />
              )}
              <span>
                {L("মোট এন্ট্রি", "Total entries")}: <b>{n(workerCases.length)}</b>
              </span>
              <span className="ml-auto">
                {L("অপেক্ষমাণ", "Pending")}:{" "}
                <b>{n(workerCases.filter((entry) => entry.status !== "completed" && entry.status !== "rejected").length)}</b>
              </span>
            </div>
          </div>
        </section>
      </div>

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="max-h-[92svh] max-w-4xl overflow-y-auto rounded-2xl border-emerald-200 p-4 sm:p-6">
          {dialog?.kind === "form" && (
            <>
              <DialogHeader className="pr-7 text-left">
                <DialogTitle className="font-display text-xl text-emerald-950">
                  {dialog.entry
                    ? L("এন্ট্রি সংশোধন", "Correct registration entry")
                    : dialog.type === "birth"
                      ? L("জন্ম নিবন্ধন প্রাথমিক এন্ট্রি", "Newborn quick entry")
                      : L("মৃত্যু নিবন্ধন প্রাথমিক এন্ট্রি", "Death registration quick entry")}
                </DialogTitle>
                <DialogDescription>
                  {L(
                    "গ্রাম নির্বাচন করলে নির্ধারিত এলাকার ঠিকানা স্বয়ংক্রিয়ভাবে যুক্ত হবে।",
                    "Selecting a village automatically fills the worker's assigned administrative address.",
                  )}
                </DialogDescription>
              </DialogHeader>
              <RegForm
                key={`${dialog.type}-${dialog.entry?.id ?? "new"}-${formInstance}`}
                type={dialog.type}
                entry={dialog.entry}
                onCancel={() => setDialog(null)}
                onEdit={() => setDialog({ kind: "entries", type: dialog.type })}
                onSaved={() => {
                  setDialog({ kind: "form", type: dialog.type });
                  setFormInstance((instance) => instance + 1);
                  void loadVisits();
                }}
              />
            </>
          )}
          {dialog?.kind === "epi" && (
            <>
              <DialogHeader className="pr-7 text-left">
                <DialogTitle className="font-display text-xl text-emerald-950">
                  {L("EPI সেশন উপস্থিতি", "EPI session attendance")}
                </DialogTitle>
                <DialogDescription>
                  {L(
                    "টিকা নিতে আসা শিশুর তথ্য ও অভিভাবকের মোবাইল সংরক্ষণ করুন। জন্ম এন্ট্রি জমা হলে এটি স্বয়ংক্রিয়ভাবে যুক্ত হবে।",
                    "Record an infant and parent's mobile. A later birth entry will be linked automatically.",
                  )}
                </DialogDescription>
              </DialogHeader>
              <EpiAttendanceForm
                onSaved={() => {
                  setDialog(null);
                  void loadVisits();
                }}
              />
            </>
          )}
          {dialog?.kind === "entries" && (
            <>
              <DialogHeader className="pr-7 text-left">
                <DialogTitle className="font-display text-xl text-emerald-950">
                  {dialog.type === "birth"
                    ? L("জন্ম এন্ট্রি তালিকা", "Birth registry entries")
                    : L("মৃত্যু এন্ট্রি তালিকা", "Death registry entries")}
                </DialogTitle>
                <DialogDescription>
                  {L(
                    "নিবন্ধন সম্পন্ন হওয়ার আগে নিজের পেন্ডিং এন্ট্রি সংশোধন করা যাবে।",
                    "Correct your own entries before final registration approval.",
                  )}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                {(dialog.type === "birth" ? births : deaths).map((entry) => {
                  const officerNotes = entry.remarks.filter((remark) => remark.role === "admin");
                  return (
                    <div key={entry.id} className="rounded-xl border border-slate-200 bg-white p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{L(entry.name.bn, entry.name.en)}</span>
                        <span
                          className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                            entry.status === "completed"
                              ? "bg-emerald-100 text-emerald-900"
                              : entry.status === "rejected"
                                ? "bg-red-100 text-red-900"
                              : "bg-amber-100 text-amber-900"
                          }`}
                        >
                          {entry.status === "completed"
                            ? L("নিবন্ধন সম্পন্ন", "Registration complete")
                            : entry.status === "rejected"
                              ? L("বাতিল", "Rejected")
                              : L("পেন্ডিং", "Pending")}
                        </span>
                        <span className="text-[10px] text-slate-500">{date(entry.createdAt)}</span>
                        {officerNotes.length > 0 && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-[10px] font-bold text-red-800"
                            title={officerNotes.map((remark) => remark.text).join("\n")}
                          >
                            <MessageSquareWarning className="h-3.5 w-3.5" />
                            {L("প্রশাসনিক বার্তা", "Officer message")} · {n(officerNotes.length)}
                          </span>
                        )}
                        {entry.synced ? null : (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-1 text-[10px]">
                            <CloudOff className="h-3 w-3" />
                            {L("সিঙ্ক অপেক্ষমাণ", "Sync pending")}
                          </span>
                        )}
                        {entry.smsSent && entry.synced && (
                          <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-1 text-[10px] font-medium text-emerald-800">
                            <CheckCircle2 className="h-3 w-3" />
                            {L("অভিভাবককে SMS পাঠানো হয়েছে", "SMS sent to parent")}
                          </span>
                        )}
                        {entry.status !== "completed" && entry.status !== "rejected" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="ml-auto h-8"
                            onClick={() => goToForm(dialog.type, entry)}
                          >
                            <Pencil className="mr-1 h-3.5 w-3.5" />
                            {L("সংশোধন", "Edit")}
                          </Button>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-slate-600">{address(entry)}</p>
                      <div className="mt-1 flex flex-wrap gap-x-4 text-[10px] text-slate-500">
                        <span>
                          {L("মোবাইল", "Mobile")}: {entry.parentMobile ?? "—"}
                        </span>
                        <span>
                          {L("জন্ম তারিখ", "Date of birth")}: {entry.dob}
                        </span>
                        {entry.type === "birth" && (
                          <span>
                            {L("সন্তানের ক্রম", "Child order")}: {n(entry.order ?? "—")}
                          </span>
                        )}
                        {entry.type === "death" && entry.dod && (
                          <span>
                            {L("মৃত্যুর তারিখ", "Date of death")}: {entry.dod}
                          </span>
                        )}
                      </div>
                      {officerNotes.map((remark, index) => (
                        <p
                          key={`${entry.id}-${index}`}
                          className="mt-2 flex items-start gap-1.5 rounded-md border-l-4 border-red-600 bg-red-50 px-2 py-1.5 text-xs text-red-900"
                        >
                          <MessageSquareWarning className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          {remark.text}
                        </p>
                      ))}
                    </div>
                  );
                })}
                {(dialog.type === "birth" ? births : deaths).length === 0 && (
                  <p className="rounded-lg bg-slate-50 p-6 text-center text-sm text-slate-500">
                    {L("এখনও কোনো এন্ট্রি নেই", "No entries yet")}
                  </p>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
