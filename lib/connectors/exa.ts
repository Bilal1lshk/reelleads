import crypto from "node:crypto";
import Exa from "exa-js";
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

const MAX_QUERIES_PER_RUN = 5;
const EXA_CAP = 50;

interface ExaQuerySpec {
  query: string;
  targetCountry?: string;
  niche: string;
}

const CLIENT_TYPE_PHRASES: Record<LeadType, string> = {
  local_brand: "brand business",
  creator: "content creator influencer",
  coach: "coach consultant",
  youtuber: "YouTuber channel",
  agency: "marketing creative agency",
};

function buildExaQueries(params: SearchLeadsParams): ExaQuerySpec[] {
  const niches = splitNiches(params.niche);
  const { allowed } = resolveCountryFilters(params);
  const countries = allowed.length > 0 ? allowed : [""];
  const types = params.clientTypes.length > 0 ? params.clientTypes : (["creator", "local_brand", "coach", "youtuber", "agency"] as LeadType[]);

  const queries: ExaQuerySpec[] = [];

  for (let i = 0; i < niches.length && queries.length < MAX_QUERIES_PER_RUN; i++) {
    const niche = niches[i];
    const country = countries[i % countries.length];
    const location = params.city?.trim() || (country ? getHubCity(country) || country : "");
    const clientType = types[i % types.length];
    const clientPhrase = CLIENT_TYPE_PHRASES[clientType];

    // 1. Direct hiring / outsourcing intent for video & reels editing
    queries.push({
      query: [
        niche,
        clientPhrase,
        location,
        "looking for video editor or reels editor",
      ]
        .filter(Boolean)
        .join(" "),
      targetCountry: country || undefined,
      niche,
    });

    if (queries.length >= MAX_QUERIES_PER_RUN || params.count < 25) continue;

    // 2. Brands, creators & coaches publishing short-form video with public contact info
    queries.push({
      query: [
        niche,
        clientPhrase,
        location,
        "Instagram Reels YouTube Shorts TikTok contact email",
      ]
        .filter(Boolean)
        .join(" "),
      targetCountry: country || undefined,
      niche,
    });
  }

  // 3. Dedicated agency / coach outsourcing query when targeting 50 leads
  if (queries.length < MAX_QUERIES_PER_RUN && params.count >= 50) {
    const primaryNiche = niches[0] || "short-form video";
    const country = countries[0] || "";
    const location = params.city?.trim() || (country ? getHubCity(country) || country : "");

    if (types.includes("agency")) {
      queries.push({
        query: [
          primaryNiche,
          "marketing agency",
          location,
          "hiring freelance video editor reels partner",
        ]
          .filter(Boolean)
          .join(" "),
        targetCountry: country || undefined,
        niche: primaryNiche,
      });
    } else if (types.includes("coach") || types.includes("youtuber")) {
      queries.push({
        query: [
          primaryNiche,
          "coach YouTuber",
          location,
          "need video editor for reels shorts",
        ]
          .filter(Boolean)
          .join(" "),
        targetCountry: country || undefined,
        niche: primaryNiche,
      });
    }
  }

  return queries.slice(0, MAX_QUERIES_PER_RUN);
}

/** Skip rival video-editing agencies or freelancer portfolios selling editing services. */
function isRivalEditorOrAgency(title: string, snippet: string): boolean {
  const text = `${title} ${snippet}`.toLowerCase();
  const sellsEditing =
    /\b(we are a video editing agency|video editing services for|unlimited video editing|hire me as your video editor|my video editing portfolio|book a call for editing)\b/i.test(
      text
    );
  const isHiringClient =
    /\b(hiring|looking for|need an? editor|seeking|apply now|send your portfolio)\b/i.test(
      text
    );
  return sellsEditing && !isHiringClient;
}

function detectHiringPhrase(text: string): string | undefined {
  const match = text.match(
    /\b(hiring|looking for|need an? editor|seeking|wanted|freelance editor|video editor)\b/i
  );
  return match?.[0];
}

function extractInstagramFromUrl(url: string): string | undefined {
  const match = url.match(/instagram\.com\/([A-Za-z0-9_.]+)/i);
  if (!match) return undefined;
  const handle = match[1].toLowerCase();
  if (["p", "reel", "reels", "explore", "stories", "accounts"].includes(handle)) {
    return undefined;
  }
  return `@${handle}`;
}

function inferLeadType(url: string, text: string, fallback: LeadType): LeadType {
  const lower = `${url} ${text}`.toLowerCase();
  if (lower.includes("agency") || lower.includes("studio")) return "agency";
  if (lower.includes("coach") || lower.includes("mentor") || lower.includes("consulting")) {
    return "coach";
  }
  if (lower.includes("youtube") || lower.includes("youtuber")) return "youtuber";
  if (lower.includes("brand") || lower.includes("shop") || lower.includes("store")) {
    return "local_brand";
  }
  return fallback;
}

function cleanTitleToName(title: string): string {
  return title
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s*[•|–-]\s*(Instagram|LinkedIn|YouTube|TikTok).*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchExaLeads(
  params: SearchLeadsParams,
  ctx?: SourceContext
): Promise<SourceResult> {
  const apiKey = process.env.EXA_API_KEY?.trim();
  if (!apiKey) {
    return {
      leads: [],
      warning: "Exa: Set EXA_API_KEY in .env.",
    };
  }

  const exa = new Exa(apiKey);
  const queries = buildExaQueries(params);
  const numResults = params.count === 10 ? 10 : 20;
  const seenUrls = new Set<string>();
  const collected: Lead[] = [];
  const errors: string[] = [];

  for (const q of queries) {
    if (ctx?.signal.aborted || collected.length >= EXA_CAP) break;

    const cacheKey = `exa:v2:${numResults}:${q.query.toLowerCase()}`;
    let results = await getCached<
      Array<{ url: string; title?: string | null; highlights?: string[] }>
    >(cacheKey);

    if (!results) {
      try {
        // Recommended Exa search shape: query + type: "auto" + contents: { highlights: true }
        const response = await exa.search(q.query, {
          type: "auto",
          numResults,
          contents: { highlights: true },
        });
        results = (response.results ?? []).map((r) => ({
          url: r.url,
          title: r.title,
          highlights: Array.isArray((r as { highlights?: unknown }).highlights)
            ? ((r as { highlights?: string[] }).highlights ?? [])
            : undefined,
        }));
        if (results.length > 0) {
          await setCached(cacheKey, results);
        }
      } catch (err) {
        errors.push(
          `Exa: ${err instanceof Error ? err.message : "Search request failed"}`
        );
        continue;
      }
    }

    for (const item of results) {
      if (ctx?.signal.aborted || collected.length >= EXA_CAP) break;
      const url = item.url?.trim();
      if (!url) continue;

      const urlKey = url.toLowerCase();
      if (seenUrls.has(urlKey)) continue;
      seenUrls.add(urlKey);

      const title = item.title?.trim() || new URL(url).hostname;
      const snippet = (item.highlights ?? []).join(" … ").trim();
      if (isRivalEditorOrAgency(title, snippet)) continue;

      const combined = `${title}\n${snippet}`;

      const contacts = extractContactsFromText(combined);
      const igFromUrl = extractInstagramFromUrl(url);
      const instagram = igFromUrl || contacts.instagram;
      const website =
        !url.includes("instagram.com") && !url.includes("linkedin.com")
          ? url
          : contacts.website;

      const inferred = inferLocationFromText(combined);
      const country = inferred.verified
        ? inferred.country
        : q.targetCountry || "Unknown";
      const countryVerified = inferred.verified || Boolean(q.targetCountry);

      const hiringSignal = detectHiringPhrase(combined);
      const leadType = inferLeadType(
        url,
        combined,
        params.clientTypes[0] || "creator"
      );
      const name = cleanTitleToName(title) || title.slice(0, 60);

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
        sourcePlatform: "exa",
        sourceUrl: url,
        sourceSnippet: snippet || title,
        niche: q.niche,
      };

      const lead: Lead = {
        id: `exa-${crypto
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
          platform: "exa",
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
          platform: "exa",
          signalText: snippet || title,
          clientName: params.clientName,
          offer: params.offer,
        }),
        status: "new",
        notes: snippet.slice(0, 260) || undefined,
        createdAt: new Date().toISOString(),
        sourcePlatform: "exa",
        sourceUrl: url,
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
    leads: collected.slice(0, EXA_CAP),
    warning: errors.length > 0 && collected.length === 0 ? errors[0] : undefined,
  };
}
