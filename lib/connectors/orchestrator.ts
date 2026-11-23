import { fetchApifySocialLeads } from "@/lib/connectors/apify";
import { fetchExaLeads } from "@/lib/connectors/exa";
import { fetchFacebookLeads } from "@/lib/connectors/facebook";
import { fetchLinkedInLeadsViaGoogleCse } from "@/lib/connectors/google-cse";
import { fetchRedditLeads } from "@/lib/connectors/reddit";
import {
  computeLeadScore,
  enrichLeadsWithGroq,
  hasAnyContact,
} from "@/lib/connectors/scoring";
import {
  runSourceWithTimeout,
  SOURCE_LABELS,
  SOURCE_TIMEOUT_MS,
  type SourceContext,
  type SourceResult,
} from "@/lib/connectors/source-utils";
import { fetchYouTubeLeads } from "@/lib/connectors/youtube";
import { fetchTavilyLeads } from "@/lib/connectors/tavily";
import { isAllowedCountry, resolveCountryFilters } from "@/lib/countries";
import {
  buildDedupeKey,
  getLeadsCollection,
  getPendingLeadsCollection,
  getSearchRunsCollection,
  isMongoConfigured,
} from "@/lib/mongodb";
import type {
  Lead,
  LeadPlatform,
  SearchLeadsParams,
  SearchRun,
  SourceStat,
} from "@/types/lead";

export function getDefaultPlatforms(): LeadPlatform[] {
  const defaults: LeadPlatform[] = ["youtube", "instagram"];
  if (process.env.EXA_API_KEY?.trim()) {
    defaults.unshift("exa");
  }
  if (process.env.TAVILY_API_KEY?.trim()) {
    defaults.push("tavily");
  }
  return defaults;
}

function buildConnectorTask(
  platform: LeadPlatform,
  params: SearchLeadsParams
): ((ctx: SourceContext) => Promise<SourceResult>) | null {
  switch (platform) {
    case "reddit":
      return (ctx) => fetchRedditLeads(params, ctx);
    case "youtube":
      return (ctx) => fetchYouTubeLeads(params, ctx);
    case "google_cse":
    case "google_places":
      return null;
    case "linkedin":
      return (ctx) => fetchLinkedInLeadsViaGoogleCse(params, ctx);
    case "exa":
      return (ctx) => fetchExaLeads(params, ctx);
    case "tavily":
      return (ctx) => fetchTavilyLeads(params, ctx);
    case "facebook":
      return () => fetchFacebookLeads(params);
    case "instagram":
    case "tiktok":
    case "x":
      return (ctx) => fetchApifySocialLeads(params, platform, ctx);
    default:
      return null;
  }
}

export async function runMultiPlatformSearch(params: SearchLeadsParams): Promise<{
  leads: Lead[];
  warnings: string[];
  sourceStats: SourceStat[];
  insertedCount: number;
  updatedCount: number;
  duplicatesSkipped: number;
  searchRunId: string;
}> {
  const requestedPlatforms: LeadPlatform[] =
    params.platforms && params.platforms.length > 0
      ? params.platforms
      : getDefaultPlatforms();

  const { allowed: allowedCountries, excluded: excludedCountries } =
    resolveCountryFilters(params);

  const taskEntries = requestedPlatforms
    .map((platform) => ({
      platform,
      label: SOURCE_LABELS[platform] || platform,
      fn: buildConnectorTask(platform, params),
    }))
    .filter(
      (
        e
      ): e is {
        platform: LeadPlatform;
        label: string;
        fn: (ctx: SourceContext) => Promise<SourceResult>;
      } => e.fn !== null
    );

  const settled = await Promise.all(
    taskEntries.map(async (entry) => {
      const timeoutMs = entry.platform === "instagram" ? 45_000 : SOURCE_TIMEOUT_MS;
      const res = await runSourceWithTimeout(
        entry.label,
        entry.fn,
        timeoutMs
      );
      return { ...entry, res };
    })
  );

  const warnings: string[] = [];
  const sourceStats: SourceStat[] = [];
  const dedupedMap = new Map<string, Lead>();

  for (const { platform, label, res } of settled) {
    if (res.warning) {
      warnings.push(res.warning);
    }

    let keptForSource = 0;
    for (const rawLead of res.leads) {
      // Ensure every lead has a verifiable sourceUrl when a website or instagram exists
      const lead: Lead = {
        ...rawLead,
        sourceUrl:
          rawLead.sourceUrl || rawLead.website || rawLead.instagram || undefined,
      };

      // Task 6: Drop any lead with NO contact method or no sourceUrl
      if (!hasAnyContact(lead) || !lead.sourceUrl) {
        continue;
      }

      // Task 4: Strict country filtering
      const countryCheck = isAllowedCountry(
        lead,
        allowedCountries,
        excludedCountries
      );
      if (!countryCheck.allowed) {
        continue;
      }

      lead.countryVerified = countryCheck.verified;
      lead.score = computeLeadScore(lead);

      const key = lead.dedupeKey || buildDedupeKey(lead);
      lead.dedupeKey = key;

      if (!dedupedMap.has(key)) {
        dedupedMap.set(key, lead);
        keptForSource++;
      }
    }

    sourceStats.push({
      platform,
      label,
      returned: res.leads.length,
      kept: keptForSource,
      warning: res.warning,
      timedOut: res.timedOut,
    });
  }

  const workspaceId = params.workspaceId || "default";

  // Pre-slice deduplication against existing CRM leads and pending/reviewed leads
  // so `params.count` is filled with net-new leads whenever possible.
  let existingKeys = new Set<string>();
  if (params.excludeExisting !== false && isMongoConfigured() && dedupedMap.size > 0) {
    try {
      const candidateKeys = Array.from(dedupedMap.keys());
      const [leadsCol, pendingCol] = await Promise.all([
        getLeadsCollection(),
        getPendingLeadsCollection(),
      ]);
      const [existingLeads, existingPending] = await Promise.all([
        leadsCol
          .find(
            { dedupeKey: { $in: candidateKeys } },
            { projection: { _id: 0, dedupeKey: 1 } }
          )
          .toArray(),
        pendingCol
          .find(
            { workspaceId, "lead.dedupeKey": { $in: candidateKeys } },
            { projection: { _id: 0, "lead.dedupeKey": 1 } }
          )
          .toArray(),
      ]);
      for (const doc of existingLeads) {
        if (doc.dedupeKey) existingKeys.add(doc.dedupeKey);
      }
      for (const doc of existingPending) {
        if (doc.lead?.dedupeKey) existingKeys.add(doc.lead.dedupeKey);
      }
    } catch {
      existingKeys = new Set<string>();
    }
  }

  // Rank verified target-country leads above unverified ones when a country filter is active,
  // then by score descending, excluding already-seen leads before slicing to `params.count`.
  const allCandidates = Array.from(dedupedMap.values());
  const netNewCandidates =
    existingKeys.size > 0
      ? allCandidates.filter((l) => !l.dedupeKey || !existingKeys.has(l.dedupeKey))
      : allCandidates;
  const duplicatesSkipped = allCandidates.length - netNewCandidates.length;

  const sortedUnique = netNewCandidates
    .sort((a, b) => {
      if (allowedCountries.length > 0) {
        const av = a.countryVerified ? 1 : 0;
        const bv = b.countryVerified ? 1 : 0;
        if (av !== bv) return bv - av;
      }
      return b.score - a.score;
    })
    .slice(0, params.count);

  const uniqueLeads = await enrichLeadsWithGroq(sortedUnique, params.niche, {
    clientName: params.clientName,
    offer: params.offer,
  });

  let insertedCount = 0;
  let updatedCount = 0;

  if (params.saveToCrm !== false && isMongoConfigured() && uniqueLeads.length > 0) {
    const saved = await saveLeadsToCrm(uniqueLeads, workspaceId);
    insertedCount = saved.insertedCount;
    updatedCount = saved.updatedCount;
  }

  let searchRunId = `run-${Date.now()}`;
  if (isMongoConfigured()) {
    const runsCol = await getSearchRunsCollection();
    const runDoc: SearchRun = {
      id: searchRunId,
      niche: params.niche,
      clientTypes: params.clientTypes,
      platforms: requestedPlatforms,
      country: allowedCountries[0] || params.country || "all",
      countries: allowedCountries,
      excludedCountries,
      city: params.city,
      requestedCount: params.count,
      insertedCount,
      updatedCount,
      duplicatesSkipped,
      warnings,
      sourceStats,
      createdAt: new Date().toISOString(),
    };
    await runsCol.insertOne(runDoc).catch(() => {});
  }

  return {
    leads: uniqueLeads,
    warnings,
    sourceStats,
    insertedCount,
    updatedCount,
    duplicatesSkipped,
    searchRunId,
  };
}

/**
 * Upsert a list of discovered leads into the CRM (MongoDB) while preserving
 * existing status, notes, tags, and activity history.
 */
export async function saveLeadsToCrm(
  leads: Lead[],
  workspaceId = "default"
): Promise<{ insertedCount: number; updatedCount: number }> {
  if (!isMongoConfigured() || leads.length === 0) {
    return { insertedCount: 0, updatedCount: 0 };
  }

  const col = await getLeadsCollection();
  const nowIso = new Date().toISOString();

  const ops = leads.map((lead) => {
    const dedupeKey = lead.dedupeKey || buildDedupeKey(lead);
    return {
      updateOne: {
        filter: { dedupeKey },
        update: {
          $set: {
            name: lead.name,
            type: lead.type,
            city: lead.city,
            country: lead.country,
            countryVerified: lead.countryVerified,
            followers: lead.followers,
            postsPerWeek: lead.postsPerWeek,
            email: lead.email,
            whatsapp: lead.whatsapp,
            instagram: lead.instagram,
            website: lead.website,
            score: lead.score,
            whyThisLead: lead.whyThisLead,
            aiMessage: lead.aiMessage,
            sourcePlatform: lead.sourcePlatform,
            sourceUrl: lead.sourceUrl,
            sourceSnippet: lead.sourceSnippet,
            rawText: lead.rawText || lead.sourceSnippet,
            hiringSignal: lead.hiringSignal,
            budgetSignal: lead.budgetSignal,
            niche: lead.niche,
            lastSeenAt: nowIso,
          },
          $setOnInsert: {
            id: lead.id,
            dedupeKey,
            workspaceId: lead.workspaceId || workspaceId,
            createdAt: lead.createdAt || nowIso,
            status: lead.status || "new",
            notes: lead.notes,
            tags: lead.tags ?? [],
            activity: [
              {
                id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                type: "created" as const,
                detail: `Discovered via ${lead.sourcePlatform || "search"}`,
                at: nowIso,
              },
            ],
          },
        },
        upsert: true,
      },
    };
  });

  const bulkRes = await col.bulkWrite(ops, { ordered: false });
  return {
    insertedCount: bulkRes.upsertedCount,
    updatedCount: bulkRes.matchedCount,
  };
}
