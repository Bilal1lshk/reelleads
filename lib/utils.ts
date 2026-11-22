import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { LeadPlatform, LeadStatus, LeadType } from "@/types/lead";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const LEAD_TYPE_LABELS: Record<LeadType, string> = {
  local_brand: "Local brand",
  creator: "Instagram creator",
  coach: "Coach",
  youtuber: "YouTuber",
  agency: "Agency",
};

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  replied: "Replied",
  meeting_booked: "Meeting booked",
  won: "Won",
  lost: "Lost",
  not_fit: "Not a fit",
};

export const ALL_LEAD_STATUSES: LeadStatus[] = [
  "new",
  "contacted",
  "replied",
  "meeting_booked",
  "won",
  "lost",
  "not_fit",
];

export const PIPELINE_STATUSES: LeadStatus[] = [
  "new",
  "contacted",
  "replied",
  "meeting_booked",
  "won",
  "lost",
];

export const STATUS_DOT_COLORS: Record<LeadStatus, string> = {
  new: "bg-gray-400",
  contacted: "bg-indigo-500",
  replied: "bg-amber-500",
  meeting_booked: "bg-amber-600",
  won: "bg-green-600",
  lost: "bg-red-500",
  not_fit: "bg-gray-300 dark:bg-gray-600",
};

export const PLATFORM_LABELS: Record<LeadPlatform, string> = {
  reddit: "Reddit",
  youtube: "YouTube",
  google_cse: "Google",
  google_places: "Google Maps",
  exa: "AI Agents",
  instagram: "Instagram",
  tiktok: "TikTok",
  x: "X",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  ytjobs: "YTJobs",
  contra: "Contra",
  upwork: "Upwork",
  behance: "Behance",
  csv_import: "CSV",
  manual: "Manual",
};

export function formatFollowers(count?: number): string {
  if (!count) return "—";
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

export function normalizeWhatsAppDigits(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("03")) {
    return `92${digits.slice(1)}`;
  }
  return digits;
}

export function buildWhatsAppUrl(phone: string, message: string): string {
  const digits = normalizeWhatsAppDigits(phone);
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function buildInstagramUrl(handleOrUrl: string): string {
  const trimmed = handleOrUrl.trim().replace(/[.,;!?)\]]+$/, "");
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const clean = trimmed
    .replace(/^@/, "")
    .replace(/^(www\.)?instagram\.com\//i, "")
    .replace(/\/+$/, "");
  return `https://instagram.com/${clean}`;
}

export function buildExternalUrl(url: string): string {
  const trimmed = url.trim().replace(/[.,;!?)\]]+$/, "");
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

const COUNTRY_EQUIVALENTS: Record<string, string[]> = {
  "united states": ["united states", "us", "usa", "america"],
  pakistan: ["pakistan", "pk"],
  "united arab emirates": ["united arab emirates", "uae", "ae"],
  "saudi arabia": ["saudi arabia", "sa", "ksa"],
  "united kingdom": ["united kingdom", "uk", "gb", "great britain"],
  canada: ["canada", "ca"],
  lebanon: ["lebanon", "lb", "liban"],
  qatar: ["qatar", "qa"],
  germany: ["germany", "de", "deutschland"],
  france: ["france", "fr"],
  italy: ["italy", "it", "italia"],
  spain: ["spain", "es"],
  netherlands: ["netherlands", "nl", "holland"],
};

export function getCountryVariants(country: string): string[] {
  const key = country.trim().toLowerCase();
  for (const variants of Object.values(COUNTRY_EQUIVALENTS)) {
    if (variants.includes(key)) return variants;
  }
  return key ? [key] : [];
}

export function countriesMatch(a?: string, b?: string): boolean {
  if (!b || b === "all") return true;
  if (!a) return false;
  const va = getCountryVariants(a);
  const vb = getCountryVariants(b);
  return va.some((x) => vb.includes(x));
}

export function getScoreTone(score: number): "high" | "medium" | "low" {
  if (score >= 80) return "high";
  if (score >= 50) return "medium";
  return "low";
}

export function stripPersonalNames(text?: string): string {
  if (!text) return "";
  return text
    .replace(/\bI'm\s+(?:Shaheerali|Vanessa|Workspace),\s*/gi, "I'm ")
    .replace(/\bI\s+am\s+(?:Shaheerali|Vanessa|Workspace),\s*/gi, "I am ")
    .replace(/\bI'm\s+(?:Shaheerali|Vanessa|Workspace)\s*[—–-]\s*/gi, "")
    .replace(/\b(?:Shaheerali|Vanessa)\b/gi, "");
}
