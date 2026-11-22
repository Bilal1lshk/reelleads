import {
  buildPersonalizedPitch,
  buildWhyThisLead,
  computeLeadScore,
  extractContactsFromText,
} from "@/lib/connectors/scoring";
import {
  SOURCE_TIMEOUT_MS,
  splitNiches,
  type SourceContext,
} from "@/lib/connectors/source-utils";
import {
  getHubCity,
  inferLocationFromText,
  normalizeCountry,
  resolveCountryFilters,
} from "@/lib/countries";
import { buildDedupeKey } from "@/lib/mongodb";
import type { Lead, LeadPlatform, SearchLeadsParams } from "@/types/lead";

interface ApifyIgProfile {
  id?: string;
  username?: string;
  fullName?: string;
  biography?: string;
  followersCount?: number;
  externalUrl?: string;
  url?: string;
  isBusinessAccount?: boolean;
  businessCategoryName?: string;
  facebookPage?: {
    country?: unknown;
  };
  latestPosts?: Array<{ timestamp?: string }>;
}

function estimatePostsPerWeek(posts?: Array<{ timestamp?: string }>): number | undefined {
  if (!posts || posts.length < 2) return undefined;
  const times = posts
    .map((p) => (p.timestamp ? Date.parse(p.timestamp) : NaN))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => b - a);
  if (times.length < 2) return undefined;
  const spanWeeks = Math.max(1, (times[0] - times[times.length - 1]) / (7 * 24 * 60 * 60 * 1000));
  return Math.max(1, Math.round(times.length / spanWeeks));
}

export async function fetchApifySocialLeads(
  params: SearchLeadsParams,
  platform: Extract<LeadPlatform, "instagram" | "tiktok" | "x">,
  ctx?: SourceContext
): Promise<{ leads: Lead[]; warning?: string }> {
  // Task 5: Disable tiktok-scraper and tweet-scraper until their field mapping is fixed.
  // Never build instagram.com URLs for TikTok/X results.
  if (platform === "tiktok" || platform === "x") {
    return {
      leads: [],
      warning: `${platform === "tiktok" ? "TikTok" : "X"} scraper is disabled until its field mapping is verified.`,
    };
  }

  const token = process.env.APIFY_API_TOKEN;
  if (!token) {
    return {
      leads: [],
      warning: "Instagram: Set APIFY_API_TOKEN in .env to enable Instagram discovery.",
    };
  }

  try {
    const endpoint = `https://api.apify.com/v2/acts/apify~instagram-search-scraper/run-sync-get-dataset-items?token=${encodeURIComponent(
      token
    )}&timeout=35`;

    const niches = splitNiches(params.niche);
    const { allowed } = resolveCountryFilters(params);
    const targetCountries = allowed.length > 0 ? allowed : [""];

    const queries: string[] = [];
    for (let i = 0; i < Math.min(2, Math.max(niches.length, targetCountries.length)); i++) {
      const niche = niches[i % niches.length];
      const country = targetCountries[i % targetCountries.length];
      const loc = params.city?.trim() || (country ? getHubCity(country) || country : "");
      const q = [niche, loc].filter(Boolean).join(" ").trim();
      if (q) queries.push(q);
    }
    if (queries.length === 0) queries.push(params.niche);

    const seenUsernames = new Set<string>();
    const leads: Lead[] = [];
    const perQueryLimit = Math.min(Math.max(8, Math.ceil(params.count / queries.length)), 12);

    const results = await Promise.allSettled(
      queries.map(async (searchQuery) => {
        if (ctx?.signal.aborted) return [] as ApifyIgProfile[];
        const fetchSignal = ctx?.signal
          ? AbortSignal.any([ctx.signal, AbortSignal.timeout(40_000)])
          : AbortSignal.timeout(40_000);

        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            search: searchQuery,
            searchType: "user",
            searchLimit: perQueryLimit,
          }),
          signal: fetchSignal,
        });

        if (!res.ok) {
          const errBody = await res.text().catch(() => "");
          throw new Error(
            `HTTP ${res.status}${errBody ? `: ${errBody.slice(0, 120)}` : ""}`
          );
        }
        return (await res.json()) as ApifyIgProfile[];
      })
    );

    const errors: string[] = [];
    for (const r of results) {
      if (r.status === "rejected") {
        errors.push(r.reason instanceof Error ? r.reason.message : "failed");
        continue;
      }
      for (const item of r.value) {
        if (!item.username && !item.fullName) continue;
        const uname = (item.username || "").toLowerCase();
        if (uname && seenUsernames.has(uname)) continue;
        if (uname) seenUsernames.add(uname);

        const name = item.fullName?.trim() || `@${item.username}`;
        const bio = item.biography || "";
        const contacts = extractContactsFromText(bio);
        const sourceUrl =
          item.url ||
          (item.username ? `https://www.instagram.com/${item.username}` : undefined);

        const fbCountry =
          typeof item.facebookPage?.country === "string"
            ? normalizeCountry(item.facebookPage.country)
            : undefined;
        const inferred = inferLocationFromText(`${name}\n${bio}`);
        const resolvedCountry = fbCountry || (inferred.verified ? inferred.country : "Unknown");
        const countryVerified = Boolean(fbCountry || inferred.verified);
        const postsPerWeek = estimatePostsPerWeek(item.latestPosts);

        const leadType = item.isBusinessAccount ? "local_brand" : "creator";
        const igHandle = item.username
          ? `https://www.instagram.com/${item.username}`
          : contacts.instagram;

        const partial: Partial<Lead> = {
          name,
          type: leadType,
          city: inferred.city || "",
          country: resolvedCountry,
          countryVerified,
          followers: item.followersCount,
          postsPerWeek,
          email: contacts.email,
          whatsapp: contacts.whatsapp,
          instagram: igHandle,
          website: item.externalUrl || contacts.website,
          sourcePlatform: "instagram",
          sourceUrl,
          sourceSnippet: bio.slice(0, 220) || item.businessCategoryName || name,
          niche: params.niche,
        };

        const lead: Lead = {
          id: `instagram-${item.username || item.id || leads.length}`,
          name,
          type: leadType,
          city: partial.city!,
          country: resolvedCountry,
          countryVerified,
          score: computeLeadScore(partial),
          whyThisLead: buildWhyThisLead({
            name,
            type: leadType,
            platform: "instagram",
            followers: item.followersCount,
            postsPerWeek,
            niche: params.niche,
          }),
          email: partial.email,
          whatsapp: partial.whatsapp,
          instagram: partial.instagram,
          website: partial.website,
          followers: item.followersCount,
          postsPerWeek,
          aiMessage: buildPersonalizedPitch({
            name,
            type: leadType,
            niche: params.niche,
            platform: "instagram",
            signalText: bio.slice(0, 120) || name,
            clientName: params.clientName,
            offer: params.offer,
          }),
          status: "new",
          notes: bio.slice(0, 240) || undefined,
          createdAt: new Date().toISOString(),
          sourcePlatform: "instagram",
          sourceUrl,
          sourceSnippet: bio.slice(0, 220) || item.businessCategoryName || name,
          niche: params.niche,
        };
        lead.dedupeKey = buildDedupeKey(lead);
        leads.push(lead);
        ctx?.partial.push(lead);
      }
    }

    return {
      leads,
      warning:
        errors.length > 0 && leads.length === 0
          ? `Instagram: ${errors[0]}`
          : undefined,
    };
  } catch (err) {
    if (ctx?.signal.aborted) {
      return { leads: ctx.partial };
    }
    return {
      leads: [],
      warning: `Instagram: ${
        err instanceof Error ? err.message : "unknown error"
      }`,
    };
  }
}
