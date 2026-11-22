import {
  buildPersonalizedPitch,
  buildWhyThisLead,
  computeLeadScore,
  extractContactsFromText,
} from "@/lib/connectors/scoring";
import { splitNiches, type SourceContext } from "@/lib/connectors/source-utils";
import { inferLocationFromText, resolveCountryFilters } from "@/lib/countries";
import { buildDedupeKey } from "@/lib/mongodb";
import type { Lead, LeadType, SearchLeadsParams } from "@/types/lead";

interface PlacesTextSearchResult {
  place_id: string;
  name: string;
  formatted_address?: string;
}

interface PlaceDetailsResult {
  name?: string;
  website?: string;
  formatted_phone_number?: string;
  international_phone_number?: string;
  url?: string;
}

async function scrapeWebsiteContacts(url: string, parentSignal?: AbortSignal) {
  try {
    const signal = parentSignal
      ? AbortSignal.any([parentSignal, AbortSignal.timeout(4500)])
      : AbortSignal.timeout(4500);
    const res = await fetch(url, {
      headers: { "User-Agent": "NicheleadsBot/1.0" },
      signal,
    });
    if (!res.ok) return {};
    const html = await res.text();
    return extractContactsFromText(html.slice(0, 80_000));
  } catch {
    return {};
  }
}

export async function fetchGooglePlacesLeads(
  params: SearchLeadsParams,
  ctx?: SourceContext
): Promise<{ leads: Lead[]; warning?: string }> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (!apiKey) {
    // Task 3: If GOOGLE_PLACES_API_KEY is empty, do not emit a warning.
    return { leads: [] };
  }

  try {
    const niches = splitNiches(params.niche);
    const { allowed } = resolveCountryFilters(params);
    const targetCountries = allowed.length > 0 ? allowed : [""];

    const leads: Lead[] = [];
    const seenIds = new Set<string>();
    const targetType: LeadType = params.clientTypes.includes("local_brand")
      ? "local_brand"
      : params.clientTypes[0] || "local_brand";

    const maxQueries = Math.min(4, Math.max(niches.length, targetCountries.length));

    for (let i = 0; i < maxQueries; i++) {
      if (ctx?.signal.aborted || leads.length >= params.count) break;
      const niche = niches[i % niches.length];
      const country = targetCountries[i % targetCountries.length];
      const location = [params.city, country].filter(Boolean).join(", ");
      const query = `${niche} ${location}`.trim();

      const url = new URL(
        "https://maps.googleapis.com/maps/api/place/textsearch/json"
      );
      url.searchParams.set("query", query);
      url.searchParams.set("key", apiKey);

      const fetchSignal = ctx?.signal
        ? AbortSignal.any([ctx.signal, AbortSignal.timeout(8000)])
        : AbortSignal.timeout(8000);

      const res = await fetch(url.toString(), { signal: fetchSignal });
      if (!res.ok) {
        return {
          leads,
          warning: `Google Places failed (HTTP ${res.status})`,
        };
      }

      const data = (await res.json()) as { results?: PlacesTextSearchResult[] };
      const topResults = (data.results ?? []).slice(0, 8);

      for (const place of topResults) {
        if (ctx?.signal.aborted || leads.length >= params.count) break;
        if (seenIds.has(place.place_id)) continue;
        seenIds.add(place.place_id);

        const detailsUrl = new URL(
          "https://maps.googleapis.com/maps/api/place/details/json"
        );
        detailsUrl.searchParams.set("place_id", place.place_id);
        detailsUrl.searchParams.set(
          "fields",
          "name,website,formatted_phone_number,international_phone_number,url"
        );
        detailsUrl.searchParams.set("key", apiKey);

        const detSignal = ctx?.signal
          ? AbortSignal.any([ctx.signal, AbortSignal.timeout(5000)])
          : AbortSignal.timeout(5000);

        const detRes = await fetch(detailsUrl.toString(), { signal: detSignal });
        const detJson = detRes.ok
          ? ((await detRes.json()) as { result?: PlaceDetailsResult })
          : {};
        const det = detJson.result;

        const webContacts = det?.website
          ? await scrapeWebsiteContacts(det.website, ctx?.signal)
          : {};

        const phone =
          webContacts.whatsapp ||
          det?.international_phone_number ||
          det?.formatted_phone_number;

        const inferred = inferLocationFromText(place.formatted_address || "");
        const resolvedCountry = inferred.verified
          ? inferred.country
          : country || "Unknown";

        const sourceUrl = det?.url || det?.website;

        const partial: Partial<Lead> = {
          name: det?.name || place.name,
          type: targetType,
          city: inferred.city || params.city || "",
          country: resolvedCountry,
          countryVerified: inferred.verified || Boolean(country),
          whatsapp: phone,
          email: webContacts.email,
          instagram: webContacts.instagram,
          website: det?.website,
          sourcePlatform: "google_places",
          sourceUrl,
          sourceSnippet: place.formatted_address || det?.name || place.name,
          niche,
        };

        const lead: Lead = {
          id: `gp-${place.place_id}`,
          name: partial.name!,
          type: targetType,
          city: partial.city!,
          country: partial.country!,
          countryVerified: partial.countryVerified,
          score: computeLeadScore(partial),
          whyThisLead: buildWhyThisLead({
            name: partial.name!,
            type: targetType,
            platform: "google_places",
            niche,
          }),
          whatsapp: phone,
          email: webContacts.email,
          instagram: webContacts.instagram,
          website: det?.website,
          aiMessage: buildPersonalizedPitch({
            name: partial.name!,
            type: targetType,
            niche,
            platform: "google_places",
            signalText: place.formatted_address || partial.name!,
            clientName: params.clientName,
            offer: params.offer,
          }),
          status: "new",
          notes: place.formatted_address,
          createdAt: new Date().toISOString(),
          sourcePlatform: "google_places",
          sourceUrl,
          sourceSnippet: place.formatted_address,
          niche,
        };
        lead.dedupeKey = buildDedupeKey(lead);
        leads.push(lead);
        ctx?.partial.push(lead);
      }
    }

    return { leads };
  } catch (err) {
    if (ctx?.signal.aborted) {
      return { leads: ctx.partial };
    }
    return {
      leads: [],
      warning: `Google Places: ${err instanceof Error ? err.message : "unknown error"}`,
    };
  }
}
