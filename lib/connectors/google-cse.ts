import crypto from "node:crypto";
import {
  buildPersonalizedPitch,
  buildWhyThisLead,
  computeLeadScore,
  extractContactsFromText,
} from "@/lib/connectors/scoring";
import {
  getCached,
  setCached,
  splitNiches,
  type SourceContext,
} from "@/lib/connectors/source-utils";
import {
  getHubCity,
  inferLocationFromText,
  resolveCountryFilters,
} from "@/lib/countries";
import { buildDedupeKey } from "@/lib/mongodb";
import type { Lead, LeadType, SearchLeadsParams } from "@/types/lead";

interface GoogleCseItem {
  title?: string;
  link?: string;
  snippet?: string;
  displayLink?: string;
}

interface GoogleCseResponse {
  items?: GoogleCseItem[];
  error?: { code?: number; message?: string };
}

const MAX_QUERIES_PER_RUN = 6;
const GOOGLE_CSE_CAP = 30;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface CseQuerySpec {
  query: string;
  targetCountry?: string;
  niche: string;
}

const LINKEDIN_ROLE_TERMS: Record<LeadType, string> = {
  agency: '("founder" OR "agency owner" OR "creative director")',
  coach: '("coach" OR "consultant" OR "mentor")',
  local_brand: '("founder" OR "owner" OR "marketing")',
  creator: '("creator" OR "content creator")',
  youtuber: '("youtuber" OR "youtube")',
};

function buildLinkedInRoleFragment(clientTypes: LeadType[]): string {
  const primary = clientTypes[0];
  if (primary && LINKEDIN_ROLE_TERMS[primary]) {
    return LINKEDIN_ROLE_TERMS[primary];
  }
  return '("founder" OR "owner" OR "coach" OR "creator")';
}

function buildCseQueries(params: SearchLeadsParams): CseQuerySpec[] {
  const niches = splitNiches(params.niche);
  const { allowed } = resolveCountryFilters(params);
  const countries = allowed.length > 0 ? allowed : [""];
  const queries: CseQuerySpec[] = [];

  for (let i = 0; i < niches.length && queries.length < MAX_QUERIES_PER_RUN; i++) {
    const niche = niches[i];
    const country = countries[i % countries.length];
    const location = params.city?.trim() || (country ? getHubCity(country) || country : "");

    if (queries.length < MAX_QUERIES_PER_RUN) {
      queries.push({
        query: [
          "site:instagram.com",
          `"${niche}"`,
          location ? `"${location}"` : "",
          '"DM" OR "collab"',
        ]
          .filter(Boolean)
          .join(" "),
        targetCountry: country || undefined,
        niche,
      });
    }

    if (queries.length < MAX_QUERIES_PER_RUN) {
      queries.push({
        query: [
          "site:linkedin.com/in",
          '"founder"',
          `"${niche}"`,
          country ? `"${country}"` : "",
        ]
          .filter(Boolean)
          .join(" "),
        targetCountry: country || undefined,
        niche,
      });
    }

    if (queries.length < MAX_QUERIES_PER_RUN) {
      queries.push({
        query: [
          '"hiring video editor"',
          `"${niche}"`,
          country ? `"${country}"` : "",
        ]
          .filter(Boolean)
          .join(" "),
        targetCountry: country || undefined,
        niche,
      });
    }
  }

  return queries.slice(0, MAX_QUERIES_PER_RUN);
}

function buildLinkedInCseQueries(params: SearchLeadsParams): CseQuerySpec[] {
  const niches = splitNiches(params.niche);
  const { allowed } = resolveCountryFilters(params);
  const countries = allowed.length > 0 ? allowed : [""];
  const roleFragment = buildLinkedInRoleFragment(params.clientTypes);
  const queries: CseQuerySpec[] = [];

  for (let i = 0; i < niches.length && queries.length < MAX_QUERIES_PER_RUN; i++) {
    const niche = niches[i];
    const country = countries[i % countries.length];
    const location = params.city?.trim() || country || "";

    queries.push({
      query: [
        "site:linkedin.com/in",
        `"${niche}"`,
        roleFragment,
        location ? `"${location}"` : "",
      ]
        .filter(Boolean)
        .join(" "),
      targetCountry: country || undefined,
      niche,
    });

    if (queries.length < MAX_QUERIES_PER_RUN && countries.length > 1) {
      const altCountry = countries[(i + 1) % countries.length];
      if (altCountry && altCountry !== country) {
        queries.push({
          query: [
            "site:linkedin.com/in",
            `"${niche}"`,
            roleFragment,
            `"${altCountry}"`,
          ]
            .filter(Boolean)
            .join(" "),
          targetCountry: altCountry,
          niche,
        });
      }
    }
  }

  return queries.slice(0, MAX_QUERIES_PER_RUN);
}

function cleanTitleToName(title: string, isLinkedIn = false): string {
  const base = title
    .replace(/\s*\(@[^)]+\).*$/i, "")
    .replace(/\s*[•|–-]\s*(Instagram|LinkedIn|YouTube|Reddit).*$/i, "")
    .trim();
  if (isLinkedIn) {
    const personPart = base.split(/\s+[–-]\s+/)[0]?.trim();
    if (personPart && personPart.length >= 2) {
      return personPart.slice(0, 80);
    }
  }
  return base.slice(0, 80);
}

function extractInstagramFromLink(link: string): string | undefined {
  const match = link.match(/instagram\.com\/([a-zA-Z0-9._]{2,30})/i);
  if (!match) return undefined;
  const handle = match[1].toLowerCase();
  if (["p", "reel", "reels", "explore", "stories", "tv"].includes(handle)) {
    return undefined;
  }
  return `https://instagram.com/${handle}`;
}

function inferLeadType(link: string, text: string, fallback: LeadType): LeadType {
  const lower = `${link} ${text}`.toLowerCase();
  if (lower.includes("linkedin.com") || lower.includes("founder") || lower.includes("agency")) {
    return "agency";
  }
  if (lower.includes("coach") || lower.includes("mentor")) return "coach";
  if (lower.includes("youtube.com")) return "youtuber";
  if (lower.includes("instagram.com")) return "creator";
  return fallback;
}

function detectHiringPhrase(text: string): string | undefined {
  const lower = text.toLowerCase();
  for (const phrase of ["hiring video editor", "looking for", "hiring", "need video editor", "budget"]) {
    const idx = lower.indexOf(phrase);
    if (idx !== -1) return text.slice(idx, idx + phrase.length);
  }
  return undefined;
}

async function runGoogleCseQueries(
  params: SearchLeadsParams,
  queries: CseQuerySpec[],
  sourcePlatform: "google_cse" | "linkedin",
  ctx?: SourceContext
): Promise<{ leads: Lead[]; warning?: string }> {
  const apiKey = process.env.GOOGLE_CSE_API_KEY || process.env.Custom_Search_API_KEY;
  const cx = process.env.GOOGLE_CSE_CX;

  if (!apiKey || !cx) {
    return {
      leads: [],
      warning:
        sourcePlatform === "linkedin"
          ? "LinkedIn (Google CSE): Set GOOGLE_CSE_API_KEY and GOOGLE_CSE_CX in .env."
          : "Google CSE: Set GOOGLE_CSE_API_KEY and GOOGLE_CSE_CX in .env.",
    };
  }

  const isLinkedInMode = sourcePlatform === "linkedin";
  const start = (((params.runIndex ?? 0) % 5) * 10) + 1;
  let dateRestrict: string | undefined;
  if (params.sinceIso) {
    const ageMs = Date.now() - new Date(params.sinceIso).getTime();
    if (Number.isFinite(ageMs) && ageMs > 0) {
      const days = ageMs / (24 * 60 * 60 * 1000);
      dateRestrict = days <= 1.5 ? "d1" : days <= 8 ? "w1" : "m1";
    }
  }
  const seenUrls = new Set<string>();
  const collected: Lead[] = [];
  const errors: string[] = [];

  for (const q of queries) {
    if (ctx?.signal.aborted || collected.length >= GOOGLE_CSE_CAP) break;

    const cacheKey = `cse:${crypto
      .createHash("sha256")
      .update(`${cx}:${q.query}:start=${start}:dr=${dateRestrict ?? ""}`)
      .digest("hex")
      .slice(0, 20)}`;

    let items = await getCached<GoogleCseItem[]>(cacheKey, CACHE_TTL_MS);

    if (!items) {
      try {
        const url = new URL("https://www.googleapis.com/customsearch/v1");
        url.searchParams.set("key", apiKey);
        url.searchParams.set("cx", cx);
        url.searchParams.set("q", q.query);
        if (start > 1) {
          url.searchParams.set("start", String(start));
        }
        if (dateRestrict) {
          url.searchParams.set("dateRestrict", dateRestrict);
        }
        url.searchParams.set("num", "10");

        const fetchSignal = ctx?.signal
          ? AbortSignal.any([ctx.signal, AbortSignal.timeout(8000)])
          : AbortSignal.timeout(8000);

        const res = await fetch(url.toString(), { signal: fetchSignal });
        const json = (await res.json()) as GoogleCseResponse;

        if (!res.ok || json.error) {
          const msg = json.error?.message || `HTTP ${res.status}`;
          errors.push(`Google CSE (${res.status}): ${msg}`);
          if (res.status === 403 || res.status === 429) break;
          continue;
        }

        items = json.items ?? [];
        await setCached(cacheKey, items);
      } catch (err) {
        if (ctx?.signal.aborted) break;
        errors.push(
          `Google CSE: ${err instanceof Error ? err.message : "request failed"}`
        );
        continue;
      }
    }

    for (const item of items) {
      if (collected.length >= GOOGLE_CSE_CAP) break;
      const link = item.link?.trim();
      if (!link) continue;

      const urlKey = link.toLowerCase();
      if (isLinkedInMode && !urlKey.includes("linkedin.com/in/")) continue;
      if (seenUrls.has(urlKey)) continue;
      seenUrls.add(urlKey);

      const title = item.title?.trim() || item.displayLink || "Google Result";
      const snippet = item.snippet?.trim() || "";
      const combined = `${title}\n${snippet}`;

      const contacts = extractContactsFromText(combined);
      const igFromLink = extractInstagramFromLink(link);
      const instagram = igFromLink || contacts.instagram;
      const website =
        !link.includes("instagram.com") && !link.includes("linkedin.com")
          ? link
          : contacts.website;

      const inferred = inferLocationFromText(combined);
      const country = inferred.verified
        ? inferred.country
        : q.targetCountry || "Unknown";
      const countryVerified = inferred.verified || Boolean(q.targetCountry);

      const hiringSignal = detectHiringPhrase(combined);
      const leadType = inferLeadType(
        link,
        combined,
        params.clientTypes[0] || "creator"
      );
      const isLinkedInLink = isLinkedInMode || urlKey.includes("linkedin.com/in/");
      const name = cleanTitleToName(title, isLinkedInLink) || title.slice(0, 60);

      const partial: Partial<Lead> = {
        name,
        type: leadType,
        city: inferred.city || params.city || "",
        country,
        countryVerified,
        email: contacts.email,
        whatsapp: contacts.whatsapp,
        instagram,
        website,
        budgetSignal: contacts.budgetSignal,
        hiringSignal,
        sourcePlatform,
        sourceUrl: link,
        sourceSnippet: snippet || title,
        niche: q.niche,
      };

      const lead: Lead = {
        id: `${isLinkedInMode ? "li" : "cse"}-${crypto
          .createHash("md5")
          .update(urlKey)
          .digest("hex")
          .slice(0, 12)}`,
        name,
        type: leadType,
        city: partial.city!,
        country,
        countryVerified,
        score: computeLeadScore(partial),
        whyThisLead: buildWhyThisLead({
          name,
          type: leadType,
          platform: sourcePlatform,
          budgetSignal: contacts.budgetSignal,
          hiringSignal,
          niche: q.niche,
        }),
        email: contacts.email,
        whatsapp: contacts.whatsapp,
        instagram,
        website,
        aiMessage: buildPersonalizedPitch({
          name,
          type: leadType,
          niche: q.niche,
          platform: sourcePlatform,
          signalText: snippet || title,
          clientName: params.clientName,
          offer: params.offer,
        }),
        status: "new",
        notes: (isLinkedInLink ? `${cleanTitleToName(title)} — ${snippet}` : snippet).slice(0, 260) || undefined,
        createdAt: new Date().toISOString(),
        sourcePlatform,
        sourceUrl: link,
        sourceSnippet: snippet || title,
        hiringSignal,
        budgetSignal: contacts.budgetSignal,
        niche: q.niche,
      };
      lead.dedupeKey = buildDedupeKey(lead);
      collected.push(lead);
      ctx?.partial.push(lead);
    }
  }

  return {
    leads: collected.slice(0, GOOGLE_CSE_CAP),
    warning: errors.length > 0 && collected.length === 0 ? errors[0] : undefined,
  };
}

export async function fetchGoogleCseLeads(
  params: SearchLeadsParams,
  ctx?: SourceContext
): Promise<{ leads: Lead[]; warning?: string }> {
  return runGoogleCseQueries(params, buildCseQueries(params), "google_cse", ctx);
}

export async function fetchLinkedInLeadsViaGoogleCse(
  params: SearchLeadsParams,
  ctx?: SourceContext
): Promise<{ leads: Lead[]; warning?: string }> {
  return runGoogleCseQueries(
    params,
    buildLinkedInCseQueries(params),
    "linkedin",
    ctx
  );
}
