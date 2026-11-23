import {
  buildPersonalizedPitch,
  buildWhyThisLead,
  computeLeadScore,
  extractContactsFromText,
} from "@/lib/connectors/scoring";
import { splitNiches, type SourceContext } from "@/lib/connectors/source-utils";
import {
  getIso2,
  inferLocationFromText,
  normalizeCountry,
  resolveCountryFilters,
} from "@/lib/countries";
import { buildDedupeKey } from "@/lib/mongodb";
import type { Lead, SearchLeadsParams } from "@/types/lead";

interface YouTubeSearchItem {
  id?: { channelId?: string };
  snippet?: {
    channelId?: string;
    channelTitle?: string;
    title?: string;
  };
}

interface YouTubeChannelItem {
  id: string;
  snippet?: {
    title?: string;
    description?: string;
    customUrl?: string;
    country?: string;
  };
  statistics?: {
    subscriberCount?: string;
    videoCount?: string;
  };
}

const YOUTUBE_CAP = 50;

export async function fetchYouTubeLeads(
  params: SearchLeadsParams,
  ctx?: SourceContext
): Promise<{ leads: Lead[]; warning?: string }> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return {
      leads: [],
      warning: "YouTube: Set YOUTUBE_API_KEY in .env to enable channel discovery.",
    };
  }

  try {
    const niches = splitNiches(params.niche);
    const { allowed } = resolveCountryFilters(params);
    const targetCountries = allowed.length > 0 ? allowed : [""];

    const channelIds: string[] = [];
    const seenIds = new Set<string>();

    // Build a few query combinations across niches and target countries, paginating up to 50 channels.
    const combos: Array<{ niche: string; country: string }> = [];
    for (let i = 0; i < Math.max(niches.length, targetCountries.length) && combos.length < 4; i++) {
      combos.push({
        niche: niches[i % niches.length],
        country: targetCountries[i % targetCountries.length],
      });
    }

    for (const combo of combos) {
      if (ctx?.signal.aborted || channelIds.length >= YOUTUBE_CAP) break;

      const query = [combo.niche, params.city, combo.country]
        .filter(Boolean)
        .join(" ");
      let pageToken: string | undefined;

      for (let page = 0; page < 2 && channelIds.length < YOUTUBE_CAP; page++) {
        if (ctx?.signal.aborted) break;

        const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
        searchUrl.searchParams.set("part", "snippet");
        searchUrl.searchParams.set("type", "channel");
        searchUrl.searchParams.set("q", query);
        const orders = ["relevance", "date", "viewCount"] as const;
        const order = orders[(params.runIndex ?? 0) % orders.length];
        if (order !== "relevance") {
          searchUrl.searchParams.set("order", order);
        }
        if (params.sinceIso) {
          searchUrl.searchParams.set("publishedAfter", params.sinceIso);
        }
        const regionCode = combo.country ? getIso2(combo.country) : undefined;
        if (regionCode) {
          searchUrl.searchParams.set("regionCode", regionCode);
        }
        searchUrl.searchParams.set("maxResults", "25");
        if (pageToken) {
          searchUrl.searchParams.set("pageToken", pageToken);
        }
        searchUrl.searchParams.set("key", apiKey);

        const fetchSignal = ctx?.signal
          ? AbortSignal.any([ctx.signal, AbortSignal.timeout(8000)])
          : AbortSignal.timeout(8000);

        const searchRes = await fetch(searchUrl.toString(), { signal: fetchSignal });
        if (!searchRes.ok) {
          if (channelIds.length === 0) {
            return {
              leads: [],
              warning: `YouTube search failed (HTTP ${searchRes.status})`,
            };
          }
          break;
        }

        const searchJson = (await searchRes.json()) as {
          items?: YouTubeSearchItem[];
          nextPageToken?: string;
        };

        for (const item of searchJson.items ?? []) {
          const cid = item.id?.channelId || item.snippet?.channelId;
          if (cid && !seenIds.has(cid)) {
            seenIds.add(cid);
            channelIds.push(cid);
          }
        }

        pageToken = searchJson.nextPageToken;
        if (!pageToken) break;
      }
    }

    const cappedIds = channelIds.slice(0, YOUTUBE_CAP);
    if (cappedIds.length === 0) {
      return { leads: [] };
    }

    // YouTube channels.list accepts up to 50 IDs in one call.
    const channelsUrl = new URL("https://www.googleapis.com/youtube/v3/channels");
    channelsUrl.searchParams.set("part", "snippet,statistics");
    channelsUrl.searchParams.set("id", cappedIds.join(","));
    channelsUrl.searchParams.set("key", apiKey);

    const channelsSignal = ctx?.signal
      ? AbortSignal.any([ctx.signal, AbortSignal.timeout(8000)])
      : AbortSignal.timeout(8000);

    const channelsRes = await fetch(channelsUrl.toString(), { signal: channelsSignal });
    if (!channelsRes.ok) {
      return {
        leads: [],
        warning: `YouTube channels lookup failed (HTTP ${channelsRes.status})`,
      };
    }

    const channelsJson = (await channelsRes.json()) as {
      items?: YouTubeChannelItem[];
    };

    const leads: Lead[] = [];
    for (const ch of channelsJson.items ?? []) {
      const title = ch.snippet?.title || "YouTube Creator";
      const desc = ch.snippet?.description || "";
      const subs = Number(ch.statistics?.subscriberCount || 0) || undefined;
      const contacts = extractContactsFromText(desc);
      const sourceUrl = ch.snippet?.customUrl
        ? `https://www.youtube.com/${ch.snippet.customUrl}`
        : `https://www.youtube.com/channel/${ch.id}`;

      const apiCountry = normalizeCountry(ch.snippet?.country);
      const inferred = apiCountry ? undefined : inferLocationFromText(desc);
      const resolvedCountry = apiCountry || inferred?.country || "Unknown";
      const countryVerified = Boolean(apiCountry || inferred?.verified);

      const partial: Partial<Lead> = {
        name: title,
        type: "youtuber",
        city: inferred?.city || "",
        country: resolvedCountry,
        countryVerified,
        followers: subs,
        email: contacts.email,
        whatsapp: contacts.whatsapp,
        instagram: contacts.instagram,
        website: contacts.website || sourceUrl,
        sourcePlatform: "youtube",
        sourceUrl,
        sourceSnippet: desc.slice(0, 220) || title,
        niche: params.niche,
      };

      const lead: Lead = {
        id: `yt-${ch.id}`,
        name: title,
        type: "youtuber",
        city: partial.city!,
        country: resolvedCountry,
        countryVerified,
        score: computeLeadScore(partial),
        whyThisLead: buildWhyThisLead({
          name: title,
          type: "youtuber",
          platform: "youtube",
          followers: subs,
          niche: params.niche,
        }),
        email: contacts.email,
        whatsapp: contacts.whatsapp,
        instagram: contacts.instagram,
        website: partial.website,
        followers: subs,
        aiMessage: buildPersonalizedPitch({
          name: title,
          type: "youtuber",
          niche: params.niche,
          platform: "youtube",
          signalText: desc.slice(0, 120) || title,
          clientName: params.clientName,
          offer: params.offer,
        }),
        status: "new",
        notes: desc.slice(0, 280) || undefined,
        createdAt: new Date().toISOString(),
        sourcePlatform: "youtube",
        sourceUrl,
        sourceSnippet: desc.slice(0, 220) || title,
        niche: params.niche,
      };
      lead.dedupeKey = buildDedupeKey(lead);
      leads.push(lead);
      ctx?.partial.push(lead);
    }

    return { leads };
  } catch (err) {
    if (ctx?.signal.aborted) {
      return { leads: ctx.partial };
    }
    return {
      leads: [],
      warning: `YouTube: ${err instanceof Error ? err.message : "unknown error"}`,
    };
  }
}
