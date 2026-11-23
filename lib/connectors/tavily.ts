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
  type SourceResult,
} from "@/lib/connectors/source-utils";
import {
  getHubCity,
  inferLocationFromText,
  resolveCountryFilters,
} from "@/lib/countries";
import { buildDedupeKey } from "@/lib/mongodb";
import type { Lead, LeadType, SearchLeadsParams } from "@/types/lead";

interface TavilyResultItem {
  title?: string;
  url?: string;
  content?: string;
  score?: number;
}

interface TavilySearchResponse {
  results?: TavilyResultItem[];
  detail?: string;
}

const MAX_QUERIES_PER_RUN = 4;
const TAVILY_CAP = 30;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const EXCLUDED_DOMAINS = [
  "yelp.com",
  "yellowpages.com",
  "bbb.org",
  "mapquest.com",
  "tripadvisor.com",
  "indeed.com",
  "glassdoor.com",
  "ziprecruiter.com",
  "wikipedia.org",
];

interface TavilyQuerySpec {
  query: string;
  targetCountry?: string;
  niche: string;
}

const CLIENT_TYPE_HINTS: Record<LeadType, string> = {
  local_brand: "local business brand shop",
  agency: "agency studio",
  coach: "coach clinic practice",
  creator: "creator studio",
  youtuber: "studio media",
};

function buildTavilyQueries(params: SearchLeadsParams): TavilyQuerySpec[] {
  const niches = splitNiches(params.niche);
  const { allowed } = resolveCountryFilters(params);
  const countries = allowed.length > 0 ? allowed : [""];
  const types =
    params.clientTypes.length > 0
      ? params.clientTypes
      : (["local_brand"] as LeadType[]);
  const queries: TavilyQuerySpec[] = [];

  for (let i = 0; i < niches.length && queries.length < MAX_QUERIES_PER_RUN; i++) {
    const niche = niches[i];
    const country = countries[i % countries.length];
    const location =
      params.city?.trim() || (country ? getHubCity(country) || country : "");
    const typeHint = CLIENT_TYPE_HINTS[types[i % types.length]] || "local business";

    queries.push({
      query: [niche, typeHint, location, "official website contact email"]
        .filter(Boolean)
        .join(" "),
      targetCountry: country || undefined,
      niche,
    });

    if (queries.length < MAX_QUERIES_PER_RUN) {
      queries.push({
        query: [niche, location, "instagram whatsapp book appointment"]
          .filter(Boolean)
          .join(" "),
        targetCountry: country || undefined,
        niche,
      });
    }

    if (queries.length < MAX_QUERIES_PER_RUN && params.count >= 25) {
      queries.push({
        query: [niche, typeHint, location, "reviews team founder about"]
          .filter(Boolean)
          .join(" "),
        targetCountry: country || undefined,
        niche,
      });
    }
  }

  return queries.slice(0, MAX_QUERIES_PER_RUN);
}

function cleanBusinessName(title: string, url: string): string {
  const cleaned = title
    .replace(/\s*[|–—-]\s*(Home|Contact|About|Official Site).*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length >= 2) return cleaned.slice(0, 80);
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Local Business";
  }
}

async function scrapeWebsiteContacts(url: string, parentSignal?: AbortSignal) {
  try {
    const signal = parentSignal
      ? AbortSignal.any([parentSignal, AbortSignal.timeout(3500)])
      : AbortSignal.timeout(3500);
    const res = await fetch(url, {
      headers: { "User-Agent": "NicheleadsBot/1.0" },
      signal,
    });
    if (!res.ok) return {};
    const html = await res.text();
    return extractContactsFromText(html.slice(0, 60_000));
  } catch {
    return {};
  }
}

export async function fetchTavilyLeads(
  params: SearchLeadsParams,
  ctx?: SourceContext
): Promise<SourceResult> {
  const apiKey = process.env.TAVILY_API_KEY?.trim();
  if (!apiKey) {
    return {
      leads: [],
      warning: "Tavily: Set TAVILY_API_KEY in .env to enable local business research.",
    };
  }

  const rawQueries = buildTavilyQueries(params);
  const runIdx = params.runIndex ?? 0;
  const queries =
    runIdx > 0 && rawQueries.length > 1
      ? [
          ...rawQueries.slice(runIdx % rawQueries.length),
          ...rawQueries.slice(0, runIdx % rawQueries.length),
        ]
      : rawQueries;

  let days: number | undefined;
  if (params.sinceIso) {
    const ageMs = Date.now() - new Date(params.sinceIso).getTime();
    if (Number.isFinite(ageMs) && ageMs > 0) {
      days = Math.max(1, Math.min(30, Math.ceil(ageMs / (24 * 60 * 60 * 1000))));
    }
  }

  const searchDepth = params.count >= 25 ? "advanced" : "basic";
  const targetType: LeadType = params.clientTypes.includes("local_brand")
    ? "local_brand"
    : params.clientTypes[0] || "local_brand";

  const seenUrls = new Set<string>();
  const collected: Lead[] = [];
  const errors: string[] = [];

  for (const q of queries) {
    if (ctx?.signal.aborted || collected.length >= TAVILY_CAP) break;

    const cacheKey = `tavily:v1:${searchDepth}:d=${days ?? ""}:r=${runIdx % 4}:${crypto
      .createHash("sha256")
      .update(q.query.toLowerCase())
      .digest("hex")
      .slice(0, 16)}`;

    let results = await getCached<TavilyResultItem[]>(cacheKey, CACHE_TTL_MS);

    if (!results) {
      try {
        const fetchSignal = ctx?.signal
          ? AbortSignal.any([ctx.signal, AbortSignal.timeout(12_000)])
          : AbortSignal.timeout(12_000);

        const res = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key: apiKey,
            query: q.query,
            search_depth: searchDepth,
            max_results: params.count >= 25 ? 15 : 10,
            include_answer: false,
            include_raw_content: false,
            exclude_domains: EXCLUDED_DOMAINS,
            ...(days ? { days } : {}),
          }),
          signal: fetchSignal,
        });

        const data = (await res.json()) as TavilySearchResponse;
        if (!res.ok) {
          errors.push(`Tavily: ${data.detail || `HTTP ${res.status}`}`);
          continue;
        }

        results = data.results ?? [];
        if (results.length > 0) {
          await setCached(cacheKey, results);
        }
      } catch (err) {
        errors.push(
          `Tavily: ${err instanceof Error ? err.message : "Search request failed"}`
        );
        continue;
      }
    }

    for (const item of results) {
      if (ctx?.signal.aborted || collected.length >= TAVILY_CAP) break;
      const url = item.url?.trim();
      if (!url) continue;

      const urlKey = url.toLowerCase();
      if (seenUrls.has(urlKey)) continue;
      seenUrls.add(urlKey);

      const title = item.title?.trim() || "";
      const snippet = (item.content || "").trim();
      const combined = `${title}\n${snippet}\n${url}`;

      let contacts = extractContactsFromText(combined);
      if (!contacts.email && !contacts.whatsapp && !contacts.instagram) {
        const scraped = await scrapeWebsiteContacts(url, ctx?.signal);
        contacts = {
          email: contacts.email || scraped.email,
          whatsapp: contacts.whatsapp || scraped.whatsapp,
          instagram: contacts.instagram || scraped.instagram,
          website: contacts.website || url,
        };
      }

      const name = cleanBusinessName(title, url);
      const inferredLoc = inferLocationFromText(combined);
      const country = inferredLoc.country || q.targetCountry || "Unknown";
      const city = inferredLoc.city || params.city || "";
      const countryVerified = Boolean(inferredLoc.country);

      const baseLead: Omit<Lead, "score"> = {
        id: `tv-${crypto
          .createHash("sha1")
          .update(urlKey)
          .digest("hex")
          .slice(0, 12)}`,
        name,
        type: targetType,
        city,
        country,
        countryVerified,
        whyThisLead: buildWhyThisLead({
          name,
          type: targetType,
          platform: "tavily",
          niche: q.niche,
        }),
        email: contacts.email,
        whatsapp: contacts.whatsapp,
        instagram: contacts.instagram,
        website: contacts.website || url,
        aiMessage: buildPersonalizedPitch({
          name,
          type: targetType,
          niche: q.niche,
          platform: "tavily",
          clientName: params.clientName,
          offer: params.offer,
          signalText: snippet,
        }),
        status: "new",
        createdAt: new Date().toISOString(),
        sourcePlatform: "tavily",
        sourceUrl: url,
        sourceSnippet: snippet.slice(0, 260) || undefined,
        rawText: combined.slice(0, 500),
        niche: q.niche,
      };

      const lead: Lead = {
        ...baseLead,
        score: computeLeadScore(baseLead),
      };
      lead.dedupeKey = buildDedupeKey(lead);

      collected.push(lead);
      ctx?.partial.push(lead);
    }
  }

  return {
    leads: collected,
    warning: errors.length > 0 ? errors[0] : undefined,
  };
}
