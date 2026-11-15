import {
  Baby,
  ChartNoAxesCombined,
  Download,
  FileCheck2,
  FileText,
  HeartPulse,
  MessageSquareWarning,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/lib/types";

type ActionFilter = "birth" | "death" | "pending" | "progress" | "completed" | "urgent";

export type RoleAction = {
  id: string;
  titleBn: string;
  titleEn: string;
  descriptionBn: string;
  descriptionEn: string;
  Icon?: LucideIcon;
  icon?: string;
  link?: "/monitoring" | "/union-master";
  filter?: ActionFilter;
};

export type ResolvedRoleAction = Omit<
  RoleAction,
  "titleBn" | "titleEn" | "descriptionBn" | "descriptionEn"
> & {
  title: string;
  description: string;
};

export const QUICK_ACCESS_ACTIONS: RoleAction[] = [
  {
    id: "birth-entry",
    titleBn: "শিশুর জন্ম তথ্য ও ডকুমেন্টস আপলোড",
    titleEn: "Child birth information & documents upload",
    descriptionBn: "নতুন জন্ম তথ্য ও পরিদর্শনের ছবি জমা দিন",
    descriptionEn: "Submit new birth information and visit photos",
    Icon: Baby,
    filter: "birth",
  },
  {
    id: "death-entry",
    titleBn: "মৃত ব্যক্তির তথ্য ও ডকুমেন্টস আপলোড",
    titleEn: "Deceased person information & documents upload",
    descriptionBn: "নতুন মৃত্যু তথ্য ও পরিদর্শনের ছবি জমা দিন",
    descriptionEn: "Submit new death information and visit photos",
    Icon: HeartPulse,
    filter: "death",
  },
  {
    id: "birth-list",
    titleBn: "জন্ম নিবন্ধনের আবেদন তালিকা",
    titleEn: "Birth registration applications",
    descriptionBn: "ওয়ার্ডের জন্ম আবেদন ও পরিদর্শন ছবি",
    descriptionEn: "Ward birth applications and inspection photos",
    Icon: FileText,
    filter: "birth",
  },
  {
    id: "death-list",
    titleBn: "মৃত্যু নিবন্ধনের আবেদন তালিকা",
    titleEn: "Death registration applications",
    descriptionBn: "ওয়ার্ডের মৃত্যু আবেদন ও পরিদর্শন ছবি",
    descriptionEn: "Ward death applications and inspection photos",
    Icon: FileCheck2,
    filter: "death",
  },
  {
    id: "worker-report",
    titleBn: "রিপোর্ট প্রস্তুত করুন",
    titleEn: "Prepare report",
    descriptionBn: "নিবন্ধন প্রতিবেদন তৈরি, ডাউনলোড বা প্রিন্ট করুন",
    descriptionEn: "Create, download, or print a registration report",
    Icon: Download,
  },
  {
    id: "smart-monitoring",
    titleBn: "স্মার্ট মনিটরিং সিস্টেম",
    titleEn: "Smart Monitoring System",
    descriptionBn: "সার্বিক অগ্রগতি, টার্গেট ও ডাটা মনিটরিং",
    descriptionEn: "Overall progress, targets, and data monitoring",
    Icon: ChartNoAxesCombined,
  },
  {
    id: "feedback",
    titleBn: "অভিযোগ ও পরামর্শ",
    titleEn: "Complaints and suggestions",
    descriptionBn: "অভিযোগ বা পরামর্শ জমা দিন",
    descriptionEn: "Submit a complaint or suggestion",
    Icon: MessageSquareWarning,
  },
];

export function getQuickAccessActionsForRole(role: Role | "public"): RoleAction[] {
  const isExecutive = role === "uno" || role === "district" || role === "super";

  return QUICK_ACCESS_ACTIONS.map((item) => {
    if ((role === "public" || isExecutive) && item.id === "worker-report") {
      return { ...item, id: "reports" };
    }
    if (item.id === "smart-monitoring") {
      if (role === "admin") return { ...item, link: "/union-master" };
      if (isExecutive) return { ...item, link: "/monitoring" };
    }
    return item;
  });
}
