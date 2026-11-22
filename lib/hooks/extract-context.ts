import type { Lead, LeadHookContext } from "@/types/lead";

const HIRING_SIGNAL_RE =
  /\b(hiring|looking for|need an? editor|video editor needed|seeking an? editor|editor wanted|apply|freelance editor|edit my|edit our)\b/i;

const VOLUME_RE =
  /\b(\d+\s*(?:[-–to]+\s*\d+\s*)?(?:videos?|reels?|shorts?|tiktoks?|clips?|episodes?)\s*(?:per|a|\/)\s*(?:week|wk|month|mo|day)|daily\s+(?:videos?|reels?|shorts?)|weekly\s+(?:videos?|reels?|shorts?))\b/gi;

const TOOLS_LIST = [
  "Premiere Pro",
  "After Effects",
  "CapCut",
  "DaVinci Resolve",
  "DaVinci",
  "Final Cut Pro",
  "Final Cut",
  "Frame.io",
  "Descript",
];

const FORMAT_LIST = [
  "talking head",
  "faceless",
  "UGC",
  "shorts",
  "reels",
  "long-form",
  "long form",
  "documentary",
  "podcast",
  "vlogs",
  "YouTube Shorts",
  "TikTok",
];

const BUDGET_RE =
  /(?:[$£€]\s*\d[\d,]*(?:\s*[-–to]+\s*[$£€]?\s*\d[\d,]*)?(?:\s*(?:\/|\s*per\s*)(?:video|reel|short|month|mo|hr|hour|project))?|\b\d[\d,]+\s*(?:USD|EUR|GBP|PKR|AED)\b)/gi;

const DEADLINE_RE =
  /\b(asap|urgent|immediately|this week|today|by\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|within\s+\d+\s+(?:days?|hours?))\b/gi;

function dedupeCaseInsensitive(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const clean = item.trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(clean);
    }
  }
  return out;
}

/**
 * Extracts grounded hook context strictly from text already stored on the lead.
 * Never fetches external pages or invents details.
 */
export function extractLeadHookContext(lead: Partial<Lead>): LeadHookContext {
  const capturedAt = new Date().toISOString();
  const snippet = (lead.sourceSnippet || "").trim();
  const raw = (lead.rawText || "").trim();
  const title = (lead.name || "").trim();
  const why = (lead.whyThisLead || "").trim();

  const combinedText = [title, snippet, raw, lead.hiringSignal, lead.budgetSignal, why]
    .filter((v): v is string => Boolean(v && v.trim()))
    .join(" | ");

  const isHiring =
    Boolean(lead.hiringSignal?.trim()) || HIRING_SIGNAL_RE.test(combinedText);

  const requirements: string[] = [];

  // Volume
  for (const m of combinedText.matchAll(VOLUME_RE)) {
    if (m[1]) requirements.push(m[1].trim());
  }

  // Tools
  for (const tool of TOOLS_LIST) {
    const re = new RegExp(`\\b${tool.replace(".", "\\.")}\\b`, "i");
    if (re.test(combinedText)) {
      requirements.push(tool);
    }
  }

  // Format
  for (const fmt of FORMAT_LIST) {
    const re = new RegExp(`\\b${fmt.replace("-", "[-\\s]?")}\\b`, "i");
    if (re.test(combinedText)) {
      requirements.push(fmt);
    }
  }

  // Budget
  if (lead.budgetSignal?.trim()) {
    requirements.push(lead.budgetSignal.trim());
  } else {
    for (const m of combinedText.matchAll(BUDGET_RE)) {
      if (m[0]) requirements.push(m[0].trim());
    }
  }

  // Deadline
  for (const m of combinedText.matchAll(DEADLINE_RE)) {
    if (m[1]) requirements.push(m[1].trim());
  }

  const dedupedReqs = dedupeCaseInsensitive(requirements).slice(0, 6);

  // Determine usable basedOn text
  const primarySignal = snippet || raw || "";
  const hasUsableSignal =
    primarySignal.length >= 12 ||
    dedupedReqs.length > 0 ||
    Boolean(lead.hiringSignal?.trim());

  if (!hasUsableSignal) {
    return {
      sourceType: "generic",
      basedOn: "",
      requirements: [],
      capturedAt,
    };
  }

  let sourceType: LeadHookContext["sourceType"] = "web";
  if (isHiring) {
    sourceType = "hiring_post";
  } else if (lead.sourcePlatform === "youtube") {
    sourceType = "youtube";
  } else if (lead.sourcePlatform === "instagram") {
    sourceType = "instagram";
  } else if (lead.sourcePlatform === "linkedin") {
    sourceType = "linkedin";
  }

  const basedOnRaw = primarySignal || `${title} (${lead.hiringSignal || why})`;
  const basedOn =
    basedOnRaw.length > 180
      ? `${basedOnRaw.slice(0, 177).trim()}...`
      : basedOnRaw;

  return {
    sourceType,
    basedOn,
    requirements: dedupedReqs,
    latestTitle: title && title.length > 3 ? title : undefined,
    capturedAt,
  };
}
