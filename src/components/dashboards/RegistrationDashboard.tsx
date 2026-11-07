import { Fragment, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Activity,
  Baby,
  CalendarCheck2,
  ChartNoAxesCombined,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  ChevronDown,
  Download,
  Eye,
  FileCheck2,
  FileText,
  HeartPulse,
  Home,
  Inbox,
  MapPinned,
  Megaphone,
  MessageSquare,
  MessageSquareWarning,
  PencilLine,
  Printer,
  ShieldAlert,
  ShieldCheck,
  UserRoundCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getCaseDeadline, getDeadlineBand } from "@/lib/compliance";
import { TARGET, type RegCase, type Role } from "@/lib/types";
import { formatUnionBadgeName, formatUnionFullName } from "@/lib/union-label";
import {
  getDemoAttachmentPreview,
  MASTER_APPLICATIONS_KEY,
  MASTER_APPLICATIONS_UPDATED_EVENT,
  casesForStation,
  readMasterRegCases,
  scopedCases,
  useApp,
  writeMasterRegCases,
} from "@/lib/store";
import { RegForm } from "@/components/dashboards/Worker";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge, useCaseHelpers } from "@/components/shared";
import { downloadCSV, printPDF } from "@/lib/report";
import { seedState } from "@/lib/seed";
import { isPolicyReadOnlyRole, type PreviewRole } from "@/lib/dashboard-roles";
import { simulateJurisdiction } from "@/lib/jurisdiction-simulation";
import { getDhakaMonthYear, getMonthlyStationCaseCounts } from "@/lib/monthly-targets";
import { useAssignedRegistrationTarget } from "@/lib/use-assigned-registration-target";
import { getStationsForUpazila, getTargetEntryStations } from "@/lib/monirampur-stations";
import { readDemoRegistrationTargets } from "@/lib/registration-targets";
import {
  MonthlyProgressCard,
  type MonthlyProgressCounts,
} from "@/components/dashboards/MonthlyProgressCard";
import { LoginDialog } from "@/components/Header";
import { WorkerApplicationListPage } from "@/components/modules/WorkerApplicationListPage";
import { AdministrativeErrorBoundary } from "@/components/AdministrativeErrorBoundary";
import { WardKpiPanel } from "@/components/dashboards/WardKpiPanel";
import { AssignedUnionHeader } from "@/components/dashboards/AssignedUnionHeader";
import { printAdministrativeLetter } from "@/components/dashboards/print-birth-greeting-letter";

type DashboardRole = Role | "public";
type ActionFilter = "birth" | "death" | "pending" | "progress" | "completed" | "urgent";
type RoleAction = {
  id: string;
  titleBn: string;
  titleEn: string;
  descriptionBn: string;
  descriptionEn: string;
  Icon?: typeof MapPinned;
  icon?: string;
  link?: "/monitoring" | "/union-master";
  filter?: ActionFilter;
};
type AdminRecord = {
  id: string;
  caseId: string;
  upazilaId: string;
  unionId: string;
  kind: "greeting" | "legal";
  title: string;
  text: string;
  createdAt: number;
  signatureProofName?: string;
  signatureProofDataUrl?: string;
};

const ADMIN_RECORDS_KEY = "uert-admin-records";

function createBirthLegalNoticeTemplate(
  item: RegCase,
  unionName: string,
  upazilaName: string,
  districtName: string,
  villageName: string,
  stage: "first" | "second" | "final",
) {
  const guardianName =
    item.details?.applicantName?.bn?.trim() ||
    item.details?.applicantNameBn?.trim() ||
    item.father.bn ||
    "—";
  const address = [villageName, `ওয়ার্ড ${item.ward}`, unionName].filter(Boolean).join(", ");
  const noticeBody =
    stage === "first"
      ? "আপনার পরিবারে একজন নতুন অতিথি এসেছে এমন সংবাদে অত্র ইউনিয়ন পরিষদ আনন্দিত। আপনাকে জানানো যাচ্ছে যে, জন্ম ও মৃত্যু নিবন্ধন আইন-২০০৪ অনুযায়ী শিশু জন্মের ৪৫ দিনের মধ্যে শিশুর জন্ম নিবন্ধন করার জন্য বিধান রয়েছে। আপনার সন্তানের জন্ম নিবন্ধন তথ্য সংগ্রহের জন্য আপনার নিকট একাধিক বার গ্রামপুলিশ প্রেরণ করা হয়েছে। কিন্তু আপনি অদ্যাবধি এ সংক্রান্ত তথ্য প্রদান করেননি কিংবা আপনি নিজেও আসেননি। যার কারণে আপনার সন্তানের জন্ম নিবন্ধন সম্ভব হয়নি, যাহা শাস্তিযোগ্য অপরাধ।"
      : stage === "second"
        ? "আপনার সন্তানের জন্ম নিবন্ধন সম্পন্ন করার জন্য পূর্বে ৭(২) ধারায় নোটিশ প্রদান করা হয়েছিল। কিন্তু অদ্যাবধি প্রয়োজনীয় তথ্য ও কাগজপত্র জমা না দেওয়ায় নিবন্ধন সম্পন্ন করা সম্ভব হয়নি। জন্ম ও মৃত্যু নিবন্ধন আইন, ২০০৪ অনুযায়ী জন্মের ৪৫ দিনের মধ্যে নিবন্ধন করা বাধ্যতামূলক এবং আইনটির ২১(১) ধারায় নির্ধারিত জরিমানার বিধান রয়েছে। এই নোটিশ প্রাপ্তির তিন দিনের মধ্যে প্রয়োজনীয় কাগজপত্রসহ ইউনিয়ন পরিষদে উপস্থিত হয়ে নিবন্ধন সম্পন্ন করার জন্য পুনরায় অনুরোধ করা হলো।"
        : "এটি আপনার সন্তানের জন্ম নিবন্ধন সংক্রান্ত ৭(২) ধারার চূড়ান্ত নোটিশ। পূর্ববর্তী নোটিশসমূহের পরও প্রয়োজনীয় তথ্য ও কাগজপত্র জমা না দেওয়ায় নিবন্ধন সম্পন্ন হয়নি। জন্ম ও মৃত্যু নিবন্ধন আইন, ২০০৪ এর ২১(১) ধারায় জন্মের ৪৫ দিনের মধ্যে নিবন্ধন না করলে অনধিক ৫০০০/= জরিমানার বিধান রয়েছে। এই নোটিশ প্রাপ্তির তিন দিনের মধ্যে প্রয়োজনীয় কাগজপত্রসহ নিবন্ধন সম্পন্ন না করলে কর্তৃপক্ষ আইনানুগ প্রশাসনিক ব্যবস্থা গ্রহণ করবে।";

  return `নোটিশ
জন্ম ও মৃত্যু নিবন্ধন আইন, ২০০৪ এর ৭(২) ধারা

প্রাপক,
${guardianName}
পিতা: ${item.father.bn || "—"}
ঠিকানা: ${address}

${noticeBody}

${
  stage === "first"
    ? "জন্ম ও মৃত্যু নিবন্ধন আইন, ২০০৪ এর ২১(১) ধারা অনুযায়ী জন্ম বা মৃত্যুর ৪৫ দিনের মধ্যে শিশুর জন্ম নিবন্ধন না করলে অনধিক ৫০০০/= জরিমানা হওয়ার বিধান রয়েছে। সেই গুরুত্ব বিবেচনা করে নোটিশ প্রাপ্তির তিন দিনের মধ্যে নিম্নোক্ত কাগজ-পত্রাদি সহ আপনার সন্তানের জন্ম নিবন্ধন করার জন্য বিশেষভাবে অনুরোধ করা হলো। ব্যর্থতায় কর্তৃপক্ষ কোনো আইনগত ব্যবস্থা গ্রহণ করলে নিম্ন স্বাক্ষর কারী দায়ী থাকবে না।"
    : "নিম্নোক্ত কাগজ-পত্রাদি সহ আপনার সন্তানের জন্ম নিবন্ধন সম্পন্ন করার জন্য বিশেষভাবে অনুরোধ করা হলো।"
}

প্রয়োজনীয় কাগজ-পত্রাদি:
১। পিতা ও মাতার অনলাইন বাংলা ও ইংরেজি জন্ম সনদের ফটোকপি।
২। সচল মোবাইল নম্বর (ওটিপির মাধ্যমে যাচাই করণের জন্য)।
৩। হালনাগাদ হোল্ডিংট্যাক্স পরিশোধ রশিদ।
৪। শিশুর টিকা কার্ড (যদি থাকে)।

অনুলিপি (সদয় জ্ঞাতার্থে)
১। উপজেলা নির্বাহী অফিসার, ${upazilaName}, ${districtName}।

চেয়ারম্যান
${unionName}, ${upazilaName}, ${districtName}`;
}

function getPrintableNoticeBody(text: string) {
  const lines = text.split("\n");
  const addressLine = lines.findIndex((line) => line.trimStart().startsWith("ঠিকানা:"));
  const start = addressLine >= 0 ? addressLine + 1 : 0;
  const end = lines.findIndex(
    (line, index) => index >= start && /^(প্রয়োজনীয়|প্রয়োজনীয়) কাগজ-পত্রাদি:/.test(line.trim()),
  );
  return lines
    .slice(start, end >= 0 ? end : undefined)
    .join("\n")
    .trim();
}

function getPrintableGreetingBody(text: string) {
  const lines = text.split("\n");
  const documentsStart = lines.findIndex((line) =>
    /^(প্রয়োজনীয়|প্রয়োজনীয়) কাগজ-পত্রাদি:/.test(line.trim()),
  );
  const end = documentsStart >= 0 ? documentsStart : lines.length;
  const signatureStart = lines.slice(0, end).lastIndexOf("চেয়ারম্যান");
  return lines
    .slice(0, signatureStart >= 0 ? signatureStart : end)
    .join("\n")
    .trim();
}

function createGreetingTemplate(
  item: RegCase,
  unionName: string,
  upazilaName: string,
  districtName: string,
) {
  if (item.type === "death") {
    return `${item.name.bn}-এর মৃত্যুতে গভীর সমবেদনা। শোকসন্তপ্ত পরিবারের প্রতি সমবেদনা জানাই।\n\nচেয়ারম্যান\n${unionName}`;
  }

  return `${item.name.bn}-এর শুভ জন্ম ও জন্ম নিবন্ধন উপলক্ষে আন্তরিক শুভেচ্ছা ও অভিনন্দন! অনাগত অতিথি এবং তার মায়ের সুস্বাস্থ্য ও সার্বিক মঙ্গল কামনা করি। প্রসব পূর্ব এবং প্রসব কালীন সেবার জন্য নিকটস্থ কমিউনিটি ক্লিনিক বা স্বাস্থ্যকেন্দ্রে যোগাযোগ করার জন্য আপনাকে পরামর্শ প্রদান করছি। কারণ গৃহে প্রসব মা ও শিশুর জীবনের জন্য ঝুঁকিপূর্ণ; অপরদিকে স্বাস্থ্যসেবার আওতায় তা নিরাপদ। এ বিষয়ে প্রয়োজনে আমাদের সাথে যোগাযোগ করতে পারেন।

জন্মের সাথে সাথে যত দ্রুত সম্ভব সন্তানের জন্ম নিবন্ধন সম্পন্ন করা আপনাদের একটি আবশ্যকীয় আইনি দায়িত্ব। আপনাদেরও যদি অনলাইন জন্ম নিবন্ধন না থাকে অবিলম্বে তা করিয়ে নিতে হবে। রাষ্ট্রপ্রদত্ত বিভিন্ন সেবা লাভের জন্য জন্ম নিবন্ধন একটি অতি প্রয়োজনীয় মূল্যবান দলিল। নিবন্ধন কার্যে সার্বিক সহযোগিতা প্রদানের জন্য আমরা সদা প্রস্তুত।

এই পত্রের সঙ্গে একটি জন্ম নিবন্ধন আবেদন ফরম প্রেরণ করা হলো। শিশুর জন্মের পর ফরমটি যথাযথভাবে পূরণকরে রাখার জন্য আপনাকে অনুরোধ করছি। এ বিষয়ে আপনারা স্বাস্থ্য ও পরিবার কল্যাণকর্মীদের পরামর্শ-সহায়তা চাইতে পারেন। সংশ্লিষ্ট গ্রামপুলিশ এই আবেদন পত্রটি আপনাদের নিকট থেকে সংগ্রহ করে ইউনিয়ন পরিষদে জমা দেবেন। এর পর নিবন্ধন সম্পন্ন করে আমরা সনদটি আপনার বাড়িতে পৌঁছে দেব।

প্রয়োজনীয় কাগজ-পত্রাদি:
১। পিতা ও মাতার অনলাইন বাংলা ও ইংরেজি জন্ম সনদের ফটোকপি।
২। সচল মোবাইল নম্বর (ওটিপির মাধ্যমে যাচাই করণের জন্য)।
৩। হালনাগাদ হোল্ডিংট্যাক্স পরিশোধ রশিদ।
৪। শিশুর টিকা কার্ড (যদি থাকে)।

অনুলিপি (সদয় জ্ঞাতার্থে)
১। উপজেলা নির্বাহী অফিসার, ${upazilaName}, ${districtName}।

চেয়ারম্যান
${unionName}, ${upazilaName}, ${districtName}`;
}

function readAdminRecords(): AdminRecord[] {
  const stored = localStorage.getItem(ADMIN_RECORDS_KEY);
  if (!stored) return [];
  const parsed: unknown = JSON.parse(stored);
  if (!Array.isArray(parsed)) throw new Error("Stored administrative records must be an array");
  return parsed.filter(
    (record): record is AdminRecord =>
      typeof record === "object" &&
      record !== null &&
      "id" in record &&
      typeof record.id === "string" &&
      "caseId" in record &&
      typeof record.caseId === "string" &&
      "upazilaId" in record &&
      typeof record.upazilaId === "string" &&
      "unionId" in record &&
      typeof record.unionId === "string" &&
      "kind" in record &&
      (record.kind === "greeting" || record.kind === "legal") &&
      "title" in record &&
      typeof record.title === "string" &&
      "text" in record &&
      typeof record.text === "string" &&
      "createdAt" in record &&
      typeof record.createdAt === "number",
  );
}

function ApplicationList({
  type,
  cases,
  canReject,
  canEdit,
  onNew,
  onReject,
  onEdit,
}: {
  type: "birth" | "death";
  cases: RegCase[];
  canReject: boolean;
  canEdit: boolean;
  onNew?: () => void;
  onReject: (item: RegCase) => void;
  onEdit: (item: RegCase) => void;
}) {
  const { L, n, demoMode } = useApp();
  const { address, rows } = useCaseHelpers();
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"all" | "approved">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [attachmentPreviews, setAttachmentPreviews] = useState<(string | undefined)[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const completed = cases.filter((item) => item.status === "completed");
  const filtered = cases.filter((item) => {
    if (view === "approved" && item.status !== "completed") return false;
    const query = search.trim().toLocaleLowerCase();
    return (
      !query ||
      [
        item.id,
        item.name.bn,
        item.name.en,
        item.father.bn,
        item.father.en,
        item.mother.bn,
        item.mother.en,
      ].some((value) => value.toLocaleLowerCase().includes(query))
    );
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const first = filtered.length ? (currentPage - 1) * pageSize + 1 : 0;
  const last = Math.min(currentPage * pageSize, filtered.length);
  const title =
    type === "birth"
      ? L("জন্ম নিবন্ধনের আবেদন", "Birth Registration Applications")
      : L("মৃত্যু নিবন্ধনের আবেদন", "Death Registration Applications");

  useEffect(() => {
    const selectedCase = cases.find((item) => item.id === expandedId);
    if (!selectedCase || selectedCase.files.length === 0) {
      setAttachmentPreviews([]);
      setAttachmentsLoading(false);
      return;
    }
    let cancelled = false;
    const objectUrls: string[] = [];
    setAttachmentPreviews([]);
    setAttachmentsLoading(true);
    void Promise.all(
      selectedCase.files.map(async (file, index) => {
        if (file.url || file.dataUrl) return file.url ?? file.dataUrl;
        if (!file.path) return getDemoAttachmentPreview(selectedCase.id, index);
        if (demoMode) return getDemoAttachmentPreview(selectedCase.id, index);
        const { data, error } = await supabase.storage.from("case-files").download(file.path);
        if (error) {
          toast.error(
            `${L("সংযুক্তি লোড করা যায়নি", "Could not load attachment")}: ${file.name} · ${error.message}`,
          );
          return undefined;
        }
        const objectUrl = URL.createObjectURL(data);
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return undefined;
        }
        objectUrls.push(objectUrl);
        return objectUrl;
      }),
    ).then((previews) => {
      if (cancelled) return;
      setAttachmentPreviews(previews);
      setAttachmentsLoading(false);
    });
    return () => {
      cancelled = true;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [cases, demoMode, expandedId, L]);

  return (
    <section className="space-y-4" aria-label={title}>
      <nav
        className="flex flex-wrap gap-2"
        aria-label={L("আবেদন তালিকা কার্যক্রম", "Application list actions")}
      >
        <Button
          className="bg-orange-600 text-white hover:bg-orange-700"
          onClick={onNew}
          disabled={!onNew}
        >
          {L("নতুন আবেদন", "New Application")}
        </Button>
        <Button
          className="bg-emerald-700 text-white hover:bg-emerald-800"
          onClick={() => printPDF(L("অনুমোদিত আবেদন", "Approved applications"), rows(completed))}
        >
          {L("প্রিন্ট অনুমোদিত", "Print Approved")}
        </Button>
        <Button
          className={
            view === "approved"
              ? "bg-slate-800 text-white hover:bg-slate-900"
              : "bg-slate-600 text-white hover:bg-slate-700"
          }
          onClick={() => {
            setView((current) => (current === "approved" ? "all" : "approved"));
            setPage(1);
          }}
        >
          {L("পুরাতন সনদ", "Old Certificate")}
        </Button>
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <label className="flex items-center gap-2">
          {L("দেখুন", "Show")}
          <select
            className="h-9 rounded-md border border-input bg-background px-2"
            value={pageSize}
            onChange={(event) => {
              setPageSize(Number(event.target.value));
              setPage(1);
            }}
          >
            {[10, 25, 50].map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </select>
          {L("টি এন্ট্রি", "entries")}
        </label>
        <label className="flex items-center gap-2">
          {L("খুঁজুন:", "Search:")}
          <Input
            className="h-9 w-48"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl border border-emerald-100">
        <table className="w-full min-w-[880px] border-collapse text-left text-sm">
          <thead className="bg-emerald-50 text-emerald-950">
            <tr>
              {[
                L("ক্রমিক নং", "SL"),
                L("আবেদন নং", "App No"),
                L("নাম", "Name"),
                L("পিতার নাম", "Father's Name"),
                L("মাতার নাম", "Mother's Name"),
                L("সংযুক্তি", "Attachments"),
                L("অবস্থা", "Status"),
                L("কার্যক্রম", "Action"),
                ...(canEdit ? [L("সংশোধন করুন", "Edit")] : []),
              ].map((heading) => (
                <th
                  key={heading}
                  className="whitespace-nowrap border-b border-emerald-100 px-3 py-2.5 font-semibold"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((item, index) => (
              <Fragment key={item.id}>
                <tr className="border-b border-slate-100 odd:bg-white even:bg-slate-50/60">
                  <td className="px-3 py-2.5">{n(first + index)}</td>
                  <td className="px-3 py-2.5 font-mono text-xs">
                    {item.id.slice(0, 8).toUpperCase()}
                  </td>
                  <td className="px-3 py-2.5 font-medium">{L(item.name.bn, item.name.en)}</td>
                  <td className="px-3 py-2.5">{L(item.father.bn, item.father.en)}</td>
                  <td className="px-3 py-2.5">{L(item.mother.bn, item.mother.en)}</td>
                  <td className="px-3 py-2.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 px-2"
                      disabled={item.files.length === 0}
                      onClick={() =>
                        setExpandedId((current) => (current === item.id ? null : item.id))
                      }
                    >
                      {n(item.files.length)}
                    </Button>
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusBadge s={item.status} />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        className="h-8 bg-emerald-700 px-2 text-white hover:bg-emerald-800"
                        onClick={() =>
                          setExpandedId((current) => (current === item.id ? null : item.id))
                        }
                      >
                        <Eye className="mr-1 h-3.5 w-3.5" />
                        {L("দেখুন", "View")}
                      </Button>
                      {canReject && item.status !== "completed" && item.status !== "rejected" && (
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-8 px-2"
                          onClick={() => onReject(item)}
                        >
                          <X className="mr-1 h-3.5 w-3.5" />
                          {L("বাতিল", "Reject")}
                        </Button>
                      )}
                    </div>
                  </td>
                  {canEdit && (
                    <td className="px-3 py-2.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 whitespace-nowrap border-amber-200 px-2 text-amber-900 hover:bg-amber-50"
                        disabled={item.status === "completed" || item.status === "rejected"}
                        onClick={() => onEdit(item)}
                      >
                        <PencilLine className="mr-1 h-3.5 w-3.5" />
                        {L("সংশোধন করুন", "Edit")}
                      </Button>
                    </td>
                  )}
                </tr>
                {expandedId === item.id && (
                  <tr className="border-b border-emerald-100 bg-emerald-50/60">
                    <td colSpan={canEdit ? 9 : 8} className="px-4 py-3 text-sm">
                      <div className="grid gap-2 sm:grid-cols-3">
                        <span>
                          {L("জন্ম তারিখ", "Date of birth")}: {item.dob}
                        </span>
                        {item.dod && (
                          <span>
                            {L("মৃত্যুর তারিখ", "Date of death")}: {item.dod}
                          </span>
                        )}
                        <span>
                          {L("মোবাইল", "Mobile")}: {item.parentMobile ?? "—"}
                        </span>
                        <span className="sm:col-span-2">
                          {L("ঠিকানা", "Address")}: {address(item) || "—"}
                        </span>
                        <span>
                          {L("NID", "NID")}: {item.nid || "—"}
                        </span>
                      </div>
                      {attachmentsLoading && expandedId === item.id && (
                        <p className="mt-3 text-sm text-muted-foreground">
                          {L("সংযুক্তি লোড হচ্ছে…", "Loading attachments…")}
                        </p>
                      )}
                      {item.files.length > 0 && (
                        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                          {item.files.map((file, fileIndex) => {
                            const preview = attachmentPreviews[fileIndex];
                            return (
                              <article
                                key={`${file.path ?? file.name}-${fileIndex}`}
                                className="overflow-hidden rounded-lg border border-emerald-100 bg-white"
                              >
                                <div className="flex h-40 items-center justify-center bg-slate-50 p-2">
                                  {preview ? (
                                    <img
                                      src={preview}
                                      alt={file.name}
                                      className="max-h-full max-w-full object-contain"
                                    />
                                  ) : (
                                    <span className="text-xs text-slate-500">{file.name}</span>
                                  )}
                                </div>
                                <div className="space-y-1 p-2 text-xs">
                                  <p className="break-all font-medium">{file.name}</p>
                                  {file.fieldVisit && (
                                    <>
                                      <p className="font-semibold text-emerald-900">
                                        {L("বাড়ি পরিদর্শনের ছবি", "House visit photo")}
                                      </p>
                                      <p>
                                        {L("ছবির সময়", "Photo time")}:{" "}
                                        {new Intl.DateTimeFormat(L("bn-BD", "en-GB"), {
                                          dateStyle: "medium",
                                          timeStyle: "short",
                                          timeZone: "Asia/Dhaka",
                                        }).format(new Date(file.fieldVisit.capturedAt))}
                                      </p>
                                      {file.fieldVisit.latitude !== undefined &&
                                        file.fieldVisit.longitude !== undefined && (
                                          <p>
                                            GPS: {file.fieldVisit.latitude.toFixed(6)},{" "}
                                            {file.fieldVisit.longitude.toFixed(6)}
                                          </p>
                                        )}
                                    </>
                                  )}
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {!visible.length && (
              <tr>
                <td
                  colSpan={canEdit ? 9 : 8}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  {L("কোনো আবেদন পাওয়া যায়নি", "No applications found")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>
          {L(
            `দেখানো হচ্ছে ${n(first)} থেকে ${n(last)} / ${n(filtered.length)}টি এন্ট্রি`,
            `Showing ${first} to ${last} of ${filtered.length} entries`,
          )}
        </span>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            disabled={currentPage <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            {L("আগের", "Previous")}
          </Button>
          {Array.from({ length: pageCount }, (_, index) => index + 1)
            .slice(0, 3)
            .map((number) => (
              <Button
                key={number}
                size="sm"
                variant={number === currentPage ? "default" : "outline"}
                onClick={() => setPage(number)}
              >
                {n(number)}
              </Button>
            ))}
          <Button
            size="sm"
            variant="outline"
            disabled={currentPage >= pageCount}
            onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
          >
            {L("পরের", "Next")}
          </Button>
        </div>
      </footer>
    </section>
  );
}

function monthKey(timestamp: number) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
  }).format(timestamp);
}

const LOCAL_ADMIN_PREVIEW_STATION_ID = "mn-dhakuria";

function createLocalAdminPreviewCases(seedCases: RegCase[], stationId: string) {
  const stations = getStationsForUpazila(
    "manirampur",
    seedState().upazilas.find((item) => item.id === "manirampur")?.unions ?? [],
  );
  const station = stations.find((item) => item.id === stationId) ?? stations[0]!;
  const nameBn = station.bn.replace(/^\d+\s*(?:নং|No\.)\s*/, "");
  const nameEn = station.en.replace(/^\d+ No\.\s*/, "");
  const savedPreviewCases = seedCases.filter(
    (item) =>
      item.upazilaId === "manirampur" &&
      item.unionId === station.id &&
      item.id.startsWith(`local-preview-${station.id}-`),
  );
  const sourceCases = seedCases.filter(
    (item) =>
      item.upazilaId === "manirampur" &&
      item.unionId === stationId &&
      !item.id.startsWith("local-preview-") &&
      item.id !== "preview-birth-ward-2" &&
      item.id !== "preview-death-ward-3",
  );
  const fallbackCases = sourceCases;
  const remapCase = (item: RegCase, id = `local-preview-${stationId}-${item.id}`): RegCase => {
    const village = station.villages.find((candidate) => candidate.ward === item.ward)
      ?? station.villages[0];
    return {
      ...item,
      id,
      upazilaId: "manirampur",
      stationId,
      unionId: stationId,
      villageId: village?.id ?? `${stationId}-v1`,
      details: {
        ...item.details,
        ...(item.type === "birth"
          ? { birthPlace: { bn: `${nameBn} · ওয়ার্ড ${item.ward}`, en: `${nameEn} · Ward ${item.ward}` } }
          : { deathPlace: { bn: `${nameBn} · ওয়ার্ড ${item.ward}`, en: `${nameEn} · Ward ${item.ward}` } }),
      },
    };
  };
  const casesById = new Map(
    fallbackCases.map((item) => {
      const previewCase = remapCase(item);
      return [previewCase.id, previewCase] as const;
    }),
  );
  savedPreviewCases.forEach((item) => casesById.set(item.id, item));
  const cases = Array.from(casesById.values());
  const birthTemplate = fallbackCases.find((item) => item.type === "birth");
  const deathTemplate = fallbackCases.find((item) => item.type === "death");
  if (!birthTemplate || !deathTemplate) return cases;
  const now = Date.now();
  const birthPreview = seedCases.find(
    (item) => item.id === `local-preview-${stationId}-birth-ward-2`,
  );
  const deathPreview = seedCases.find(
    (item) => item.id === `local-preview-${stationId}-death-ward-3`,
  );
  const generatedPreviewCases: RegCase[] = [];
  if (!casesById.has(`local-preview-${stationId}-birth-ward-2`)) {
    generatedPreviewCases.push(
      birthPreview ?? remapCase({
        ...birthTemplate,
        name: { bn: `নমুনা জন্ম আবেদন - ${nameBn}`, en: `Sample birth application - ${nameEn}` },
        ward: 2,
        createdBy: "local-preview",
        createdAt: now,
      }, `local-preview-${stationId}-birth-ward-2`),
    );
  }
  if (!casesById.has(`local-preview-${stationId}-death-ward-3`)) {
    generatedPreviewCases.push(
      deathPreview ?? remapCase({
        ...deathTemplate,
        name: { bn: `নমুনা মৃত্যু আবেদন - ${nameBn}`, en: `Sample death application - ${nameEn}` },
        ward: 3,
        createdBy: "local-preview",
        createdAt: now - 1,
      }, `local-preview-${stationId}-death-ward-3`),
    );
  }
  return [
    ...cases,
    ...generatedPreviewCases,
  ];
}

const executiveQuickAccessActions: RoleAction[] = [
  {
    id: "reports",
    titleBn: "এলাকাভিত্তিক প্রতিবেদন",
    titleEn: "Area-wise report",
    descriptionBn: "প্রশাসনিক এলাকার সারসংক্ষেপ",
    descriptionEn: "Administrative area summaries",
    Icon: MapPinned,
  },
  {
    id: "deadlines",
    titleBn: "সময়সীমা পর্যবেক্ষণ",
    titleEn: "Deadline monitoring",
    descriptionBn: "৩৬৫ দিনের সম্মতি ও সতর্কতা",
    descriptionEn: "365-day compliance and alerts",
    Icon: CalendarCheck2,
    filter: "urgent",
  },
  {
    id: "smart-monitoring",
    titleBn: "স্মার্ট মনিটরিং সিস্টেম",
    titleEn: "Smart Monitoring System",
    descriptionBn: "সার্বিক অগ্রগতি, টার্গেট ও ডাটা মনিটরিং",
    descriptionEn: "Overall progress, targets, and data monitoring",
    Icon: ChartNoAxesCombined,
    link: "/monitoring",
  },
  {
    id: "feedback",
    titleBn: "অভিযোগ জানান বা পরামর্শ দিন",
    titleEn: "Submit complaint or suggestion",
    descriptionBn: "আইসিটি সহায়তা ও পরামর্শ দিন",
    descriptionEn: "Request ICT support or share a suggestion",
    Icon: MessageSquare,
  },
];
const publicActions = executiveQuickAccessActions.filter((item) => item.id !== "smart-monitoring");

const roleActions: Record<Exclude<DashboardRole, "public" | "super" | "district">, RoleAction[]> = {
  worker: [
    {
      id: "birth-entry",
      titleBn: "শিশুর জন্ম তথ্য ও ডকুমেন্টস আপলোড",
      titleEn: "Child birth info & documents upload",
      descriptionBn: "নতুন জন্ম তথ্য ও ৩টি ডকুমেন্ট জমা দিন",
      descriptionEn: "Submit new birth details with documents",
      Icon: Baby,
      filter: "birth",
    },
    {
      id: "death-entry",
      titleBn: "মৃত ব্যক্তির তথ্য ও ডকুমেন্টস আপলোড",
      titleEn: "Deceased person info & documents upload",
      descriptionBn: "নতুন মৃত্যু তথ্য ও ডকুমেন্ট জমা দিন",
      descriptionEn: "Submit new death details with documents",
      Icon: HeartPulse,
      filter: "death",
    },
    {
      id: "birth-list",
      titleBn: "জন্ম নিবন্ধনের আবেদন তালিকা দেখুন",
      titleEn: "View birth registration application list",
      descriptionBn: "জমা দেওয়া জন্ম আবেদন ও মন্তব্য",
      descriptionEn: "Submitted birth applications and remarks",
      Icon: FileText,
      filter: "birth",
    },
    {
      id: "death-list",
      titleBn: "মৃত্যু নিবন্ধনের আবেদন তালিকা দেখুন",
      titleEn: "View death registration application list",
      descriptionBn: "জমা দেওয়া মৃত্যু আবেদন ও মন্তব্য",
      descriptionEn: "Submitted death applications and remarks",
      Icon: FileCheck2,
      filter: "death",
    },
    {
      id: "worker-report",
      titleBn: "রিপোর্ট",
      titleEn: "Reports",
      descriptionBn: "আমার রিপোর্ট ডাউনলোড করুন (Excel/PDF)",
      descriptionEn: "Download my report (Excel/PDF)",
      Icon: Download,
    },
    {
      id: "feedback",
      titleBn: "অভিযোগ জানান বা পরামর্শ দিন",
      titleEn: "Submit complaint or suggestion",
      descriptionBn: "উপজেলা আইসিটি সহায়তা দলকে জানান",
      descriptionEn: "Reach the Upazila ICT support team",
      Icon: MessageSquareWarning,
    },
  ],
  police: [
    {
      id: "birth-entry",
      titleBn: "শিশুর জন্ম তথ্য ও ডকুমেন্টস আপলোড",
      titleEn: "Child birth info & documents upload",
      descriptionBn: "নতুন জন্ম তথ্য ও পরিদর্শনের ছবি জমা দিন",
      descriptionEn: "Submit birth details and a visit photo",
      Icon: Baby,
      filter: "birth",
    },
    {
      id: "death-entry",
      titleBn: "মৃত ব্যক্তির তথ্য ও ডকুমেন্টস আপলোড",
      titleEn: "Deceased person info & documents upload",
      descriptionBn: "নতুন মৃত্যু তথ্য ও পরিদর্শনের ছবি জমা দিন",
      descriptionEn: "Submit death details and a visit photo",
      Icon: HeartPulse,
      filter: "death",
    },
    {
      id: "birth-list",
      titleBn: "জন্ম নিবন্ধনের আবেদন তালিকা দেখুন",
      titleEn: "View birth registration application list",
      descriptionBn: "ওয়ার্ডের জন্ম আবেদন ও পরিদর্শন ছবি",
      descriptionEn: "Ward birth applications and visit photos",
      Icon: FileText,
      filter: "birth",
    },
    {
      id: "death-list",
      titleBn: "মৃত্যু নিবন্ধনের আবেদন তালিকা দেখুন",
      titleEn: "View death registration application list",
      descriptionBn: "ওয়ার্ডের মৃত্যু আবেদন ও পরিদর্শন ছবি",
      descriptionEn: "Ward death applications and visit photos",
      Icon: FileCheck2,
      filter: "death",
    },
  ],
  admin: [
    {
      id: "birth-list",
      titleBn: "জন্ম নিবন্ধনের আবেদন তালিকা",
      titleEn: "Birth Registration Application List",
      descriptionBn: "ইউনিয়নের সব ওয়ার্ডের জন্ম আবেদন ও প্রশাসনিক কার্যক্রম",
      descriptionEn: "Birth applications and administrative actions across all union wards",
      Icon: FileText,
      filter: "birth",
    },
    {
      id: "death-list",
      titleBn: "মৃত্যু নিবন্ধনের আবেদন তালিকা",
      titleEn: "Death Registration Application List",
      descriptionBn: "ইউনিয়নের সব ওয়ার্ডের মৃত্যু আবেদন ও প্রশাসনিক কার্যক্রম",
      descriptionEn: "Death applications and administrative actions across all union wards",
      Icon: FileCheck2,
      filter: "death",
    },
    {
      id: "smart-monitoring",
      titleBn: "স্মার্ট মনিটরিং সিস্টেম",
      titleEn: "Smart Monitoring System",
      descriptionBn: "সার্বিক অগ্রগতি, টার্গেট ও ডাটা মনিটরিং",
      descriptionEn: "Overall progress, targets, and data monitoring",
      Icon: ChartNoAxesCombined,
      link: "/union-master",
    },
    {
      id: "message-tracker",
      titleBn: "প্রেরিত বার্তা ও পরিদর্শন ট্র্যাকার",
      titleEn: "Messages & Inspection Tracker",
      descriptionBn: "শুভেচ্ছা, সমবেদনা ও মাঠ পরিদর্শনের তথ্য",
      descriptionEn: "Greetings, condolences, and field inspection details",
      Icon: MessageSquare,
    },
    {
      id: "pending-cases",
      titleBn: "অপেক্ষমাণ আবেদন",
      titleEn: "Pending applications",
      descriptionBn: "পর্যালোচনার অপেক্ষায় থাকা কেস",
      descriptionEn: "Cases awaiting review",
      Icon: Inbox,
      filter: "pending",
    },
    {
      id: "progress-cases",
      titleBn: "চলমান কেস",
      titleEn: "Cases in progress",
      descriptionBn: "চলমান নিবন্ধন কার্যক্রম",
      descriptionEn: "Registration work in progress",
      Icon: Clock3,
      filter: "progress",
    },
    {
      id: "police-tasks",
      titleBn: "পুলিশ যাচাই",
      titleEn: "Police verification",
      descriptionBn: "ওয়ার্ড যাচাইয়ের জন্য পাঠানো কেস",
      descriptionEn: "Cases assigned for ward verification",
      Icon: UserRoundCheck,
      filter: "pending",
    },
    {
      id: "urgent-cases",
      titleBn: "সময়সীমা সতর্কতা",
      titleEn: "Deadline alerts",
      descriptionBn: "৩৬৫ দিনের সময়সীমার কাছাকাছি কেস",
      descriptionEn: "Cases approaching the 365-day deadline",
      Icon: ShieldAlert,
      filter: "urgent",
    },
    {
      id: "completed-cases",
      titleBn: "সম্পন্ন নিবন্ধন",
      titleEn: "Completed registrations",
      descriptionBn: "চূড়ান্ত নিবন্ধন সম্পন্ন কেস",
      descriptionEn: "Cases with completed registration",
      Icon: CheckCheck,
      filter: "completed",
    },
    {
      id: "union-report",
      titleBn: "ইউনিয়ন প্রতিবেদন",
      titleEn: "Union report",
      descriptionBn: "ইউনিয়নের জন্ম ও মৃত্যু অগ্রগতি",
      descriptionEn: "Birth and death progress for the union",
      Icon: Download,
    },
  ],
  uno: [
    {
      id: "upazila-progress",
      titleBn: "উপজেলা অগ্রগতি",
      titleEn: "Upazila progress",
      descriptionBn: "সামগ্রিক নিবন্ধন অগ্রগতি দেখুন",
      descriptionEn: "Review overall registration progress",
      Icon: MapPinned,
    },
    {
      id: "upazila-births",
      titleBn: "জন্ম নিবন্ধন",
      titleEn: "Birth registrations",
      descriptionBn: "উপজেলার জন্ম নিবন্ধনের কেস",
      descriptionEn: "Birth registration cases across the upazila",
      Icon: Baby,
      filter: "birth",
    },
    {
      id: "smart-monitoring",
      titleBn: "স্মার্ট মনিটরিং সিস্টেম",
      titleEn: "Smart Monitoring System",
      descriptionBn: "সার্বিক অগ্রগতি, টার্গেট ও ডাটা মনিটরিং",
      descriptionEn: "Overall progress, targets, and data monitoring",
      Icon: ChartNoAxesCombined,
      link: "/monitoring",
    },
    {
      id: "upazila-deaths",
      titleBn: "মৃত্যু নিবন্ধন",
      titleEn: "Death registrations",
      descriptionBn: "উপজেলার মৃত্যু নিবন্ধনের কেস",
      descriptionEn: "Death registration cases across the upazila",
      Icon: HeartPulse,
      filter: "death",
    },
    {
      id: "birth-list",
      titleBn: "জন্ম আবেদনের তালিকা",
      titleEn: "Birth applications",
      descriptionBn: "উপজেলার জন্ম আবেদন দেখুন",
      descriptionEn: "View upazila birth applications",
      Icon: FileText,
      filter: "birth",
    },
    {
      id: "death-list",
      titleBn: "মৃত্যু আবেদনের তালিকা",
      titleEn: "Death applications",
      descriptionBn: "উপজেলার মৃত্যু আবেদন দেখুন",
      descriptionEn: "View upazila death applications",
      Icon: FileCheck2,
      filter: "death",
    },
    {
      id: "upazila-pending",
      titleBn: "অপেক্ষমাণ কেস",
      titleEn: "Pending cases",
      descriptionBn: "বিভিন্ন ইউনিয়নের অপেক্ষমাণ কেস",
      descriptionEn: "Pending cases across unions",
      Icon: Inbox,
      filter: "pending",
    },
    {
      id: "compliance-audit",
      titleBn: "সম্মতি নিরীক্ষা",
      titleEn: "Compliance audit",
      descriptionBn: "৩৬৫ দিনের সম্মতি ও জরুরি সতর্কতা",
      descriptionEn: "365-day compliance and urgency alerts",
      Icon: ShieldCheck,
      filter: "urgent",
    },
    {
      id: "upazila-progress-cases",
      titleBn: "চলমান নিবন্ধন",
      titleEn: "Registrations in progress",
      descriptionBn: "চলমান জন্ম ও মৃত্যু নিবন্ধন",
      descriptionEn: "Birth and death registrations in progress",
      Icon: Clock3,
      filter: "progress",
    },
    {
      id: "upazila-completed",
      titleBn: "সম্পন্ন কেস",
      titleEn: "Completed cases",
      descriptionBn: "চূড়ান্ত নিবন্ধন সম্পন্ন কেস",
      descriptionEn: "Cases with completed registration",
      Icon: CheckCheck,
      filter: "completed",
    },
    {
      id: "master-report",
      titleBn: "মাস্টার প্রতিবেদন",
      titleEn: "Master report",
      descriptionBn: "উপজেলাভিত্তিক জন্ম ও মৃত্যু সারসংক্ষেপ",
      descriptionEn: "Upazila birth and death summary",
      Icon: FileText,
    },
    {
      id: "notice-management",
      titleBn: "জরুরি ঘোষণা ও নোটিশ বোর্ড",
      titleEn: "Emergency announcements and notice board",
      descriptionBn: "বিজ্ঞপ্তি দেখুন ও পরিচালনা করুন",
      descriptionEn: "View and manage official notices",
      Icon: Megaphone,
    },
  ],
};

function QuickAccessCard({
  item,
  publicDashboard,
  onActivate,
}: {
  item: {
    id: string;
    title: string;
    description: string;
    Icon?: RoleAction["Icon"];
    icon?: string;
    link?: RoleAction["link"];
  };
  publicDashboard: boolean;
  onActivate: () => void;
}) {
  const className =
    "role-action-card group flex min-h-[3.5rem] cursor-pointer items-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 py-1 text-left shadow-sm transition-all hover:scale-[1.02] hover:border-emerald-500 hover:bg-emerald-50/60 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 max-[360px]:min-h-12 max-[360px]:gap-1.5 max-[360px]:px-2 sm:min-h-[3.75rem] sm:gap-3 sm:px-4 max-sm:flex-col max-sm:justify-center max-sm:px-1 max-sm:py-1 max-sm:text-center";
  const content = (
    <>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-700 text-white transition-colors group-hover:bg-emerald-800 max-sm:hidden">
        {item.icon ? (
          <span className="text-xl leading-none" aria-hidden="true">
            {item.icon}
          </span>
        ) : item.Icon ? (
          <item.Icon className="h-4 w-4" aria-hidden="true" />
        ) : null}
      </span>
      <span className="flex-1 max-sm:w-full">
        <span className="flex items-start gap-1 text-xs font-bold text-[#102a43] sm:text-sm max-sm:justify-center max-sm:text-[10px]">
          <span className="min-w-0 flex-1 break-words">{item.title}</span>
          <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
        </span>
        <span className="mt-0.5 block whitespace-normal break-words text-[10px] text-slate-500 max-[360px]:hidden sm:text-xs max-sm:hidden">
          {item.description}
        </span>
      </span>
    </>
  );

  if (item.link) {
    return (
      <Link to={item.link} className={className}>
        {content}
      </Link>
    );
  }

  if (publicDashboard) {
    switch (item.id) {
      case "reports":
        return (
          <Link to="/dashboard/$section" params={{ section: "unions" }} className={className}>
            {content}
          </Link>
        );
      case "deadlines":
        return (
          <Link to="/dashboard/$section" params={{ section: "compliance" }} className={className}>
            {content}
          </Link>
        );
      case "national-summary":
        return (
          <Link to="/monitoring" className={className}>
            {content}
          </Link>
        );
      case "announcements":
        return (
          <Link to="/announcements" className={className}>
            {content}
          </Link>
        );
      case "notice-management":
        return (
          <Link to="/monitoring" className={className}>
            {content}
          </Link>
        );
      case "worker-report":
      case "feedback":
        return (
          <button type="button" onClick={onActivate} className={className}>
            {content}
          </button>
        );
    }
    return null;
  }

  return (
    <button type="button" onClick={onActivate} className={className}>
      {content}
    </button>
  );
}

export function RegistrationDashboard({
  role = "public",
  simulationRole,
  localAdminPreview = false,
  initialAction,
  onActionDismiss,
}: {
  role?: DashboardRole;
  simulationRole?: PreviewRole;
  localAdminPreview?: boolean;
  initialAction?: "worker-report" | "feedback";
  onActionDismiss?: () => void;
}) {
  const { state, L, n, user, demoMode, activeUnionId, patchCase, setActiveUnionId, findVillage } =
    useApp();
  const simulationEnabled = import.meta.env.DEV && simulationRole !== undefined;
  const isStationSelectorPreview =
    simulationEnabled &&
    !user &&
    (simulationRole === "health_worker" || simulationRole === "village_police");
  const readOnlyPolicyPanel = isPolicyReadOnlyRole(simulationRole);
  const [localPreviewSeed] = useState(seedState);
  const [clientReady, setClientReady] = useState(false);
  useEffect(() => setClientReady(true), []);
  const isLocalAdminPreview =
    localAdminPreview &&
    clientReady &&
    import.meta.env.DEV &&
    role === "admin" &&
    !user &&
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
  const isLocalStationPreview = isLocalAdminPreview || isStationSelectorPreview;
  const navigate = useNavigate();
  const { rows } = useCaseHelpers();
  const [editEntry, setEditEntry] = useState<RegCase | null>(null);
  const [masterPreviewCases, setMasterPreviewCases] = useState<RegCase[]>(() =>
    readMasterRegCases(localPreviewSeed.cases),
  );
  const [previewStationId, setPreviewStationId] = useState(LOCAL_ADMIN_PREVIEW_STATION_ID);
  const previewStations = useMemo(
    () =>
      getTargetEntryStations(
        "manirampur",
        localPreviewSeed.upazilas.find((item) => item.id === "manirampur")?.unions ?? [],
      ),
    [localPreviewSeed],
  );
  const previewStationCases = useMemo(
    () => createLocalAdminPreviewCases(masterPreviewCases, previewStationId),
    [masterPreviewCases, previewStationId],
  );
  const previewStationMetrics = useMemo(
    () =>
      getMonthlyStationCaseCounts(
        previewStationCases,
        "manirampur",
        previewStationId,
        getDhakaMonthYear(),
      ),
    [previewStationCases, previewStationId],
  );
  const [localPreviewCases, setLocalPreviewCases] = useState<RegCase[]>(() =>
    createLocalAdminPreviewCases(masterPreviewCases, LOCAL_ADMIN_PREVIEW_STATION_ID),
  );
  const baselineLocalPreviewCases = useMemo(
    () => createLocalAdminPreviewCases(masterPreviewCases, previewStationId),
    [masterPreviewCases, previewStationId],
  );
  const [previewEditingCase, setPreviewEditingCase] = useState<RegCase | null>(null);
  const [previewEditName, setPreviewEditName] = useState("");
  const [activeCard, setActiveCard] = useState<{ kind: "metric" | "action"; id: string } | null>(
    null,
  );
  const [formInstance, setFormInstance] = useState(0);
  const [correctionSearch, setCorrectionSearch] = useState("");
  const stationMonthlyMetrics = useAssignedRegistrationTarget();
  const [localPreviewTarget, setLocalPreviewTarget] = useState<{
    unionId: string;
    birth: number;
    death: number;
  } | null>(null);
  const [feedbackCategory, setFeedbackCategory] = useState<"complaint" | "suggestion">(
    "suggestion",
  );
  const [feedbackSubject, setFeedbackSubject] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [feedbackLoginOpen, setFeedbackLoginOpen] = useState(false);
  const [adminDraft, setAdminDraft] = useState<{
    kind: "greeting" | "legal";
    item: RegCase;
    stage: "first" | "second" | "final";
  } | null>(null);
  const [adminDraftText, setAdminDraftText] = useState("");
  const [adminSignatureProof, setAdminSignatureProof] = useState<File | null>(null);
  const [adminRecords, setAdminRecords] = useState<AdminRecord[]>([]);
  const [adminDraftSaving, setAdminDraftSaving] = useState(false);
  useEffect(() => {
    if (!isStationSelectorPreview) return;
    if (activeUnionId && previewStations.some((station) => station.id === activeUnionId)) {
      setPreviewStationId(activeUnionId);
      return;
    }
    setActiveUnionId(previewStationId);
  }, [
    activeUnionId,
    isStationSelectorPreview,
    previewStationId,
    previewStations,
    setActiveUnionId,
  ]);
  useEffect(() => {
    const refreshMasterCases = (cases: RegCase[] | null) => {
      if (!cases) return;
      setMasterPreviewCases((current) =>
        JSON.stringify(current) === JSON.stringify(cases) ? current : cases,
      );
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === MASTER_APPLICATIONS_KEY) {
        const cases = readMasterRegCases(localPreviewSeed.cases);
        refreshMasterCases(cases);
        if (isLocalAdminPreview) {
          setLocalPreviewCases(createLocalAdminPreviewCases(cases, previewStationId));
        }
      }
    };
    const onMasterUpdate = (event: Event) => {
      refreshMasterCases((event as CustomEvent<RegCase[]>).detail);
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(MASTER_APPLICATIONS_UPDATED_EVENT, onMasterUpdate);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(MASTER_APPLICATIONS_UPDATED_EVENT, onMasterUpdate);
    };
  }, [isLocalAdminPreview, localPreviewSeed.cases, previewStationId]);
  useEffect(() => {
    if (!isLocalAdminPreview) return;
    const masterCases = readMasterRegCases(localPreviewSeed.cases);
    const mergedCases = new Map(masterCases.map((item) => [item.id, item]));
    const baselineById = new Map(baselineLocalPreviewCases.map((item) => [item.id, item]));
    localPreviewCases.forEach((item) => {
      const baseline = baselineById.get(item.id);
      if (!baseline || JSON.stringify(item) !== JSON.stringify(baseline)) {
        mergedCases.set(item.id, item);
      }
    });
    writeMasterRegCases(Array.from(mergedCases.values()));
  }, [baselineLocalPreviewCases, isLocalAdminPreview, localPreviewCases, localPreviewSeed.cases]);
  useEffect(() => {
    if (user?.role !== "admin" && !isLocalAdminPreview) return;
    try {
      setAdminRecords(
        readAdminRecords().filter(
          (record) =>
            record.upazilaId === (user?.upazilaId ?? "manirampur") &&
            record.unionId === (user?.unionId ?? previewStationId),
        ),
      );
    } catch (cause) {
      console.error("Failed to load administrative records", cause);
      toast.error(L("প্রশাসনিক রেকর্ড লোড করা যায়নি", "Could not load administrative records"));
    }
  }, [L, isLocalAdminPreview, previewStationId, user]);
  useEffect(() => {
    if (!isLocalStationPreview) {
      setLocalPreviewTarget(null);
      return;
    }

    const monthYear = getDhakaMonthYear();
    const refreshTarget = () => {
      const savedTarget = readDemoRegistrationTargets("manirampur", monthYear).find(
        (target) => target.union_id === previewStationId && target.status === "submitted",
      );
      setLocalPreviewTarget(
        savedTarget
          ? {
              unionId: savedTarget.union_id,
              birth: savedTarget.birth_target,
              death: savedTarget.death_target,
            }
          : null,
      );
    };
    refreshTarget();

    const key = `monitoring-union-targets:manirampur:${monthYear}`;
    const onStorage = (event: StorageEvent) => {
      if (event.key === key) refreshTarget();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [isLocalStationPreview, previewStationId]);
  useEffect(() => {
    if (initialAction) setActiveCard({ kind: "action", id: initialAction });
  }, [initialAction]);
  const metrics = [
    {
      id: "districts",
      value: "64",
      label: L("জেলা", "Districts"),
      detail: L("দেশজুড়ে প্রশাসনিক এলাকা", "Administrative areas nationwide"),
      Icon: MapPinned,
    },
    {
      id: "compliance",
      value: "365",
      label: L("দিনের সম্মতি", "Day Compliance"),
      detail: L("আইনি নিবন্ধন সময়সীমা", "Statutory registration window"),
      Icon: CalendarCheck2,
    },
    {
      id: "tiers",
      value: "8",
      label: L("প্রশাসনিক স্তর", "Administrative Tiers"),
      detail: L("জাতীয় থেকে ওয়ার্ড পর্যায়", "National to ward level"),
      Icon: ClipboardCheck,
    },
    {
      id: "target",
      value: "100%",
      label: L("লক্ষ্যমাত্রা", "Target"),
      detail: L("প্রতিটি জন্ম ও মৃত্যু নিবন্ধিত", "Every birth and death registered"),
      Icon: ShieldCheck,
    },
  ];
  const roleConfig = role === "super" || role === "district" ? "uno" : role;
  const isExecutiveQuickAccess = role === "uno" || role === "district" || role === "super";
  const roleActionItems =
    readOnlyPolicyPanel || roleConfig === "public"
      ? publicActions
      : [
          ...roleActions[roleConfig],
          ...(roleConfig === "worker"
            ? []
            : [
                {
                  id: "worker-report",
                  titleBn: "রিপোর্ট",
                  titleEn: "Reports",
                  descriptionBn: "নিবন্ধন প্রতিবেদন ডাউনলোড বা প্রিন্ট করুন",
                  descriptionEn: "Download or print registration reports",
                  Icon: Download,
                },
                {
                  id: "feedback",
                  titleBn: "অভিযোগ ও পরামর্শ",
                  titleEn: "Complaints and feedback",
                  descriptionBn: "অভিযোগ বা পরামর্শ জমা দিন",
                  descriptionEn: "Submit a complaint or suggestion",
                  Icon: MessageSquareWarning,
                },
              ]),
        ];
  const actions = roleActionItems.map(
    ({ titleBn, titleEn, descriptionBn, descriptionEn, ...action }) => ({
      ...action,
      title: L(titleBn, titleEn),
      description: L(descriptionBn, descriptionEn),
    }),
  );
  const executiveQuickAccessItems = executiveQuickAccessActions.map(
    ({ titleBn, titleEn, descriptionBn, descriptionEn, ...action }) => ({
      ...action,
      title: L(titleBn, titleEn),
      description: L(descriptionBn, descriptionEn),
    }),
  );
  const roleScopedCases = useMemo(() => {
    if (isLocalAdminPreview) {
      return simulationEnabled ? masterPreviewCases : localPreviewCases;
    }
    if (isStationSelectorPreview) return previewStationCases;
    if (!user) {
      if (simulationEnabled) return masterPreviewCases;
      return roleConfig === "public"
        ? import.meta.env.DEV
          ? masterPreviewCases
          : state.cases
        : [];
    }
    if (demoMode && simulationEnabled) return state.cases;
    if (demoMode && (user.role === "worker" || user.role === "police")) {
      return state.cases.filter(
        (item) =>
          item.upazilaId === user.upazilaId &&
          item.unionId === user.unionId &&
          item.ward === user.ward,
      );
    }
    return scopedCases(state, user);
  }, [
    demoMode,
    isLocalAdminPreview,
    isStationSelectorPreview,
    localPreviewCases,
    masterPreviewCases,
    previewStationCases,
    roleConfig,
    simulationEnabled,
    state,
    user,
  ]);
  const simulationUpazilas = useMemo(() => {
    if (!simulationEnabled || !user || demoMode || user.role === "super") {
      return state.upazilas;
    }
    const scoped = state.upazilas.filter((area) => {
      if (user.role === "district") return area.districtEn === user.districtId;
      return area.id === user.upazilaId;
    });
    if (user.role === "admin" || user.role === "worker" || user.role === "police") {
      return scoped.map((area) => ({
        ...area,
        unions: area.unions.filter((union) => union.id === user.unionId),
      }));
    }
    return scoped;
  }, [demoMode, simulationEnabled, state.upazilas, user]);
  const jurisdictionScope = useMemo(
    () =>
      simulationEnabled && simulationRole
        ? simulateJurisdiction(
            roleScopedCases,
            simulationUpazilas,
            simulationRole,
            demoMode ? null : user,
          )
        : null,
    [demoMode, roleScopedCases, simulationEnabled, simulationRole, simulationUpazilas, user],
  );
  const filteredCases = useMemo(() => {
    if (jurisdictionScope) return jurisdictionScope.cases;
    return user && (user.role === "worker" || user.role === "police")
      ? roleScopedCases.filter((item) => item.ward === user.ward)
      : roleScopedCases;
  }, [jurisdictionScope, roleScopedCases, user]);
  const unifiedStationCases = useMemo(() => {
    if (isLocalAdminPreview) {
      return casesForStation(masterPreviewCases, "manirampur", previewStationId);
    }
    if (jurisdictionScope) return jurisdictionScope.cases;
    if (!user || !["admin", "worker", "police"].includes(user.role)) return filteredCases;
    const stationId = user.stationId ?? user.unionId;
    if (!stationId) return [];
    return casesForStation(state.cases, user.upazilaId, stationId);
  }, [
    filteredCases,
    isLocalAdminPreview,
    jurisdictionScope,
    masterPreviewCases,
    previewStationId,
    state.cases,
    user,
  ]);
  const currentMonth = monthKey(Date.now());
  const monthCases = filteredCases.filter((item) => monthKey(item.createdAt) === currentMonth);
  const localMetricMonthCases = isLocalAdminPreview
    ? monthCases.filter(
        (item) =>
          item.upazilaId === "manirampur" && (item.stationId ?? item.unionId) === previewStationId,
      )
    : monthCases;
  const localMonthlyCounts: MonthlyProgressCounts = {
    birth: {
      pending: localMetricMonthCases.filter(
        (item) => item.type === "birth" && item.status === "pending",
      ).length,
      progress: localMetricMonthCases.filter(
        (item) => item.type === "birth" && item.status === "progress",
      ).length,
      completed: localMetricMonthCases.filter(
        (item) => item.type === "birth" && item.status === "completed",
      ).length,
      total: localMetricMonthCases.filter((item) => item.type === "birth").length,
    },
    death: {
      pending: localMetricMonthCases.filter(
        (item) => item.type === "death" && item.status === "pending",
      ).length,
      progress: localMetricMonthCases.filter(
        (item) => item.type === "death" && item.status === "progress",
      ).length,
      completed: localMetricMonthCases.filter(
        (item) => item.type === "death" && item.status === "completed",
      ).length,
      total: localMetricMonthCases.filter((item) => item.type === "death").length,
    },
  };
  const sharedStationRoleView =
    roleConfig === "admin" || roleConfig === "worker" || roleConfig === "police";
  const usesStationMetrics =
    !simulationEnabled &&
    !isLocalAdminPreview &&
    sharedStationRoleView &&
    (user?.role === "admin" || user?.role === "worker" || user?.role === "police");
  const monthlyCounts: MonthlyProgressCounts = usesStationMetrics
    ? (stationMonthlyMetrics?.counts ?? {
        birth: { pending: 0, progress: 0, completed: 0, total: 0 },
        death: { pending: 0, progress: 0, completed: 0, total: 0 },
      })
    : isStationSelectorPreview
      ? previewStationMetrics
      : localMonthlyCounts;
  const scopeUpazilaId = user?.upazilaId ?? (isLocalAdminPreview ? "manirampur" : undefined);
  const scopeUnionId = user
    ? (user.stationId ?? user.unionId)
    : isLocalAdminPreview
      ? previewStationId
      : undefined;
  const assignedUpazila = scopeUpazilaId
    ? (isLocalAdminPreview ? localPreviewSeed.upazilas : state.upazilas).find(
        (item) => item.id === scopeUpazilaId,
      )
    : undefined;
  const assignedUnion = assignedUpazila?.unions.find((item) => item.id === scopeUnionId);
  const scopedUpazilas = (isLocalAdminPreview ? localPreviewSeed.upazilas : state.upazilas).filter(
    (item) => {
      if (!user || user.role === "super") return true;
      if (user.role === "district") return item.districtEn === user.districtId;
      return item.id === user.upazilaId;
    },
  );
  const selectedUnionCount = scopedUpazilas.reduce((count, item) => count + item.unions.length, 0);
  const monthlyTargetScale =
    jurisdictionScope?.targetScale ??
    (roleConfig !== "public" && !user && !isLocalAdminPreview
      ? 0
      : roleConfig === "uno" && user?.role === "uno"
        ? (assignedUpazila?.unions.length ?? 1)
        : roleConfig === "admin" && (user?.role === "admin" || isLocalAdminPreview)
          ? 1
          : roleConfig === "worker" && user?.role === "worker"
            ? 1
            : roleConfig === "police" && user?.role === "police"
              ? 1
              : roleConfig === "uno"
                ? Math.max(1, selectedUnionCount)
                : roleConfig === "worker" || roleConfig === "police"
                  ? 1
                  : Math.max(1, selectedUnionCount));
  const targetMonthYear = getDhakaMonthYear();
  const activeUnionTarget = isLocalStationPreview
    ? localPreviewTarget?.unionId === previewStationId
      ? localPreviewTarget
      : null
    : (roleConfig === "admin" || roleConfig === "worker" || roleConfig === "police") &&
        (user?.role === "admin" || user?.role === "worker" || user?.role === "police") &&
        stationMonthlyMetrics?.target !== null &&
        stationMonthlyMetrics?.target?.unionId === (user.stationId ?? user.unionId) &&
        stationMonthlyMetrics?.target?.monthYear === targetMonthYear
      ? stationMonthlyMetrics.target
      : null;
  const requiresSubmittedUnionTarget =
    (roleConfig === "admin" || roleConfig === "worker" || roleConfig === "police") &&
    (user?.role === "admin" || user?.role === "worker" || user?.role === "police") &&
    (!simulationEnabled || isStationSelectorPreview);
  const monthlyTargets = {
    birth:
      activeUnionTarget?.birth ??
      (isStationSelectorPreview || (requiresSubmittedUnionTarget && !isLocalAdminPreview)
        ? 0
        : Math.ceil(TARGET.birth * monthlyTargetScale)),
    death:
      activeUnionTarget?.death ??
      (isStationSelectorPreview || (requiresSubmittedUnionTarget && !isLocalAdminPreview)
        ? 0
        : Math.ceil(TARGET.death * monthlyTargetScale)),
  };
  const monthlyTargetWarning =
    usesStationMetrics && !stationMonthlyMetrics
      ? L("স্টেশনের সামগ্রিক তথ্য লোড করা যায়নি", "Station aggregate could not be loaded")
      : requiresSubmittedUnionTarget && !activeUnionTarget
        ? L(
            "এই মাসের জন্য UNO-এর জমা দেওয়া লক্ষ্যমাত্রা পাওয়া যায়নি",
            "No submitted UNO target was found for this month",
          )
        : undefined;
  const monthlyTarget = monthlyTargets.birth + monthlyTargets.death;
  const monthlyReceived =
    (monthlyCounts.birth.total ??
      monthlyCounts.birth.pending + monthlyCounts.birth.progress + monthlyCounts.birth.completed) +
    (monthlyCounts.death.total ??
      monthlyCounts.death.pending + monthlyCounts.death.progress + monthlyCounts.death.completed);
  const openCases = filteredCases.filter(
    (item) => item.status !== "completed" && item.status !== "rejected",
  );
  const urgency = useMemo(() => {
    const counts = { green: 0, yellow: 0, red: 0, expired: 0, review: 0 };
    for (const item of openCases) {
      const deadline = getCaseDeadline(item);
      if (!deadline) {
        counts.review += 1;
      } else {
        const band = getDeadlineBand(deadline.elapsedDays);
        if (band === "safe") counts.green += 1;
        else if (band === "warning") counts.yellow += 1;
        else if (band === "near-deadline") counts.red += 1;
        else counts.expired += 1;
      }
    }
    return counts;
  }, [openCases]);
  const currentCard =
    activeCard &&
    (activeCard.kind === "metric"
      ? metrics.map((item) => ({ id: item.id, title: item.label, description: item.detail }))
      : actions.map((item) => ({
          id: item.id,
          title: item.title,
          description: item.description,
        }))
    ).find((item) => item.id === activeCard.id);
  const activeAction =
    activeCard?.kind === "action" ? actions.find((item) => item.id === activeCard.id) : undefined;
  const actionSourceCases =
    isLocalAdminPreview || user?.role === "admin" ? unifiedStationCases : filteredCases;
  const actionCases = activeAction?.filter
    ? actionSourceCases.filter((item) => {
        if (activeAction.filter === "birth" || activeAction.filter === "death") {
          return item.type === activeAction.filter;
        }
        if (
          activeAction.filter === "pending" ||
          activeAction.filter === "progress" ||
          activeAction.filter === "completed"
        ) {
          return item.status === activeAction.filter;
        }
        const deadline = getCaseDeadline(item);
        return (
          item.status !== "completed" &&
          item.status !== "rejected" &&
          !!deadline &&
          deadline.elapsedDays > 180
        );
      })
    : actionSourceCases;
  const applicationListType =
    activeAction?.id === "birth-list"
      ? "birth"
      : activeAction?.id === "death-list"
        ? "death"
        : null;
  const completionPercent =
    filteredCases.length === 0
      ? 0
      : Math.round(
          (filteredCases.filter((item) => item.status === "completed").length /
            filteredCases.length) *
            100,
        );
  const scopeUpazila = state.upazilas.find((item) => item.id === user?.upazilaId);
  const scopeUnion = scopeUpazila?.unions.find((item) => item.id === user?.unionId);
  const activeStationId = isLocalStationPreview
    ? previewStationId
    : user
      ? (user.stationId ?? user.unionId)
      : jurisdictionScope?.level === "union"
        ? jurisdictionScope.unionId
        : assignedUnion?.id;
  const badgeUnionId = activeStationId;
  const badgeUnionLocation = badgeUnionId
    ? (isLocalAdminPreview ? localPreviewSeed.upazilas : state.upazilas)
        .map((upazila) => ({
          upazila,
          union: upazila.unions.find((item) => item.id === badgeUnionId),
        }))
        .find((location) => location.union)
    : undefined;
  const unionBadgeLabel = badgeUnionId
    ? badgeUnionLocation?.union
      ? formatUnionBadgeName(badgeUnionLocation.union, badgeUnionLocation.upazila.unions)
      : undefined
    : undefined;
  const unionFullLabel =
    badgeUnionId && badgeUnionLocation?.union
      ? L(
          formatUnionFullName(
            badgeUnionLocation.union,
            badgeUnionLocation.upazila.unions,
            badgeUnionLocation.upazila,
            "bn",
          ),
          formatUnionFullName(
            badgeUnionLocation.union,
            badgeUnionLocation.upazila.unions,
            badgeUnionLocation.upazila,
            "en",
          ),
        )
      : undefined;
  const greetingUnionName = badgeUnionLocation?.union
    ? formatUnionBadgeName(badgeUnionLocation.union, badgeUnionLocation.upazila.unions)
    : undefined;
  const greetingUpazilaName = badgeUnionLocation?.upazila.bn;
  const greetingDistrictName = badgeUnionLocation?.upazila.districtBn;
  const legalNoticeVillageName = adminDraft?.item
    ? findVillage(adminDraft.item.villageId)?.v.bn?.trim() ||
      adminDraft.item.details?.presentAddress?.bn?.trim() ||
      adminDraft.item.details?.birthPlace?.bn?.trim() ||
      "—"
    : "—";
  const adminDraftItem = adminDraft?.item;
  const adminDraftKind = adminDraft?.kind;
  const adminDraftStage = adminDraft?.stage;
  useEffect(() => {
    if (!adminDraftItem || !adminDraftKind || !adminDraftStage) return;
    const unionName = greetingUnionName ?? "ইউনিয়ন পরিষদ";
    const upazilaName = greetingUpazilaName ?? "মণিরামপুর";
    const districtName = greetingDistrictName ?? "যশোর";
    if (adminDraftKind === "greeting") {
      setAdminDraftText(
        createGreetingTemplate(adminDraftItem, unionName, upazilaName, districtName),
      );
    } else if (adminDraftItem.type === "birth") {
      setAdminDraftText(
        createBirthLegalNoticeTemplate(
          adminDraftItem,
          unionName,
          upazilaName,
          districtName,
          legalNoticeVillageName,
          adminDraftStage,
        ),
      );
    }
  }, [
    adminDraftItem,
    adminDraftKind,
    adminDraftStage,
    greetingDistrictName,
    greetingUnionName,
    greetingUpazilaName,
    legalNoticeVillageName,
  ]);
  const activeBadgeLabel = unionFullLabel;
  const scopeLabel = jurisdictionScope
    ? jurisdictionScope.level === "union" && unionBadgeLabel
      ? `${unionBadgeLabel} · ${L("ডেভেলপমেন্ট সিমুলেশন", "Development simulation")}`
      : `${L(jurisdictionScope.labelBn, jurisdictionScope.labelEn)} · ${L("ডেভেলপমেন্ট সিমুলেশন", "Development simulation")}`
    : isLocalAdminPreview
      ? `${L("মণিরামপুর", "Manirampur")} · ${L(assignedUnion?.bn ?? "", assignedUnion?.en ?? "")} · ${L("লোকাল নমুনা ডেটা", "Local mock data")}`
      : !user || user.role === "super"
        ? L("জাতীয় পর্যায়", "National scope")
        : user.role === "district"
          ? `${scopeUpazila?.districtBn ?? user.districtId} ${L("জেলা", "District")}`
          : [
              scopeUpazila && L(scopeUpazila.bn, scopeUpazila.en),
              scopeUnion && L(scopeUnion.bn, scopeUnion.en),
              (user.role === "worker" || user.role === "police") && user.ward
                ? L(`ওয়ার্ড ${user.ward}`, `Ward ${user.ward}`)
                : null,
            ]
              .filter(Boolean)
              .join(" · ");
  const canViewWardKpis =
    simulationEnabled ||
    isLocalAdminPreview ||
    (!!user && ["admin", "district", "uno", "super"].includes(user.role));

  const quickAccessActions = isExecutiveQuickAccess
    ? executiveQuickAccessItems
    : actions.filter((action) => action.id !== "worker-report").slice(0, 4);
  const isEntryCard = activeCard?.id === "birth-entry" || activeCard?.id === "death-entry";
  const formType: "birth" | "death" | null =
    editEntry?.type ??
    (activeCard?.id === "birth-entry" || activeCard?.id === "birth-correction"
      ? "birth"
      : activeCard?.id === "death-entry" || activeCard?.id === "death-correction"
        ? "death"
        : null);
  const correctable = formType
    ? state.cases.filter((item) => {
        if (
          item.type !== formType ||
          item.createdBy !== user?.id ||
          item.status === "completed" ||
          item.status === "rejected"
        )
          return false;
        const query = correctionSearch.trim().toLocaleLowerCase();
        return (
          !query ||
          [item.id, item.name.bn, item.name.en, item.father.bn, item.father.en, item.nid].some(
            (value) => value.toLocaleLowerCase().includes(query),
          )
        );
      })
    : [];
  const dismissActiveCard = () => {
    setActiveCard(null);
    setEditEntry(null);
    if (initialAction) onActionDismiss?.();
  };
  const closeDialog = dismissActiveCard;
  const openCaseDialog = (kind: "metric" | "action", id: string) => {
    if (readOnlyPolicyPanel && kind === "action" && !["worker-report", "feedback"].includes(id)) {
      return;
    }
    if (roleConfig === "worker" && (id === "birth-list" || id === "death-list")) {
      void navigate({
        to: "/worker-applications/$type",
        params: { type: id === "birth-list" ? "birth" : "death" },
      });
      return;
    }
    setActiveCard({ kind, id });
  };
  const rejectApplication = async (item: RegCase) => {
    if (readOnlyPolicyPanel) return;
    if (user?.role !== "admin") return;
    if (!window.confirm(L("এই আবেদনটি বাতিল করবেন?", "Reject this application?"))) return;
    if (await patchCase(item.id, { status: "rejected" })) {
      toast.success(L("আবেদন বাতিল হয়েছে", "Application rejected"));
    }
  };
  const openAdminDraft = (
    kind: "greeting" | "legal",
    item: RegCase,
    stage: "first" | "second" | "final" = "first",
  ) => {
    if (readOnlyPolicyPanel) return;
    if (user?.role !== "admin" && !isLocalAdminPreview) return;
    const personName = L(item.name.bn, item.name.en);
    const stageLabel = stage === "first" ? "১ম" : stage === "second" ? "২য়" : "চূড়ান্ত";
    const itemVillageName =
      findVillage(item.villageId)?.v.bn?.trim() ||
      item.details?.presentAddress?.bn?.trim() ||
      item.details?.birthPlace?.bn?.trim() ||
      "—";
    setAdminDraft({ kind, item, stage });
    setAdminSignatureProof(null);
    setAdminDraftText(
      kind === "greeting"
        ? createGreetingTemplate(
            item,
            greetingUnionName ?? "ইউনিয়ন পরিষদ",
            greetingUpazilaName ?? "মণিরামপুর",
            greetingDistrictName ?? "যশোর",
          )
        : item.type === "birth"
          ? createBirthLegalNoticeTemplate(
              item,
              greetingUnionName ?? "ইউনিয়ন পরিষদ",
              greetingUpazilaName ?? "মণিরামপুর",
              greetingDistrictName ?? "যশোর",
              itemVillageName,
              stage,
            )
          : `${stageLabel} নোটিশ — জন্ম ও মৃত্যু নিবন্ধন আইন, ২০০৪-এর ধারা ৭(২) অনুসারে ${personName}-এর নিবন্ধন সংক্রান্ত প্রয়োজনীয় ব্যবস্থা গ্রহণের জন্য অনুরোধ করা হচ্ছে।`,
    );
  };
  const saveAdminDraft = async () => {
    if (
      readOnlyPolicyPanel ||
      (user?.role !== "admin" && !isLocalAdminPreview) ||
      (!user?.unionId && !isLocalAdminPreview) ||
      !adminDraft ||
      !adminDraftText.trim()
    )
      return;
    setAdminDraftSaving(true);
    try {
      let signatureProofDataUrl: string | undefined;
      if (adminSignatureProof) {
        signatureProofDataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error("Could not read the signature proof file"));
          reader.onload = () => {
            if (typeof reader.result !== "string") {
              reject(new Error("Signature proof did not produce a readable file"));
              return;
            }
            resolve(reader.result);
          };
          reader.readAsDataURL(adminSignatureProof);
        });
      }
      const stageTitle =
        adminDraft.stage === "first" ? "১ম" : adminDraft.stage === "second" ? "২য়" : "চূড়ান্ত";
      const record: AdminRecord = {
        id: crypto.randomUUID(),
        caseId: adminDraft.item.id,
        upazilaId: user?.upazilaId ?? "manirampur",
        unionId: badgeUnionId ?? user?.stationId ?? user?.unionId ?? "",
        kind: adminDraft.kind,
        title:
          adminDraft.kind === "greeting"
            ? adminDraft.item.type === "birth"
              ? "শুভেচ্ছা বার্তা"
              : "সমবেদনা বার্তা"
            : `${stageTitle} ধারা ৭(২) নোটিশ`,
        text: adminDraftText.trim(),
        createdAt: Date.now(),
        ...(adminSignatureProof
          ? {
              signatureProofName: adminSignatureProof.name,
              ...(signatureProofDataUrl ? { signatureProofDataUrl } : {}),
            }
          : {}),
      };
      const records = [...adminRecords, record];
      localStorage.setItem(ADMIN_RECORDS_KEY, JSON.stringify(records));
      setAdminRecords(records);
      setAdminDraft(null);
      setAdminDraftText("");
      setAdminSignatureProof(null);
      toast.success(L("খসড়াটি এই ব্রাউজারে সংরক্ষিত হয়েছে", "Draft saved in this browser"));
    } catch (cause) {
      console.error("Failed to save administrative draft", cause);
      toast.error(
        cause instanceof Error
          ? cause.message
          : L("খসড়া সংরক্ষণ করা যায়নি", "Could not save the draft"),
      );
    } finally {
      setAdminDraftSaving(false);
    }
  };
  const toggleRegistered = async (item: RegCase) => {
    if (readOnlyPolicyPanel) return;
    if (user?.role !== "admin" && !isLocalAdminPreview) return;
    if (item.status === "completed" && item.police?.directApproval) {
      toast.error(L("সরাসরি অনুমোদিত আবেদন স্থায়ীভাবে সম্পন্ন হয়েছে", "Directly approved applications are permanently completed"));
      return;
    }
    if (isLocalAdminPreview || demoMode) {
      toast.error(
        L(
          "বাস্তব আবেদন নিবন্ধনের জন্য ডেমো মোড থেকে বের হয়ে অনুমোদিত ইউপি প্রশাসনিক কর্মকর্তা হিসেবে লগইন করুন",
          "Exit demo mode and sign in as an authorized UP Administrative Officer to register a real application",
        ),
      );
      return;
    }
    if (item.status === "completed") {
      if (await patchCase(item.id, { status: "progress", regNo: "" })) {
        toast.success(L("নিবন্ধিত অবস্থা প্রত্যাহার করা হয়েছে", "Registered status was removed"));
      }
      return;
    }
    const regNo = window.prompt(
      L("১৭ সংখ্যার নিবন্ধন নম্বর লিখুন", "Enter the 17-digit registration number"),
    );
    if (regNo === null) return;
    if (!/^\d{17}$/.test(regNo.trim())) {
      toast.error(
        L(
          "নিবন্ধন নম্বরটি ১৭ সংখ্যার হতে হবে",
          "Registration number must contain exactly 17 digits",
        ),
      );
      return;
    }
    if (await patchCase(item.id, {
      status: "completed",
      regNo: regNo.trim(),
      police: { ...(item.police ?? {}), directApproval: true },
    })) {
      toast.success(L("নিবন্ধিত হয়েছে", "Registered"));
    }
  };
  const administrativeList =
    (user?.role === "admin" || isLocalAdminPreview) && applicationListType
      ? {
          cases: actionCases,
          localPreview: isLocalAdminPreview,
          onHome: dismissActiveCard,
          onRegister: (item: RegCase) => void toggleRegistered(item),
          actions: (item: RegCase, onReviewPhotos: () => void) => (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="whitespace-nowrap border-emerald-200 text-emerald-900 hover:bg-emerald-50"
                >
                  {L("প্রশাসনিক কার্যক্রম", "Administrative actions")}
                  <ChevronDown className="ml-1 h-4 w-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top" className="w-60">
                <DropdownMenuItem onSelect={() => openAdminDraft("greeting", item)}>
                  <MessageSquare className="text-emerald-700" />
                  {item.type === "birth"
                    ? L("শুভেচ্ছা বার্তা", "Greeting message")
                    : L("শোক বার্তা", "Condolence message")}
                </DropdownMenuItem>
                {(
                  [
                    ["first", L("১ম নোটিশ", "1st notice")],
                    ["second", L("২য় নোটিশ", "2nd notice")],
                    ["final", L("চূড়ান্ত নোটিশ", "Final notice")],
                  ] as const
                ).map(([stage, label]) => (
                  <DropdownMenuItem
                    key={stage}
                    onSelect={() => openAdminDraft("legal", item, stage)}
                  >
                    <ShieldAlert className="text-amber-700" />
                    {label}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={onReviewPhotos}>
                  <Eye />
                  {L("GPS ছবি দেখুন", "Review GPS photos")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={item.status === "completed" || item.status === "rejected"}
                  onSelect={() => {
                    if (isLocalAdminPreview) {
                      setPreviewEditingCase(item);
                      setPreviewEditName(item.name.bn);
                    } else {
                      setEditEntry(item);
                      setActiveCard({
                        kind: "action",
                        id: item.type === "birth" ? "birth-list" : "death-list",
                      });
                    }
                  }}
                >
                  <PencilLine />
                  {L("আবেদন সম্পাদনা", "Edit application")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() =>
                    printPDF(
                      item.type === "birth"
                        ? L("জন্ম আবেদন ফর্ম", "Birth application form")
                        : L("মৃত্যু আবেদন ফর্ম", "Death application form"),
                      rows([item]),
                    )
                  }
                >
                  <Printer />
                  {L("আবেদন ফর্ম প্রিন্ট", "Print application form")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ),
          onEdit: (item: RegCase) => {
            if (isLocalAdminPreview) {
              setPreviewEditingCase(item);
              setPreviewEditName(item.name.bn);
            } else {
              setEditEntry(item);
              setActiveCard({
                kind: "action",
                id: item.type === "birth" ? "birth-list" : "death-list",
              });
            }
          },
        }
      : undefined;
  const submitFeedback = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || !feedbackSubject.trim() || feedbackMessage.trim().length < 10) return;
    setFeedbackSaving(true);
    try {
      if (demoMode) {
        const stored = JSON.parse(
          localStorage.getItem("uert-support-requests") || "[]",
        ) as unknown[];
        stored.push({
          id: crypto.randomUUID(),
          userId: user.id,
          upazilaId: user.upazilaId,
          category: feedbackCategory,
          subject: feedbackSubject.trim(),
          message: feedbackMessage.trim(),
          createdAt: Date.now(),
        });
        localStorage.setItem("uert-support-requests", JSON.stringify(stored));
      } else {
        const { error } = await supabase.from("support_requests").insert({
          user_id: user.id,
          upazila_id: user.upazilaId,
          category: feedbackCategory,
          subject: feedbackSubject.trim(),
          message: feedbackMessage.trim(),
        });
        if (error) throw error;
      }
      toast.success(L("আপনার বার্তা জমা হয়েছে", "Your message has been submitted"));
      setFeedbackSubject("");
      setFeedbackMessage("");
      dismissActiveCard();
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : L("বার্তা জমা দেওয়া যায়নি", "Could not submit your message"),
      );
    } finally {
      setFeedbackSaving(false);
    }
  };
  const renderCaseSummary = (cases: RegCase[]) => (
    <div className="grid grid-cols-3 gap-2">
      {[
        { label: L("মোট কেস", "Total cases"), value: cases.length },
        {
          label: L("অপেক্ষমাণ", "Open"),
          value: cases.filter((item) => item.status !== "completed" && item.status !== "rejected")
            .length,
        },
        {
          label: L("সম্পন্ন", "Completed"),
          value: cases.filter((item) => item.status === "completed").length,
        },
      ].map((stat) => (
        <div key={stat.label} className="rounded-lg border border-emerald-100 bg-emerald-50/70 p-3">
          <p className="text-xs text-muted-foreground">{stat.label}</p>
          <p className="mt-1 text-xl font-bold text-emerald-900">{n(stat.value)}</p>
        </div>
      ))}
    </div>
  );
  const renderUrgencySummary = () => {
    const buckets = [
      { label: L("০–৯০ দিন", "0–90 days"), value: urgency.green, color: "bg-emerald-500" },
      { label: L("৯১–১৮০ দিন", "91–180 days"), value: urgency.yellow, color: "bg-amber-400" },
      { label: L("১৮১–৩৬৫ দিন", "181–365 days"), value: urgency.red, color: "bg-red-500" },
      {
        label: L("সময়সীমা পেরিয়েছে", "Past deadline"),
        value: urgency.expired,
        color: "bg-slate-500",
      },
    ];
    const max = Math.max(1, ...buckets.map((item) => item.value));
    return (
      <div className="space-y-3">
        {buckets.map((item) => (
          <div key={item.label}>
            <div className="mb-1 flex justify-between text-xs">
              <span>{item.label}</span>
              <span className="font-semibold">{n(item.value)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`${item.color} h-full rounded-full`}
                style={{ width: `${(item.value / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
        {urgency.review > 0 && (
          <p className="text-xs text-muted-foreground">
            {L("তারিখ যাচাই প্রয়োজন", "Date review needed")}: {n(urgency.review)}
          </p>
        )}
      </div>
    );
  };

  return (
    <section className="dashboard-content flex h-full min-h-0 flex-col overflow-y-auto bg-gradient-to-br from-slate-50 via-[#f3f7f8] to-teal-50/60 text-[#102a43]">
      {applicationListType && roleConfig === "admin" && !editEntry ? (
        <div className="mx-auto flex min-h-0 w-full max-w-none flex-1 flex-col gap-2 px-4 py-2 sm:px-6 lg:px-6">
          {administrativeList ? (
            <AdministrativeErrorBoundary>
              <WorkerApplicationListPage
                type={applicationListType}
                administrative={administrativeList}
              />
            </AdministrativeErrorBoundary>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              {L(
                "এই তালিকা দেখতে অনুমোদিত প্রশাসনিক অ্যাকাউন্টে প্রবেশ করুন।",
                "Sign in with an authorized administrative account to view this list.",
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="mx-auto flex min-h-0 w-full max-w-none flex-1 flex-col gap-1 px-4 py-1 max-[360px]:gap-1 max-[360px]:py-1 sm:gap-1.5 sm:px-6 sm:py-1.5 lg:px-8">
          {isLocalStationPreview && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-white/90 px-3 py-2 shadow-sm">
              <label
                htmlFor="preview-station-switcher"
                className="text-sm font-bold text-emerald-950"
              >
                {L("পরীক্ষার স্টেশন", "Test station")}
              </label>
              <Select
                value={previewStationId}
                onValueChange={(stationId) => {
                  setPreviewStationId(stationId);
                  setActiveUnionId(stationId);
                  if (isLocalAdminPreview) {
                    setLocalPreviewCases(
                      createLocalAdminPreviewCases(masterPreviewCases, stationId),
                    );
                  }
                }}
              >
                <SelectTrigger
                  id="preview-station-switcher"
                  className="ml-auto w-full max-w-sm border-emerald-300 bg-white"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {previewStations.map((station) => (
                    <SelectItem key={station.id} value={station.id}>
                      {L(station.bn, station.en)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid min-h-0 flex-1 gap-1 sm:gap-2 lg:grid-cols-[0.72fr_1.28fr] lg:items-center lg:gap-3">
            <div className="flex min-h-0 flex-col justify-center">
              {isStationSelectorPreview ? (
                <AssignedUnionHeader stationId={previewStationId} upazilaId="manirampur" />
              ) : sharedStationRoleView &&
                user?.role &&
                ["admin", "worker", "police"].includes(user.role) ? (
                <AssignedUnionHeader
                  stationId={user.stationId ?? user.unionId}
                  upazilaId={user.upazilaId}
                />
              ) : unionFullLabel && badgeUnionId ? (
                <p className="mb-1 max-w-3xl text-sm font-extrabold leading-snug text-emerald-950 sm:text-base">
                  {unionFullLabel}
                </p>
              ) : null}
              <h1 className="max-w-3xl font-display text-2xl font-bold leading-tight tracking-tight text-[#102a43] max-[360px]:text-xl sm:text-3xl lg:text-4xl">
                ই-নিবন্ধন ট্র্যাকার
              </h1>
              <p className="mt-1 max-w-3xl text-xs font-semibold leading-snug text-teal-800 max-[360px]:text-[11px] sm:text-sm lg:text-base">
                Birth &amp; Death Registration 365-Day Compliance System
              </p>
              <p className="mt-1 max-w-3xl text-[11px] font-medium leading-snug text-slate-700 sm:text-xs">
                {L(
                  "জন্মের ৩৬৫ দিনের মধ্যে জন্ম ও মৃত্যু নিবন্ধন নিশ্চিতকরণ ব্যবস্থা",
                  "A system to ensure birth and death registration within 365 days",
                )}
              </p>
              {readOnlyPolicyPanel && (
                <p className="mt-2 w-fit rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-900">
                  {L("(নীতিমালা ও পর্যবেক্ষণ প্যানেল)", "(Policy & Oversight Panel)")}
                </p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-white/90 px-2.5 py-1 text-[11px] font-bold text-emerald-800 shadow-sm sm:text-xs">
                  <Activity className="h-3.5 w-3.5" aria-hidden="true" />
                  {L("লাইভ সিস্টেম আপডেট", "Live system updates")}
                </span>
                <span className="rounded-full border border-slate-200 bg-white/75 px-2.5 py-1 text-[11px] font-semibold text-slate-700 sm:text-xs">
                  {L(
                    `${n(filteredCases.length)}টি রেকর্ড পর্যবেক্ষণে`,
                    `${n(filteredCases.length)} records monitored`,
                  )}
                </span>
                {jurisdictionScope && (
                  <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-bold text-violet-800 shadow-sm sm:text-xs">
                    {L("ডেভেলপমেন্ট সিমুলেশন", "Development simulation")}
                  </span>
                )}
              </div>
            </div>

            <MonthlyProgressCard
              counts={monthlyCounts}
              received={monthlyReceived}
              targets={monthlyTargets}
              reportCases={unifiedStationCases}
              reportsEnabled={
                sharedStationRoleView ||
                isLocalAdminPreview ||
                (!!user && ["admin", "district", "uno", "super"].includes(user.role))
              }
              featured
              {...(monthlyTargetWarning ? { warning: monthlyTargetWarning } : {})}
            />
          </div>

          <section className="shrink-0" aria-labelledby="quick-actions-heading">
            <div className="mb-1">
              <h2
                id="quick-actions-heading"
                className="font-display text-sm font-bold text-[#102a43]"
              >
                {L("দ্রুত প্রবেশ", "Quick actions")}
              </h2>
            </div>
            <div className={"grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4"}>
              {quickAccessActions.map(({ id, title, description, Icon, icon, link }) => (
                <QuickAccessCard
                  key={id}
                  item={{
                    id,
                    title,
                    description,
                    ...(Icon ? { Icon } : {}),
                    ...(icon ? { icon } : {}),
                    ...(link ? { link } : {}),
                  }}
                  publicDashboard={roleConfig === "public" || isExecutiveQuickAccess}
                  onActivate={() => openCaseDialog("action", id)}
                />
              ))}
            </div>
          </section>
        </div>
      )}
      <Dialog
        open={activeCard !== null && !(applicationListType && roleConfig === "admin" && !editEntry)}
        onOpenChange={(open) => {
          if (!open) {
            dismissActiveCard();
          }
        }}
      >
        <DialogContent
          className={`left-0 top-0 h-[100svh] max-h-[100svh] w-screen max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-none border-0 bg-background sm:rounded-none ${formType ? "p-2 sm:p-3 lg:px-6" : applicationListType && roleConfig === "admin" ? "p-4 sm:px-6 lg:px-6" : "p-4 sm:p-8 lg:px-[max(2rem,calc((100vw-72rem)/2))]"}`}
        >
          {currentCard && (
            <>
              <DialogHeader className={formType ? "sr-only" : "pr-7 text-left"}>
                <DialogTitle className={formType ? "" : "font-display text-xl text-emerald-950"}>
                  {formType === "birth"
                    ? "জন্ম নিবন্ধন ফর্ম"
                    : formType === "death"
                      ? "মৃত্যু নিবন্ধন ফর্ম"
                      : currentCard.title}
                </DialogTitle>
                <DialogDescription>
                  {formType === "birth"
                    ? "Birth registration form"
                    : formType === "death"
                      ? "Death registration form"
                      : currentCard.description}
                </DialogDescription>
              </DialogHeader>
              {formType ? (
                <div className={formType === "birth" ? "w-full max-w-full space-y-1" : "space-y-3"}>
                  {isEntryCard || editEntry ? (
                    <RegForm
                      key={`${editEntry?.id ?? formType}-${formInstance}`}
                      type={formType}
                      entry={editEntry ?? undefined}
                      onSaved={() => {
                        setEditEntry(null);
                        setActiveCard({
                          kind: "action",
                          id: formType === "birth" ? "birth-entry" : "death-entry",
                        });
                        setFormInstance((instance) => instance + 1);
                      }}
                      onCancel={editEntry ? () => setEditEntry(null) : closeDialog}
                      onEdit={() =>
                        setActiveCard({
                          kind: "action",
                          id: formType === "birth" ? "birth-correction" : "death-correction",
                        })
                      }
                    />
                  ) : (
                    <div className="space-y-3">
                      <Input
                        value={correctionSearch}
                        onChange={(event) => setCorrectionSearch(event.target.value)}
                        placeholder={L(
                          "নাম, NID বা আবেদন নম্বর দিয়ে খুঁজুন",
                          "Search name, NID or application number",
                        )}
                      />
                      {correctable.length === 0 ? (
                        <p className="rounded-lg border p-4 text-sm text-muted-foreground">
                          {L(
                            "সংশোধনযোগ্য কোনো এন্ট্রি নেই।",
                            "No matching entries available to edit.",
                          )}
                        </p>
                      ) : (
                        <ul className="divide-y rounded-lg border">
                          {correctable.map((item) => (
                            <li
                              key={item.id}
                              className="flex items-center justify-between gap-3 p-3 text-sm"
                            >
                              <div className="min-w-0">
                                <p className="truncate font-semibold">
                                  {L(item.name.bn, item.name.en)}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {item.dob} · {item.nid || "—"}
                                </p>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditEntry(item)}
                              >
                                <PencilLine className="h-4 w-4" />
                                {L("সংশোধন করুন", "Edit / Modify")}
                              </Button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              ) : applicationListType && roleConfig === "admin" ? null : applicationListType ? (
                <ApplicationList
                  type={applicationListType}
                  cases={actionCases}
                  canReject={user?.role === "admin"}
                  canEdit={user?.role === "police"}
                  {...(user?.role === "worker" || user?.role === "police"
                    ? { onNew: () => openCaseDialog("action", `${applicationListType}-entry`) }
                    : {})}
                  onReject={rejectApplication}
                  onEdit={(item) => setEditEntry(item)}
                />
              ) : activeCard?.id === "message-tracker" ? (
                <div className="space-y-4">
                  <section className="space-y-2">
                    <h3 className="font-semibold text-emerald-900">
                      {L(
                        "সংরক্ষিত শুভেচ্ছা ও সমবেদনা বার্তা",
                        "Saved greeting and condolence drafts",
                      )}
                    </h3>
                    {adminRecords.filter((record) => record.kind === "greeting").length === 0 ? (
                      <p className="rounded-lg border p-3 text-sm text-muted-foreground">
                        {L("এখনও কোনো বার্তার খসড়া নেই।", "No message drafts yet.")}
                      </p>
                    ) : (
                      adminRecords
                        .filter((record) => record.kind === "greeting")
                        .map((record) => {
                          const relatedCase = roleScopedCases.find(
                            (item) => item.id === record.caseId,
                          );
                          return (
                            <article key={record.id} className="rounded-lg border p-3">
                              <div className="flex flex-wrap justify-between gap-2 text-sm">
                                <strong>
                                  {record.title} ·{" "}
                                  {relatedCase
                                    ? L(relatedCase.name.bn, relatedCase.name.en)
                                    : record.caseId}
                                </strong>
                                <span className="text-muted-foreground">
                                  {new Intl.DateTimeFormat(L("bn-BD", "en-GB"), {
                                    dateStyle: "medium",
                                    timeZone: "Asia/Dhaka",
                                  }).format(new Date(record.createdAt))}
                                </span>
                              </div>
                              <p className="mt-2 whitespace-pre-wrap text-sm">{record.text}</p>
                              {record.signatureProofName && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {L("স্বাক্ষর প্রমাণ", "Signature proof")}:{" "}
                                  {record.signatureProofName}
                                </p>
                              )}
                            </article>
                          );
                        })
                    )}
                  </section>
                  <section className="space-y-2">
                    <h3 className="font-semibold text-emerald-900">
                      {L("GPS পরিদর্শনের রেকর্ড", "GPS inspection records")}
                    </h3>
                    {roleScopedCases.flatMap((item) =>
                      item.files
                        .filter((file) => file.fieldVisit)
                        .map((file, index) => (
                          <article
                            key={`${item.id}-${index}`}
                            className="flex flex-wrap justify-between gap-2 rounded-lg border p-3 text-sm"
                          >
                            <span>
                              {L(item.name.bn, item.name.en)} · {file.name}
                            </span>
                            <span className="text-muted-foreground">
                              {file.fieldVisit?.capturedAt}
                              {file.fieldVisit?.latitude !== undefined &&
                              file.fieldVisit.longitude !== undefined
                                ? ` · ${file.fieldVisit.latitude}, ${file.fieldVisit.longitude}`
                                : ""}
                            </span>
                          </article>
                        )),
                    ).length === 0 && (
                      <p className="rounded-lg border p-3 text-sm text-muted-foreground">
                        {L(
                          "কোনো GPS পরিদর্শন সংরক্ষিত নেই।",
                          "No GPS inspection records are available.",
                        )}
                      </p>
                    )}
                  </section>
                </div>
              ) : activeCard?.id === "worker-report" ? (
                <div className="space-y-4">
                  {canViewWardKpis && <WardKpiPanel cases={actionCases} />}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() => downloadCSV(rows(actionCases), "registration-report.csv")}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      {L("CSV ডাউনলোড", "Download CSV")}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        printPDF(L("নিবন্ধন প্রতিবেদন", "Registration report"), rows(actionCases))
                      }
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      {L("PDF / প্রিন্ট", "PDF / Print")}
                    </Button>
                  </div>
                </div>
              ) : activeCard?.id === "feedback" ? (
                !user ? (
                  <div className="max-w-xl space-y-3">
                    <p className="text-sm text-muted-foreground">
                      {L(
                        "অভিযোগ বা পরামর্শ জমা দিতে প্রথমে লগইন করুন।",
                        "Please sign in to submit a complaint or suggestion.",
                      )}
                    </p>
                    <Button type="button" onClick={() => setFeedbackLoginOpen(true)}>
                      {L("লগইন করুন", "Sign in")}
                    </Button>
                  </div>
                ) : (
                  <form className="max-w-2xl space-y-4" onSubmit={submitFeedback}>
                    <div className="grid gap-2 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-center">
                      <label htmlFor="support-category" className="text-sm font-semibold">
                        {L("বার্তার ধরন", "Message type")}
                      </label>
                      <Select
                        value={feedbackCategory}
                        onValueChange={(value) =>
                          setFeedbackCategory(value as "complaint" | "suggestion")
                        }
                      >
                        <SelectTrigger id="support-category">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="complaint">{L("অভিযোগ", "Complaint")}</SelectItem>
                          <SelectItem value="suggestion">{L("পরামর্শ", "Suggestion")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-center">
                      <label htmlFor="support-subject" className="text-sm font-semibold">
                        {L("বিষয়", "Subject")}
                      </label>
                      <Input
                        id="support-subject"
                        maxLength={160}
                        minLength={3}
                        required
                        value={feedbackSubject}
                        onChange={(event) => setFeedbackSubject(event.target.value)}
                      />
                    </div>
                    <div className="grid gap-2 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-start">
                      <label htmlFor="support-message" className="pt-2 text-sm font-semibold">
                        {L("বিস্তারিত", "Details")}
                      </label>
                      <Textarea
                        id="support-message"
                        className="min-h-32"
                        maxLength={4000}
                        minLength={10}
                        required
                        value={feedbackMessage}
                        onChange={(event) => setFeedbackMessage(event.target.value)}
                      />
                    </div>
                    <div className="flex justify-end">
                      <Button type="submit" disabled={feedbackSaving}>
                        {feedbackSaving ? L("জমা হচ্ছে…", "Submitting…") : L("জমা দিন", "Submit")}
                      </Button>
                    </div>
                  </form>
                )
              ) : (
                <div className="space-y-5">
                  <div className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-900">
                    {L("নির্বাচিত এলাকা", "Selected area")}: {scopeLabel}
                  </div>
                  {renderCaseSummary(activeAction ? actionCases : filteredCases)}
                  {activeCard?.id === "compliance" ||
                  activeCard?.id === "deadlines" ||
                  activeAction?.filter === "urgent" ? (
                    <div>
                      <h3 className="mb-3 text-sm font-semibold">
                        {L("সময়সীমা অনুযায়ী অনিবন্ধিত কেস", "Unregistered cases by deadline")}
                      </h3>
                      {renderUrgencySummary()}
                    </div>
                  ) : null}
                  {activeCard?.id === "districts" ||
                  activeCard?.id === "reports" ||
                  activeCard?.id === "union-report" ||
                  activeCard?.id === "ward-report" ||
                  activeCard?.id === "master-report" ? (
                    <p className="text-sm text-muted-foreground">
                      {L(
                        "নির্বাচিত এলাকায় প্রশাসনিক ইউনিট",
                        "Administrative units in the selected area",
                      )}
                      : {n(scopedUpazilas.length)} {L("উপজেলা", "upazilas")} ·{" "}
                      {n(selectedUnionCount)} {L("ইউনিয়ন/পৌরসভা", "unions/municipalities")}
                    </p>
                  ) : null}
                  {activeCard?.id === "tiers" && (
                    <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                      {[
                        "জাতীয়",
                        "বিভাগ",
                        "জেলা",
                        "সিটি কর্পোরেশন",
                        "পৌরসভা",
                        "উপজেলা",
                        "ইউনিয়ন",
                        "ওয়ার্ড",
                      ].map((tier) => (
                        <span
                          key={tier}
                          className="rounded-md border border-emerald-100 px-2 py-2 text-center"
                        >
                          {L(tier, tier)}
                        </span>
                      ))}
                    </div>
                  )}
                  {activeCard?.id === "target" && (
                    <div>
                      <div className="mb-2 flex justify-between text-sm">
                        <span>{L("বর্তমান সম্পন্নতা", "Current completion")}</span>
                        <span className="font-semibold">{n(completionPercent)}%</span>
                      </div>
                      <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-emerald-500 transition-all"
                          style={{ width: `${completionPercent}%` }}
                        />
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {L(
                          "লক্ষ্যমাত্রা: প্রতিটি জন্ম ও মৃত্যু নিবন্ধিত",
                          "Target: register every birth and death",
                        )}
                      </p>
                    </div>
                  )}
                  {activeCard?.id === "security" && (
                    <div className="rounded-lg border border-emerald-100 p-3 text-sm">
                      <p className="font-semibold">
                        {L("নিরাপদ, ভূমিকা-ভিত্তিক প্রবেশ", "Secure, role-based access")}
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        {L(
                          "অধিকৃত কর্মীরা লগইন করে নিজস্ব প্রশাসনিক এলাকার তথ্য ও কার্যক্রম দেখেন। প্রশাসনিক ভূমিকার জন্য বহুস্তরের যাচাইকরণ প্রয়োজন।",
                          "Authorized staff sign in to access information and actions for their administrative area. Privileged roles require multi-factor verification.",
                        )}
                      </p>
                      <p className="mt-2 text-xs text-emerald-800">
                        {L(
                          "কর্মী · প্রশাসক · পুলিশ · উপজেলা নির্বাহী কর্মকর্তা · সুপার অ্যাডমিন",
                          "Worker · Administrator · Police · Upazila Executive Officer · Super Admin",
                        )}
                      </p>
                    </div>
                  )}
                  {activeCard?.id === "dashboard" && (
                    <div className="rounded-lg border border-emerald-100 p-3 text-sm">
                      <div className="mb-2 flex items-center justify-between">
                        <span>{L("সম্পন্ন নিবন্ধন", "Completed registrations")}</span>
                        <strong>{n(completionPercent)}%</strong>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full bg-emerald-500"
                          style={{ width: `${completionPercent}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={adminDraft !== null}
        onOpenChange={(open) => {
          if (!open) {
            setAdminDraft(null);
            setAdminSignatureProof(null);
          }
        }}
      >
        <DialogContent className="max-h-[90svh] max-w-2xl overflow-y-auto border-emerald-200">
          {adminDraft && (
            <>
              <DialogHeader className="text-left">
                <DialogTitle className="font-display text-xl text-emerald-950">
                  {adminDraft.kind === "legal"
                    ? L("ধারা ৭(২) আইনি নোটিশের খসড়া", "Section 7(2) legal notice draft")
                    : adminDraft.item.type === "birth"
                      ? L("শুভেচ্ছা বার্তা তৈরি করুন", "Create a greeting")
                      : L("সমবেদনা বার্তা তৈরি করুন", "Create a condolence message")}
                </DialogTitle>
                <DialogDescription>
                  {L("আবেদনকারী", "Applicant")}:{" "}
                  {L(adminDraft.item.name.bn, adminDraft.item.name.en)}
                  {" · "}
                  {L(
                    "খসড়া ব্রাউজারে সংরক্ষিত হবে; কোনো বার্তা পাঠানো হবে না",
                    "Draft is saved locally; no message will be sent",
                  )}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <Textarea
                  aria-label={L("বার্তার খসড়া", "Draft message")}
                  className="min-h-48"
                  maxLength={5000}
                  value={adminDraftText}
                  onChange={(event) => setAdminDraftText(event.target.value)}
                />
                {adminDraft.kind === "greeting" && (
                  <div className="space-y-2">
                    <label htmlFor="chairman-signature-proof" className="text-sm font-semibold">
                      {L(
                        "চেয়ারম্যানের স্বাক্ষর প্রমাণ (ঐচ্ছিক)",
                        "Chairman signature proof (optional)",
                      )}
                    </label>
                    <Input
                      id="chairman-signature-proof"
                      type="file"
                      accept="image/png,image/jpeg,application/pdf"
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0] ?? null;
                        if (file && file.size > 1024 * 1024) {
                          toast.error(
                            L(
                              "ফাইলের আকার ১ MB-এর বেশি হতে পারবে না",
                              "File must be 1 MB or smaller",
                            ),
                          );
                          event.currentTarget.value = "";
                          setAdminSignatureProof(null);
                          return;
                        }
                        setAdminSignatureProof(file);
                      }}
                    />
                    {adminSignatureProof && (
                      <p className="text-xs text-muted-foreground">{adminSignatureProof.name}</p>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const item = adminDraft.item;
                      const unionName = greetingUnionName ?? "ইউনিয়ন পরিষদ";
                      const upazilaName = greetingUpazilaName ?? "মণিরামপুর";
                      const districtName = greetingDistrictName ?? "যশোর";
                      const stageTitle =
                        adminDraft.stage === "first"
                          ? "১ম নোটিশ - ধারা ৭(২)"
                          : adminDraft.stage === "second"
                            ? "২য় নোটিশ"
                            : "৩য় নোটিশ";
                      const recipientName =
                        item.details?.applicantName?.bn?.trim() ||
                        item.details?.applicantNameBn?.trim() ||
                        item.father.bn ||
                        "—";
                      const printed = printAdministrativeLetter({
                        unionName,
                        upazilaName,
                        districtName,
                        recipientName,
                        date: new Intl.DateTimeFormat("bn-BD", {
                          dateStyle: "long",
                          timeZone: "Asia/Dhaka",
                        }).format(new Date()),
                        title:
                          adminDraft.kind === "greeting"
                            ? item.type === "birth"
                              ? "শুভেচ্ছা বার্তা"
                              : "সমবেদনা বার্তা"
                            : stageTitle,
                        body:
                          adminDraft.kind === "legal"
                            ? getPrintableNoticeBody(adminDraftText)
                            : getPrintableGreetingBody(adminDraftText),
                        showRequiredDocuments: item.type === "birth",
                      });
                      if (!printed) {
                        toast.error(
                          L(
                            "প্রিন্ট উইন্ডো খোলা যায়নি। পপ-আপ অনুমতি দিন।",
                            "Could not open the print window. Allow pop-ups and try again.",
                          ),
                        );
                      }
                    }}
                  >
                    <Printer className="mr-2 h-4 w-4" />
                    {L("প্রিন্ট", "Print")}
                  </Button>
                  <Button
                    type="button"
                    disabled={!adminDraftText.trim() || adminDraftSaving}
                    onClick={() => void saveAdminDraft()}
                  >
                    {adminDraftSaving
                      ? L("সংরক্ষণ হচ্ছে…", "Saving…")
                      : L("খসড়া সংরক্ষণ", "Save draft")}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={previewEditingCase !== null}
        onOpenChange={(open) => !open && setPreviewEditingCase(null)}
      >
        <DialogContent className="max-w-lg border-emerald-200">
          {previewEditingCase && (
            <>
              <DialogHeader className="text-left">
                <DialogTitle className="text-emerald-950">
                  {L("নমুনা আবেদন সম্পাদনা", "Edit mock application")}
                </DialogTitle>
                <DialogDescription>
                  {L(
                    "এই পরিবর্তন শুধু এই স্থানীয় প্রিভিউর নমুনা ডেটায় প্রযোজ্য হবে।",
                    "Changes apply only to mock data in this local preview.",
                  )}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <label
                  className="block space-y-1 text-sm font-medium"
                  htmlFor="preview-applicant-name"
                >
                  {L("আবেদনকারীর নাম", "Applicant name")}
                  <Input
                    id="preview-applicant-name"
                    value={previewEditName}
                    onChange={(event) => setPreviewEditName(event.target.value)}
                  />
                </label>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setPreviewEditingCase(null)}
                  >
                    {L("বাতিল", "Cancel")}
                  </Button>
                  <Button
                    type="button"
                    disabled={!previewEditName.trim()}
                    onClick={() => {
                      setLocalPreviewCases((current) =>
                        current.map((item) =>
                          item.id === previewEditingCase.id
                            ? { ...item, name: { ...item.name, bn: previewEditName.trim() } }
                            : item,
                        ),
                      );
                      setPreviewEditingCase(null);
                      toast.success(L("নমুনা আবেদন আপডেট হয়েছে", "Mock application updated"));
                    }}
                  >
                    {L("নমুনা সংরক্ষণ", "Save mock")}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <LoginDialog open={feedbackLoginOpen} onClose={() => setFeedbackLoginOpen(false)} />
    </section>
  );
}
