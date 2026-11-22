import {
  buildPersonalizedPitch,
  buildWhyThisLead,
  computeLeadScore,
  extractContactsFromText,
} from "@/lib/connectors/scoring";
import { mapLimit, splitNiches, type SourceContext } from "@/lib/connectors/source-utils";
import { inferLocationFromText } from "@/lib/countries";
import { buildDedupeKey } from "@/lib/mongodb";
import type { Lead, SearchLeadsParams } from "@/types/lead";

interface RedditPost {
  data: {
    id: string;
    title: string;
    selftext: string;
    author: string;
    permalink: string;
    created_utc: number;
    subreddit: string;
  };
}

const SUBREDDITS = [
  "forhire",
  "hiring",
  "DoneDirect",
  "CreatorServices",
  "videoediting",
  "NewTubers",
  "socialmedia",
];

const HIRING_PHRASES = [
  "[hiring]",
  "looking for",
  "need",
  "paying",
  "budget",
];

const FOR_HIRE_PATTERNS = ["[for hire]", "[for-hire]", "for hire:"];

const MAX_AGE_SECONDS = 60 * 24 * 60 * 60;
const REDDIT_CAP = 300;

function detectHiringSignal(title: string, selftext: string): string | undefined {
  const combined = `${title}\n${selftext}`;
  const lower = combined.toLowerCase();

  if (FOR_HIRE_PATTERNS.some((p) => title.toLowerCase().includes(p))) {
    return undefined;
  }

  for (const phrase of HIRING_PHRASES) {
    const idx = lower.indexOf(phrase);
    if (idx !== -1) {
      return combined.slice(idx, idx + phrase.length);
    }
  }
  return undefined;
}

function buildQueries(niche: string): string[] {
  const niches = splitNiches(niche);
  const primaryNiche = niches[0] || "video";
  const queries = [
    "need video editor",
    "looking for reels editor",
    `hiring editor ${primaryNiche}`,
    "short form editor",
  ];
  for (const n of niches.slice(1, 3)) {
    queries.push(`hiring editor ${n}`);
  }
  return Array.from(new Set(queries));
}

export async function fetchRedditLeads(
  params: SearchLeadsParams,
  ctx?: SourceContext
): Promise<{ leads: Lead[]; warning?: string }> {
  const userAgent =
    process.env.REDDIT_USER_AGENT || "web:nicheleads:v1.0 (by /u/nicheleads_app)";
  const queries = buildQueries(params.niche);
  const cutoffEpoch = Math.floor(Date.now() / 1000) - MAX_AGE_SECONDS;

  const jobs: Array<{ sub: string; query: string }> = [];
  for (const sub of SUBREDDITS) {
    for (const query of queries) {
      jobs.push({ sub, query });
    }
  }

  const seenUrls = new Set<string>();
  const collected: Lead[] = [];
  const errors: string[] = [];

  await mapLimit(jobs, 6, async ({ sub, query }) => {
    if (ctx?.signal.aborted || collected.length >= REDDIT_CAP) return;

    const url = `https://www.reddit.com/r/${sub}/search.json?q=${encodeURIComponent(
      query
    )}&restrict_sr=1&sort=new&limit=100`;

    try {
      const fetchSignal = ctx?.signal
        ? AbortSignal.any([ctx.signal, AbortSignal.timeout(8000)])
        : AbortSignal.timeout(8000);

      const res = await fetch(url, {
        headers: { "User-Agent": userAgent },
        signal: fetchSignal,
      });

      if (!res.ok) {
        errors.push(`r/${sub} HTTP ${res.status}`);
        return;
      }

      const json = (await res.json()) as {
        data?: { children?: RedditPost[] };
      };
      const posts = json.data?.children ?? [];

      for (const post of posts) {
        if (collected.length >= REDDIT_CAP) break;
        const { title, selftext, author, permalink, created_utc, id } =
          post.data;

        if (!permalink) continue;
        if (created_utc && created_utc < cutoffEpoch) continue;

        const sourceUrl = `https://www.reddit.com${permalink}`;
        const urlKey = sourceUrl.toLowerCase();
        if (seenUrls.has(urlKey)) continue;

        const hiringSignal = detectHiringSignal(title, selftext || "");
        if (!hiringSignal) continue;

        seenUrls.add(urlKey);

        const fullText = `${title}\n${selftext || ""}`;
        const contacts = extractContactsFromText(fullText);
        const location = inferLocationFromText(fullText);
        const displayName =
          author && author !== "[deleted]" && author !== "AutoModerator"
            ? `u/${author}`
            : title.slice(0, 48);

        const leadType = fullText.toLowerCase().includes("youtube")
          ? "youtuber"
          : "creator";

        const partial: Partial<Lead> = {
          name: displayName,
          type: leadType,
          city: location.city,
          country: location.country,
          countryVerified: location.verified,
          email: contacts.email,
          whatsapp: contacts.whatsapp,
          instagram: contacts.instagram,
          website: contacts.website,
          budgetSignal: contacts.budgetSignal,
          hiringSignal,
          sourcePlatform: "reddit",
          sourceUrl,
          sourceSnippet: title,
          niche: params.niche,
        };

        const lead: Lead = {
          id: `reddit-${id}`,
          name: partial.name!,
          type: leadType,
          city: location.city,
          country: location.country,
          countryVerified: location.verified,
          score: computeLeadScore(partial),
          whyThisLead: `${buildWhyThisLead({
            name: partial.name!,
            type: leadType,
            platform: "reddit",
            budgetSignal: contacts.budgetSignal,
            hiringSignal,
            niche: params.niche,
          })} — "${title.slice(0, 90)}"`,
          email: contacts.email,
          whatsapp: contacts.whatsapp,
          instagram: contacts.instagram,
          website: contacts.website,
          aiMessage: buildPersonalizedPitch({
            name: partial.name!,
            type: leadType,
            niche: params.niche,
            platform: "reddit",
            signalText: title,
            clientName: params.clientName,
            offer: params.offer,
          }),
          status: "new",
          notes: `Reddit r/${sub}: ${title}`,
          createdAt: new Date(created_utc * 1000).toISOString(),
          sourcePlatform: "reddit",
          sourceUrl,
          sourceSnippet: title,
          hiringSignal,
          budgetSignal: contacts.budgetSignal,
          niche: params.niche,
        };
        lead.dedupeKey = buildDedupeKey(lead);
        collected.push(lead);
        ctx?.partial.push(lead);
      }
    } catch (err) {
      if (ctx?.signal.aborted) return;
      errors.push(
        `r/${sub}: ${err instanceof Error ? err.message : "fetch failed"}`
      );
    }
  });

  const uniqueErrors = Array.from(new Set(errors));
  return {
    leads: collected.slice(0, REDDIT_CAP),
    warning:
      uniqueErrors.length > 0 && collected.length === 0
        ? `Reddit: ${uniqueErrors.slice(0, 3).join("; ")}`
        : undefined,
  };
}
