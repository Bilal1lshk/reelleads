import crypto from "crypto";
import {
  buildPersonalizedPitch,
  buildWhyThisLead,
  computeLeadScore,
  extractContactsFromText,
} from "@/lib/connectors/scoring";
import { buildDedupeKey } from "@/lib/mongodb";
import type { Lead, LeadPlatform, LeadType, SearchLeadsParams } from "@/types/lead";

export type WebSearchPlatform = Extract<
  LeadPlatform,
  "instagram" | "linkedin" | "tiktok" | "facebook" | "reddit" | "x"
>;

interface SearchResultItem {
  title: string;
  url: string;
  description: string;
}

const BUYER_TERMS_BY_TYPE: Record<LeadType, string> = {
  local_brand: "clothing brand",
  coach: "fitness coach",
  creator: "content creator",
  youtuber: "podcast",
  agency: "marketing agency",
};

const EDITING_NICHE_REGEX =
  /\b(reels?\s*edit|video\s*edit|short[\s-]?form\s*edit|capcut|premiere|davinci|after\s*effects)/i;

const COMPETITOR_REGEX =
  /\b(video\s*edit|reels?\s*edit|freelance\s*edit|i\s*am\s*an?\s*edit|i\s*can\s*edit|editing\s*services|editz|editx|amv|capcut\s*template)/i;

const BLOCKED_HANDLES = new Set([
  "p",
  "reel",
  "reels",
  "explore",
  "popular",
  "stories",
  "accounts",
  "tags",
  "tv",
  "about",
  "instagram",
  "facebook",
  "linkedin",
  "tiktok",
  "united",
  "unitednations",
  "nowunited",
  "unitedkingdomofengland",
]);

export function isEditingServiceNiche(niche: string): boolean {
  return EDITING_NICHE_REGEX.test(niche.trim());
}

export function buildBuyerQueryFragment(params: SearchLeadsParams): string {
  const niche = params.niche.trim();
  // If the user entered an industry niche (e.g. "Real estate", "Skincare", "Fitness"),
  // search directly for that industry; if they entered their own service ("Reels editing"),
  // pick the primary buyer persona from selected clientTypes (clean & fast for Google).
  if (niche && !isEditingServiceNiche(niche)) {
    return `"${niche}"`;
  }

  const primaryType: LeadType = params.clientTypes[0] || "coach";
  return `"${BUYER_TERMS_BY_TYPE[primaryType] || "fitness coach"}"`;
}

function buildLocationFragment(params: SearchLeadsParams): string {
  const parts: string[] = [];
  if (params.city?.trim()) parts.push(params.city.trim());
  if (params.country && params.country !== "all") {
    parts.push(params.country.trim());
  }
  return parts.join(" ");
}

function buildPlatformQuery(
  platform: WebSearchPlatform,
  params: SearchLeadsParams
): string {
  const buyer = buildBuyerQueryFragment(params);
  const loc = buildLocationFragment(params);

  switch (platform) {
    case "instagram":
      return `site:instagram.com ${buyer} ${loc} ("gmail.com" OR "whatsapp" OR "wa.me")`.trim();

    case "linkedin":
      return `site:linkedin.com/in ${buyer} ${loc}`.trim();

    case "tiktok":
      return `site:tiktok.com ${buyer} ${loc}`.trim();

    case "facebook":
      return `site:facebook.com ${buyer} ${loc} ("whatsapp" OR "gmail.com")`.trim();

    case "reddit":
      return `site:reddit.com/r/forhire "[Hiring]" "video editor"`;

    case "x":
      return `site:x.com "looking for a video editor"`;
  }
}

async function runApifyGoogleSearch(
  query: string,
  maxResults: number
): Promise<{ items: SearchResultItem[]; error?: string }> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) {
    return { items: [], error: "APIFY_API_TOKEN is not configured." };
  }

  const endpoint = `https://api.apify.com/v2/acts/apify~google-search-scraper/run-sync-get-dataset-items?token=${encodeURIComponent(
    token
  )}`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      queries: query,
      maxPagesPerQuery: 1,
      resultsPerPage: Math.min(Math.max(maxResults, 10), 15),
    }),
    signal: AbortSignal.timeout(65000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    return {
      items: [],
      error: `Apify Google Search HTTP ${res.status}${errText ? `: ${errText.slice(0, 120)}` : ""}`,
    };
  }

  const pages = (await res.json()) as Array<{
    organicResults?: Array<{
      title?: string;
      url?: string;
      description?: string;
    }>;
  }>;

  const organic = pages.flatMap((p) => p.organicResults ?? []);
  return {
    items: organic
      .filter((r) => Boolean(r.url && r.title))
      .map((r) => ({
        title: r.title || "",
        url: r.url || "",
        description: r.description || "",
      })),
  };
}

async function runGoogleCseSearch(
  query: string,
  maxResults: number
): Promise<{ items: SearchResultItem[]; error?: string }> {
  const key = process.env.GOOGLE_CSE_API_KEY || process.env.Custom_Search_API_KEY;
  const cx = process.env.GOOGLE_CSE_CX;
  if (!key || !cx) {
    return { items: [], error: "GOOGLE_CSE_API_KEY or GOOGLE_CSE_CX not set." };
  }

  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", key);
  url.searchParams.set("cx", cx);
  url.searchParams.set("q", query);
  url.searchParams.set("num", String(Math.min(maxResults, 10)));

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(12000) });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    return {
      items: [],
      error: `Google CSE HTTP ${res.status}: ${body.error?.message || "request failed"}`,
    };
  }

  const json = (await res.json()) as {
    items?: Array<{ title?: string; link?: string; snippet?: string }>;
  };
  return {
    items: (json.items ?? [])
      .filter((i) => Boolean(i.link && i.title))
      .map((i) => ({
        title: i.title || "",
        url: i.link || "",
        description: i.snippet || "",
      })),
  };
}

function inferLeadType(
  text: string,
  platform: WebSearchPlatform,
  fallback: LeadType
): LeadType {
  const lower = text.toLowerCase();
  if (lower.includes("agency") || lower.includes("real estate") || lower.includes("marketing")) {
    return "agency";
  }
  if (
    lower.includes("coach") ||
    lower.includes("trainer") ||
    lower.includes("fitness") ||
    lower.includes("consultant") ||
    lower.includes("nutrition")
  ) {
    return "coach";
  }
  if (
    lower.includes("brand") ||
    lower.includes("boutique") ||
    lower.includes("skincare") ||
    lower.includes("clothing") ||
    lower.includes("jewelry") ||
    lower.includes("bakery") ||
    lower.includes("restaurant") ||
    lower.includes("store")
  ) {
    return "local_brand";
  }
  if (platform === "instagram" || platform === "tiktok") return "creator";
  return fallback;
}

function parseResultToLead(
  item: SearchResultItem,
  platform: WebSearchPlatform,
  params: SearchLeadsParams
): Lead | null {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(item.url);
  } catch {
    return null;
  }

  const host = parsedUrl.hostname.toLowerCase().replace(/^www\./, "");
  const pathParts = parsedUrl.pathname.split("/").filter(Boolean);
  const combinedText = `${item.title}\n${item.description}`;

  // Filter out competitor video editors for non-hiring platforms
  if (
    platform !== "reddit" &&
    platform !== "x" &&
    COMPETITOR_REGEX.test(combinedText) &&
    !/\b(hiring|looking for|need a)\b/i.test(combinedText)
  ) {
    return null;
  }

  const contacts = extractContactsFromText(`${combinedText} ${item.url}`);
  let name = item.title.trim();
  let instagram = contacts.instagram;
  let sourceUrl = item.url;
  let country = params.country && params.country !== "all" ? params.country : "Global";
  let city = params.city?.trim() || "";

  if (platform === "instagram") {
    if (!host.includes("instagram.com")) return null;
    const first = pathParts[0]?.replace(/^@/, "");
    if (!first) return null;
    const isDirectProfile = !BLOCKED_HANDLES.has(first.toLowerCase());
    if (isDirectProfile) {
      instagram = `https://instagram.com/${first}`;
      sourceUrl = instagram;
      name = item.title
        .replace(/\s*[•|–-]\s*Instagram.*$/i, "")
        .replace(/\s*\(@[^)]+\)\s*/g, "")
        .trim();
      if (!name || name.length < 2) name = `@${first}`;
    } else {
      // Reject generic aggregator pages like /popular/ or /explore/
      if (first.toLowerCase() !== "p" && first.toLowerCase() !== "reel") return null;
      // Allow /p/ or /reel/ posts ONLY if they contain a real WhatsApp number, email, or @handle
      const handleInText = combinedText.match(/@([a-zA-Z0-9._]{3,30})/)?.[1];
      if (!contacts.whatsapp && !contacts.email && !handleInText) return null;
      if (handleInText && !BLOCKED_HANDLES.has(handleInText.toLowerCase())) {
        instagram = `https://instagram.com/${handleInText}`;
      }
      name = item.title
        .replace(/\s*[•|–-]\s*Instagram.*$/i, "")
        .trim()
        .slice(0, 65);
      if (!name || name.length < 3) return null;
    }
  } else if (platform === "linkedin") {
    if (!host.includes("linkedin.com")) return null;
    if (pathParts[0] !== "in" && pathParts[0] !== "company") return null;
    name = item.title
      .replace(/\s*[|–-]\s*LinkedIn.*$/i, "")
      .split(/\s+[-–|]\s+/)[0]
      .trim();
    if (!name || name.length < 2) return null;
  } else if (platform === "tiktok") {
    if (!host.includes("tiktok.com")) return null;
    const handlePart = pathParts.find((p) => p.startsWith("@"));
    if (!handlePart) return null;
    const handle = handlePart.replace(/^@/, "");
    if (!handle || BLOCKED_HANDLES.has(handle.toLowerCase())) return null;
    sourceUrl = `https://www.tiktok.com/@${handle}`;
    name = item.title
      .replace(/\s*[|–-]\s*TikTok.*$/i, "")
      .replace(/\s*\(@[^)]+\)\s*/g, "")
      .trim();
    if (!name || name.length < 2) name = `@${handle}`;
  } else if (platform === "facebook") {
    if (!host.includes("facebook.com")) return null;
    const first = pathParts[0]?.toLowerCase();
    if (
      !first ||
      [
        "posts",
        "videos",
        "groups",
        "events",
        "watch",
        "marketplace",
        "reel",
        "share",
        "photo.php",
        "permalink.php",
        "story.php",
        "profile.php",
      ].includes(first)
    ) {
      return null;
    }
    name = item.title
      .replace(/\s*[|–-]\s*Facebook.*$/i, "")
      .trim();
    if (!name || name.length < 2) return null;
  } else if (platform === "reddit") {
    if (!host.includes("reddit.com")) return null;
    // Reject "[For Hire]" posts (those are other freelancers looking for work, not clients hiring)
    if (/\[\s*for\s*hire\s*\]/i.test(item.title) || /\/for_hire_/i.test(item.url)) {
      return null;
    }
    if (!/\[hiring\]|\/hiring_|looking for|hiring/i.test(`${item.title} ${item.url}`)) {
      return null;
    }
    name = item.title
      .replace(/\s*:\s*r\/\w+.*$/i, "")
      .replace(/^\[hiring\]\s*/i, "")
      .trim()
      .slice(0, 75);
    if (!name || name.length < 4) return null;
    country = "Global";
    city = "Remote";
  } else if (platform === "x") {
    if (!host.includes("x.com") && !host.includes("twitter.com")) return null;
    const handle = pathParts[0];
    if (!handle || ["search", "hashtag", "explore", "i"].includes(handle.toLowerCase())) {
      return null;
    }
    name = `@${handle}`;
    country = "Global";
    city = "Remote";
  }

  const fallbackType = params.clientTypes[0] || "creator";
  const type =
    platform === "reddit" || platform === "x"
      ? "creator"
      : inferLeadType(combinedText, platform, fallbackType);

  const partial: Partial<Lead> = {
    name,
    type,
    city,
    country,
    followers: contacts.followers,
    email: contacts.email,
    whatsapp: contacts.whatsapp,
    instagram,
    website: contacts.website,
    budgetSignal: contacts.budgetSignal,
    sourcePlatform: platform,
    sourceUrl,
    niche: params.niche,
  };

  const cleanSnippet = item.description.replace(/\s+/g, " ").trim().slice(0, 260);

  const urlHash = crypto
    .createHash("sha256")
    .update(sourceUrl)
    .digest("hex")
    .slice(0, 16);

  const lead: Lead = {
    id: `${platform}-${urlHash}`,
    name,
    type,
    city,
    country,
    score: computeLeadScore(partial),
    whyThisLead: buildWhyThisLead({
      name,
      type,
      platform,
      followers: contacts.followers,
      budgetSignal: contacts.budgetSignal,
      niche: params.niche,
    }),
    email: contacts.email,
    whatsapp: contacts.whatsapp,
    instagram,
    website: contacts.website,
    followers: contacts.followers,
    aiMessage: buildPersonalizedPitch({
      name,
      type,
      niche: params.niche,
      platform,
    }),
    status: "new",
    notes: cleanSnippet || item.title,
    createdAt: new Date().toISOString(),
    sourcePlatform: platform,
    sourceUrl,
    budgetSignal: contacts.budgetSignal,
    niche: params.niche,
  };

  lead.dedupeKey = buildDedupeKey(lead);
  return lead;
}

export async function fetchWebSearchLeadsForPlatform(
  params: SearchLeadsParams,
  platform: WebSearchPlatform
): Promise<{ leads: Lead[]; warning?: string }> {
  const query = buildPlatformQuery(platform, params);
  const perPlatformTarget = Math.min(Math.max(Math.ceil(params.count / 2), 8), 15);

  // Prefer Apify Google Search when APIFY_API_TOKEN is set (reliable & works across all sites);
  // fall back to Google CSE if configured and Apify isn't available.
  let result: { items: SearchResultItem[]; error?: string };
  if (process.env.APIFY_API_TOKEN) {
    result = await runApifyGoogleSearch(query, perPlatformTarget);
    if (result.items.length === 0 && result.error && process.env.GOOGLE_CSE_API_KEY && process.env.GOOGLE_CSE_CX) {
      const cseRes = await runGoogleCseSearch(query, perPlatformTarget);
      if (cseRes.items.length > 0) result = cseRes;
    }
  } else if (process.env.GOOGLE_CSE_API_KEY && process.env.GOOGLE_CSE_CX) {
    result = await runGoogleCseSearch(query, perPlatformTarget);
  } else {
    return {
      leads: [],
      warning: `${platform}: Set APIFY_API_TOKEN (or GOOGLE_CSE_API_KEY + GOOGLE_CSE_CX) in .env.`,
    };
  }

  if (result.error && result.items.length === 0) {
    return { leads: [], warning: `${platform}: ${result.error}` };
  }

  const leads: Lead[] = [];
  const seen = new Set<string>();
  for (const item of result.items) {
    const lead = parseResultToLead(item, platform, params);
    if (!lead) continue;
    const key = lead.dedupeKey || lead.sourceUrl || lead.id;
    if (seen.has(key)) continue;
    seen.add(key);
    leads.push(lead);
  }

  return {
    leads,
    warning:
      leads.length === 0
        ? `${platform}: Search ran cleanly but no valid profiles matched these filters.`
        : undefined,
  };
}
