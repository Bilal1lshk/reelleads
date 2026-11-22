const GENERIC_SITE_NAMES = new Set([
  "reddit",
  "youtube",
  "linkedin",
  "indeed",
  "glassdoor",
  "upwork",
  "contra",
  "ytjobs",
  "behance",
  "instagram",
  "facebook",
  "tiktok",
  "x",
  "twitter",
  "google",
  "exa",
  "jobs",
  "careers",
]);

const JOB_TITLE_PATTERN = /\b(apply|hiring|job|jobs|wanted|looking for)\b/i;
const SEPARATOR_PATTERN = /\s*(?:\||–|—)\s*/;

export interface ParsedLeadName {
  displayName: string;
  postSnippet: string | null;
}

/**
 * Display-only parser for lead names that look like job posts or page titles.
 * Never mutates stored data. Logs titles that could not be parsed cleanly.
 */
export function parseLeadDisplayName(
  name: string,
  fallbackSnippet?: string
): ParsedLeadName {
  const raw = (name || "").trim();
  if (!raw) {
    return { displayName: "Unnamed lead", postSnippet: fallbackSnippet ?? null };
  }

  const looksLikeTitle =
    raw.length > 60 ||
    JOB_TITLE_PATTERN.test(raw) ||
    raw.includes("|") ||
    raw.includes("–") ||
    raw.includes("—");

  if (!looksLikeTitle) {
    return { displayName: raw, postSnippet: null };
  }

  // 1. Try splitting on "|" or "–" or "—" and taking the last non-generic segment
  if (SEPARATOR_PATTERN.test(raw)) {
    const parts = raw
      .split(SEPARATOR_PATTERN)
      .map((p) => p.trim())
      .filter(Boolean);
    for (let i = parts.length - 1; i >= 0; i -= 1) {
      const candidate = parts[i];
      const lower = candidate.toLowerCase();
      if (
        candidate.length >= 2 &&
        candidate.length <= 50 &&
        !GENERIC_SITE_NAMES.has(lower) &&
        !JOB_TITLE_PATTERN.test(candidate)
      ) {
        return { displayName: candidate, postSnippet: raw };
      }
    }
  }

  // 2. Try extracting "at <Company>" or "for <Company>" or "by <Author>"
  const prepMatch = raw.match(
    /\b(?:at|for|by|with)\s+([A-Z][A-Za-z0-9&.'\-\s]{1,40}?)(?:\s*[-–—|,(]|$)/
  );
  if (prepMatch?.[1]) {
    const candidate = prepMatch[1].trim();
    if (
      candidate.length >= 2 &&
      !GENERIC_SITE_NAMES.has(candidate.toLowerCase()) &&
      !JOB_TITLE_PATTERN.test(candidate)
    ) {
      return { displayName: candidate, postSnippet: raw };
    }
  }

  // 3. Could not parse cleanly: log and return original name
  console.warn("[Overview] Could not parse lead title:", raw);
  return { displayName: raw, postSnippet: null };
}

export function formatRelativeTime(iso?: string | null): string {
  if (!iso) return "";
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "";
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths}mo ago`;
}

export function formatShortDate(iso?: string | null): string {
  if (!iso) return "";
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "";
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
