import { sendAutopilotDigestEmail } from "@/lib/autopilot/digest";
import { FEATURE_REVIEW_BEFORE_SAVE } from "@/lib/config";
import { runMultiPlatformSearch } from "@/lib/connectors/orchestrator";
import {
  buildDedupeKey,
  getAutopilotRunsCollection,
  getLeadsCollection,
  getSavedSearchesCollection,
  getWorkspaceSettingsCollection,
  isMongoConfigured,
} from "@/lib/mongodb";
import { stagePendingLeads } from "@/lib/pending";
import { stripPersonalNames } from "@/lib/utils";
import type {
  AutopilotRun,
  AutopilotRunSourceStat,
  AutopilotSchedule,
  Lead,
  SavedSearch,
} from "@/types/lead";

const LOCK_TTL_MS = 15 * 60 * 1000;

export function computeNextRunAt(
  schedule: AutopilotSchedule,
  runAtHour = 7,
  _timezone = "UTC",
  from = new Date()
): string | undefined {
  if (schedule === "off") return undefined;
  const next = new Date(from.getTime());
  next.setUTCMinutes(0, 0, 0);
  if (schedule === "daily") {
    next.setUTCDate(next.getUTCDate() + 1);
  } else {
    next.setUTCDate(next.getUTCDate() + 7);
  }
  const hour = Math.max(0, Math.min(23, Math.floor(runAtHour)));
  next.setUTCHours(hour, 0, 0, 0);
  return next.toISOString();
}

function hasContactAndSource(lead: Lead): boolean {
  const hasSource = Boolean(lead.sourceUrl && lead.sourceUrl.trim());
  const hasContact = Boolean(
    lead.email?.trim() ||
      lead.whatsapp?.trim() ||
      lead.instagram?.trim() ||
      lead.website?.trim()
  );
  return hasSource && hasContact;
}

export async function runSavedSearch(
  savedSearchId: string,
  options?: { baseUrl?: string }
): Promise<AutopilotRun> {
  if (!isMongoConfigured()) {
    throw new Error("Database not configured");
  }

  const savedCol = await getSavedSearchesCollection();
  const runsCol = await getAutopilotRunsCollection();
  const leadsCol = await getLeadsCollection();

  const staleBeforeIso = new Date(Date.now() - LOCK_TTL_MS).toISOString();
  const nowIso = new Date().toISOString();

  // Atomic run lock so the same saved search cannot run twice concurrently
  const lockedDoc = await savedCol.findOneAndUpdate(
    {
      id: savedSearchId,
      $or: [
        { runningLockAt: { $exists: false } },
        { runningLockAt: null },
        { runningLockAt: { $lt: staleBeforeIso } },
      ],
    },
    { $set: { runningLockAt: nowIso } },
    { returnDocument: "after", projection: { _id: 0 } }
  );

  if (!lockedDoc) {
    const exists = await savedCol.findOne({ id: savedSearchId });
    if (!exists) throw new Error("Saved search not found");
    throw new Error("This saved search is already running");
  }

  const saved: SavedSearch = lockedDoc;
  const runId = `aprun-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const startedAt = nowIso;

  try {
    // Cap count per run to respect API quotas (especially Google CSE)
    const cappedCount = Math.min(
      25,
      Math.max(10, saved.maxLeadsPerRun || 25)
    ) as 10 | 25 | 50 | 100;

    const searchRes = await runMultiPlatformSearch({
      ...saved.params,
      workspaceId: saved.workspaceId,
      count: cappedCount >= 25 ? 25 : 10,
      saveToCrm: false,
      excludeExisting: true,
      runIndex: saved.runCount ?? 0,
      sinceIso: saved.lastRunAt,
    });

    const perSource: AutopilotRunSourceStat[] = (
      searchRes.sourceStats ?? []
    ).map((s) => ({
      source: s.platform,
      label: s.label,
      found: s.kept,
      error: s.warning,
    }));

    const qualified = searchRes.leads
      .filter(
        (l) =>
          (l.score ?? 0) >= (saved.minScore ?? 75) && hasContactAndSource(l)
      )
      .slice(0, saved.maxLeadsPerRun || 25);

    const newLeads: Lead[] = [];
    let duplicatesSkipped = searchRes.duplicatesSkipped ?? 0;
    const freshAt = new Date().toISOString();

    const settingsCol = await getWorkspaceSettingsCollection();
    const wsSettings = await settingsCol.findOne(
      { workspaceId: saved.workspaceId },
      { projection: { _id: 0, reviewAutopilotLeads: 1 } }
    );
    const shouldQueueReview =
      FEATURE_REVIEW_BEFORE_SAVE && Boolean(wsSettings?.reviewAutopilotLeads);

    if (shouldQueueReview && qualified.length > 0) {
      const staged = await stagePendingLeads({
        leads: qualified.map((l) => ({ ...l, autopilotRunId: runId })),
        workspaceId: saved.workspaceId,
        searchRunId: searchRes.searchRunId,
        sourceStats: searchRes.sourceStats,
      });
      duplicatesSkipped += staged.duplicateCount;
    } else {
      for (const lead of qualified) {
        const dedupeKey = buildDedupeKey(lead);
        const existing = await leadsCol.findOne(
          { $or: [{ dedupeKey }, { id: lead.id }] },
          { projection: { id: 1 } }
        );

        if (existing) {
          duplicatesSkipped += 1;
          // Safe update: only refresh lastSeenAt, never overwrite status, notes, or tags
          await leadsCol.updateOne(
            { id: existing.id },
            { $set: { lastSeenAt: freshAt } }
          );
          continue;
        }

        const toInsert: Lead = {
          ...lead,
          workspaceId: saved.workspaceId,
          dedupeKey,
          aiMessage: stripPersonalNames(lead.aiMessage),
          freshAt,
          autopilotRunId: runId,
          lastSeenAt: freshAt,
          activity: [
            ...(lead.activity ?? []),
            {
              id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              type: "created",
              detail: `Added by Autopilot (${saved.name})`,
              at: freshAt,
            },
          ],
        };

        await leadsCol.insertOne(toInsert);
        newLeads.push(toInsert);
      }
    }

    const hasWarnings = perSource.some((s) => Boolean(s.error));
    const hasSuccess = perSource.some((s) => !s.error);
    const status: AutopilotRun["status"] =
      hasWarnings && hasSuccess
        ? "partial"
        : hasWarnings && !hasSuccess && newLeads.length === 0
        ? "failed"
        : "ok";

    const digestRes = await sendAutopilotDigestEmail({
      workspaceId: saved.workspaceId,
      to: saved.digestEmail,
      searchName: saved.name,
      newLeads,
      baseUrl: options?.baseUrl,
    });

    const finishedAt = new Date().toISOString();
    const runDoc: AutopilotRun = {
      id: runId,
      savedSearchId: saved.id,
      workspaceId: saved.workspaceId,
      startedAt,
      finishedAt,
      perSource,
      newLeadIds: newLeads.map((l) => l.id),
      duplicatesSkipped,
      status,
      digestStatus: digestRes.status,
      digestError: digestRes.error,
    };

    await runsCol.insertOne(runDoc);

    const nextRunAt = saved.active
      ? computeNextRunAt(saved.schedule, saved.runAtHour, saved.timezone)
      : undefined;

    await savedCol.updateOne(
      { id: saved.id },
      {
        $set: {
          lastRunAt: finishedAt,
          nextRunAt,
          runningLockAt: null,
        },
        $inc: { runCount: 1 },
      }
    );

    return runDoc;
  } catch (err) {
    const finishedAt = new Date().toISOString();
    const failedRun: AutopilotRun = {
      id: runId,
      savedSearchId: saved.id,
      workspaceId: saved.workspaceId,
      startedAt,
      finishedAt,
      perSource: [],
      newLeadIds: [],
      duplicatesSkipped: 0,
      status: "failed",
      error: err instanceof Error ? err.message : "Autopilot run failed",
    };
    await runsCol.insertOne(failedRun).catch(() => {});
    await savedCol.updateOne(
      { id: saved.id },
      { $set: { runningLockAt: null } }
    );
    return failedRun;
  }
}
