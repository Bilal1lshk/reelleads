import {
  buildDedupeKey,
  getLeadsCollection,
  getPendingLeadsCollection,
  getSearchRunsCollection,
  isMongoConfigured,
} from "@/lib/mongodb";
import type { Lead, PendingLead, SourceStat } from "@/types/lead";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export async function stagePendingLeads(params: {
  leads: Lead[];
  workspaceId?: string;
  searchRunId: string;
  sourceStats?: SourceStat[];
}): Promise<{
  searchRunId: string;
  pendingCount: number;
  duplicateCount: number;
}> {
  const workspaceId = params.workspaceId || "default";
  if (!isMongoConfigured() || params.leads.length === 0) {
    return {
      searchRunId: params.searchRunId,
      pendingCount: 0,
      duplicateCount: 0,
    };
  }

  const [leadsCol, pendingCol, runsCol] = await Promise.all([
    getLeadsCollection(),
    getPendingLeadsCollection(),
    getSearchRunsCollection(),
  ]);

  const keys = params.leads.map((l) => l.dedupeKey || buildDedupeKey(l));
  const existingDocs = await leadsCol
    .find(
      { dedupeKey: { $in: keys } },
      { projection: { _id: 0, id: 1, dedupeKey: 1 } }
    )
    .toArray();

  const existingByKey = new Map<string, string>();
  for (const doc of existingDocs) {
    if (doc.dedupeKey) existingByKey.set(doc.dedupeKey, doc.id);
  }

  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const expiresAt = new Date(now + SEVEN_DAYS_MS);

  let duplicateCount = 0;
  const pendingDocs: PendingLead[] = params.leads.map((lead, idx) => {
    const dedupeKey = keys[idx];
    const duplicateOfId = existingByKey.get(dedupeKey);
    if (duplicateOfId) duplicateCount += 1;

    return {
      id: `pend-${now}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      workspaceId,
      searchRunId: params.searchRunId,
      lead: {
        ...lead,
        workspaceId,
        dedupeKey,
      },
      reviewStatus: "pending",
      duplicateOfId,
      createdAt: nowIso,
      expiresAt,
    };
  });

  if (pendingDocs.length > 0) {
    await pendingCol.insertMany(pendingDocs);
  }

  await runsCol
    .updateOne(
      { id: params.searchRunId },
      {
        $set: {
          pendingCount: pendingDocs.length,
        },
      }
    )
    .catch(() => {});

  return {
    searchRunId: params.searchRunId,
    pendingCount: pendingDocs.length,
    duplicateCount,
  };
}
