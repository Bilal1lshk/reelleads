import { NextRequest, NextResponse } from "next/server";
import type { OverviewData, OverviewActivityItem } from "@/lib/api";
import { FEATURE_AUTOPILOT } from "@/lib/config";
import {
  getLeadsCollection,
  getSavedSearchesCollection,
  getSearchRunsCollection,
  isMongoConfigured,
} from "@/lib/mongodb";
import {
  LEAD_STATUS_LABELS,
  PIPELINE_STATUSES,
  PLATFORM_LABELS,
  stripPersonalNames,
} from "@/lib/utils";
import type { LeadPlatform, LeadStatus } from "@/types/lead";

const CACHE_TTL_MS = 30_000;

declare global {
  var _overviewCache:
    | Map<string, { expiresAt: number; data: OverviewData }>
    | undefined;
}

const OVERVIEW_SOURCES: LeadPlatform[] = [
  "exa",
  "reddit",
  "youtube",
  "google_cse",
  "instagram",
  "linkedin",
];

function nonEmpty(val?: string | null): boolean {
  return Boolean(val && val.trim().length > 0);
}

function hasContactInfo(lead: {
  email?: string;
  whatsapp?: string;
  instagram?: string;
  sourceUrl?: string;
}): boolean {
  return (
    nonEmpty(lead.email) ||
    nonEmpty(lead.whatsapp) ||
    nonEmpty(lead.instagram) ||
    nonEmpty(lead.sourceUrl)
  );
}

function hasContactMethod(lead: {
  email?: string;
  whatsapp?: string;
  instagram?: string;
  website?: string;
}): boolean {
  return (
    nonEmpty(lead.email) ||
    nonEmpty(lead.whatsapp) ||
    nonEmpty(lead.instagram) ||
    nonEmpty(lead.website)
  );
}

function emptyOverview(): OverviewData {
  return {
    stats: {
      total: 0,
      newThisWeek: 0,
      contacted: 0,
      replied: 0,
      won: 0,
      withContactInfo: 0,
      replyRate: null,
    },
    deltas: {
      total: null,
      newThisWeek: null,
      contacted: null,
      replied: null,
      won: null,
      withContactInfo: null,
      replyRate: null,
    },
    pipeline: PIPELINE_STATUSES.map((status) => ({
      status: status as OverviewData["pipeline"][number]["status"],
      count: 0,
    })),
    followUpsDueToday: [],
    topNewLeads: [],
    sources: OVERVIEW_SOURCES.map((platform) => ({
      platform,
      label: PLATFORM_LABELS[platform],
      count: 0,
    })),
    recentActivity: [],
    lastSearch: null,
  };
}

export async function GET(req: NextRequest) {
  const workspaceId =
    req.nextUrl.searchParams.get("workspaceId")?.trim() || "default";
  const fresh = req.nextUrl.searchParams.get("fresh") === "1";

  if (!isMongoConfigured()) {
    return NextResponse.json(emptyOverview(), {
      headers: { "Cache-Control": "no-store" },
    });
  }

  const cache = (globalThis._overviewCache ??= new Map());
  if (!fresh) {
    const cached = cache.get(workspaceId);
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json(cached.data, {
        headers: {
          "Cache-Control": "private, max-age=30, stale-while-revalidate=30",
        },
      });
    }
  }

  try {
    const [leadsCol, runsCol] = await Promise.all([
      getLeadsCollection(),
      getSearchRunsCollection(),
    ]);

    const baseFilter: Record<string, unknown> =
      workspaceId && workspaceId !== "all" && workspaceId !== "default"
        ? { workspaceId }
        : {};

    const [allLeads, recentRuns] = await Promise.all([
      leadsCol
        .find(baseFilter, {
          projection: {
            _id: 0,
            id: 1,
            name: 1,
            status: 1,
            score: 1,
            whyThisLead: 1,
            sourcePlatform: 1,
            sourceUrl: 1,
            sourceSnippet: 1,
            country: 1,
            email: 1,
            whatsapp: 1,
            instagram: 1,
            website: 1,
            aiMessage: 1,
            createdAt: 1,
            lastContactedAt: 1,
            nextFollowUpAt: 1,
            activity: 1,
            freshAt: 1,
          },
        })
        .toArray(),
      runsCol
        .find({}, { projection: { _id: 0, id: 1, niche: 1, insertedCount: 1, createdAt: 1 } })
        .sort({ createdAt: -1 })
        .limit(8)
        .toArray(),
    ]);

    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const twoWeeksAgo = now - 14 * 24 * 60 * 60 * 1000;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStartMs = todayStart.getTime();

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    const todayEndMs = todayEnd.getTime();

    let newThisWeek = 0;
    let newPrevWeek = 0;
    let totalThisWeek = 0;
    let totalPrevWeek = 0;
    let contacted = 0;
    let contactedThisWeek = 0;
    let contactedPrevWeek = 0;
    let replied = 0;
    let repliedThisWeek = 0;
    let repliedPrevWeek = 0;
    let won = 0;
    let wonThisWeek = 0;
    let wonPrevWeek = 0;
    let withContactInfo = 0;
    let withContactThisWeek = 0;
    let withContactPrevWeek = 0;

    const statusCounts: Record<string, number> = {
      new: 0,
      contacted: 0,
      replied: 0,
      meeting_booked: 0,
      won: 0,
      lost: 0,
    };

    const sourceCounts: Record<string, number> = {};
    for (const p of OVERVIEW_SOURCES) sourceCounts[p] = 0;

    const followUpsDueToday: OverviewData["followUpsDueToday"] = [];
    const topNewCandidates: OverviewData["topNewLeads"] = [];
    const activityEvents: OverviewActivityItem[] = [];

    for (const lead of allLeads) {
      const createdMs = Date.parse(lead.createdAt || "");
      const inThisWeek = Number.isFinite(createdMs) && createdMs >= weekAgo;
      const inPrevWeek =
        Number.isFinite(createdMs) &&
        createdMs >= twoWeeksAgo &&
        createdMs < weekAgo;

      if (inThisWeek) totalThisWeek += 1;
      if (inPrevWeek) totalPrevWeek += 1;

      if (lead.status in statusCounts) {
        statusCounts[lead.status] += 1;
      }

      if (lead.sourcePlatform && lead.sourcePlatform in sourceCounts) {
        sourceCounts[lead.sourcePlatform] += 1;
      }

      if (lead.status === "new") {
        if (inThisWeek) newThisWeek += 1;
        if (inPrevWeek) newPrevWeek += 1;
      }

      if (lead.status === "contacted") {
        contacted += 1;
        if (inThisWeek) contactedThisWeek += 1;
        if (inPrevWeek) contactedPrevWeek += 1;
      }

      if (lead.status === "replied" || lead.status === "meeting_booked") {
        replied += 1;
        if (inThisWeek) repliedThisWeek += 1;
        if (inPrevWeek) repliedPrevWeek += 1;
      }

      if (lead.status === "won") {
        won += 1;
        if (inThisWeek) wonThisWeek += 1;
        if (inPrevWeek) wonPrevWeek += 1;
      }

      if (hasContactInfo(lead)) {
        withContactInfo += 1;
        if (inThisWeek) withContactThisWeek += 1;
        if (inPrevWeek) withContactPrevWeek += 1;
      }

      if (lead.nextFollowUpAt) {
        const fuMs = Date.parse(lead.nextFollowUpAt);
        if (Number.isFinite(fuMs) && fuMs <= todayEndMs) {
          followUpsDueToday.push({
            id: lead.id,
            name: lead.name,
            sourcePlatform: lead.sourcePlatform,
            lastContactedAt: lead.lastContactedAt,
            nextFollowUpAt: lead.nextFollowUpAt,
            status: lead.status,
            isOverdue: fuMs < todayStartMs,
          });
        }
      }

      if (
        lead.status === "new" &&
        nonEmpty(lead.sourceUrl) &&
        hasContactMethod(lead)
      ) {
        topNewCandidates.push({
          id: lead.id,
          name: lead.name,
          whyThisLead: lead.whyThisLead || "",
          sourcePlatform: lead.sourcePlatform,
          sourceUrl: lead.sourceUrl,
          sourceSnippet: lead.sourceSnippet,
          country: lead.country || "Unknown",
          score: lead.score ?? 0,
          email: lead.email,
          whatsapp: lead.whatsapp,
          instagram: lead.instagram,
          website: lead.website,
          aiMessage: stripPersonalNames(lead.aiMessage),
          createdAt: lead.createdAt,
        });
      }

      if (Array.isArray(lead.activity)) {
        for (const act of lead.activity) {
          if (!act?.at) continue;
          let title = lead.name;
          let detail = act.detail;
          let type: OverviewActivityItem["type"] = "created";

          if (act.type === "status_change") {
            type = "status_change";
            const toLabel =
              LEAD_STATUS_LABELS[(act.to as LeadStatus) || "new"] || act.to;
            title = `${lead.name} moved to ${toLabel}`;
          } else if (act.type === "note_added") {
            type = "note_added";
            title = `Note added on ${lead.name}`;
          } else if (act.type === "contact_logged") {
            type = "contact_logged";
            title = `Contact logged for ${lead.name}`;
          } else if (act.type === "created") {
            type = lead.sourcePlatform === "csv_import" ? "import" : "created";
            title =
              lead.sourcePlatform === "csv_import"
                ? `Imported ${lead.name}`
                : `Added ${lead.name}`;
          } else {
            continue;
          }

          activityEvents.push({
            id: act.id || `${lead.id}-${act.at}`,
            type,
            title,
            detail,
            at: act.at,
            leadId: lead.id,
          });
        }
      }
    }

    for (const run of recentRuns) {
      activityEvents.push({
        id: `run-${run.id || run.createdAt}`,
        type: "search_run",
        title: `Search: ${run.niche || "Leads"}`,
        detail: `${run.insertedCount ?? 0} leads added`,
        at: run.createdAt,
      });
    }

    followUpsDueToday.sort(
      (a, b) =>
        Date.parse(a.nextFollowUpAt || "") - Date.parse(b.nextFollowUpAt || "")
    );

    topNewCandidates.sort((a, b) => b.score - a.score);
    const topNewLeads = topNewCandidates.slice(0, 8);

    activityEvents.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    const recentActivity = activityEvents.slice(0, 8);

    const replyRate =
      contacted > 0 ? Math.round((replied / contacted) * 100) : null;
    const thisWeekReplyRate =
      contactedThisWeek > 0
        ? Math.round((repliedThisWeek / contactedThisWeek) * 100)
        : null;
    const prevWeekReplyRate =
      contactedPrevWeek > 0
        ? Math.round((repliedPrevWeek / contactedPrevWeek) * 100)
        : null;

    const latestRun = recentRuns[0] ?? null;

    let autopilot: OverviewData["autopilot"] = null;
    if (FEATURE_AUTOPILOT) {
      const savedCol = await getSavedSearchesCollection();
      const activeCount = await savedCol.countDocuments({
        workspaceId,
        active: true,
        schedule: { $ne: "off" },
      });
      if (activeCount > 0) {
        const yesterdayMs = now - 24 * 60 * 60 * 1000;
        const freshTodayCount = allLeads.filter((l) => {
          const t = Date.parse(l.freshAt || "");
          return Number.isFinite(t) && t >= yesterdayMs;
        }).length;
        autopilot = { activeCount, freshTodayCount };
      }
    }

    const data: OverviewData = {
      stats: {
        total: allLeads.length,
        newThisWeek,
        contacted,
        replied,
        won,
        withContactInfo,
        replyRate,
      },
      deltas: {
        total: totalPrevWeek > 0 ? totalThisWeek - totalPrevWeek : null,
        newThisWeek: newPrevWeek > 0 ? newThisWeek - newPrevWeek : null,
        contacted:
          contactedPrevWeek > 0 ? contactedThisWeek - contactedPrevWeek : null,
        replied: repliedPrevWeek > 0 ? repliedThisWeek - repliedPrevWeek : null,
        won: wonPrevWeek > 0 ? wonThisWeek - wonPrevWeek : null,
        withContactInfo:
          withContactPrevWeek > 0
            ? withContactThisWeek - withContactPrevWeek
            : null,
        replyRate:
          thisWeekReplyRate !== null && prevWeekReplyRate !== null
            ? thisWeekReplyRate - prevWeekReplyRate
            : null,
      },
      pipeline: PIPELINE_STATUSES.map((status) => ({
        status: status as OverviewData["pipeline"][number]["status"],
        count: statusCounts[status] ?? 0,
      })),
      followUpsDueToday,
      topNewLeads,
      sources: OVERVIEW_SOURCES.map((platform) => ({
        platform,
        label: PLATFORM_LABELS[platform],
        count: sourceCounts[platform] ?? 0,
      })),
      recentActivity,
      lastSearch: latestRun
        ? {
            createdAt: latestRun.createdAt,
            insertedCount: latestRun.insertedCount ?? 0,
          }
        : null,
      autopilot,
    };

    cache.set(workspaceId, { expiresAt: Date.now() + CACHE_TTL_MS, data });

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": fresh
          ? "no-store"
          : "private, max-age=30, stale-while-revalidate=30",
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to load overview data",
      },
      { status: 500 }
    );
  }
}
