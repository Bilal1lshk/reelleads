import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { FEATURE_HOOKS, FEATURE_REVIEW_BEFORE_SAVE } from "@/lib/config";
import { saveLeadsToCrm } from "@/lib/connectors/orchestrator";
import { generateHooksForTopLeadsInBackground } from "@/lib/hooks/background";
import {
  getPendingLeadsCollection,
  getSearchRunsCollection,
  isMongoConfigured,
} from "@/lib/mongodb";

const savePendingSchema = z.object({
  ids: z.union([z.literal("all"), z.array(z.string().trim().min(1))]),
  searchRunId: z.string().trim().optional(),
  workspaceId: z.string().trim().max(60).default("default"),
});

export async function POST(req: NextRequest) {
  if (!FEATURE_REVIEW_BEFORE_SAVE) {
    return NextResponse.json(
      { error: "Review before save is disabled" },
      { status: 404 }
    );
  }
  if (!isMongoConfigured()) {
    return NextResponse.json(
      { error: "Database not configured" },
      { status: 503 }
    );
  }

  try {
    const raw = await req.json();
    const parsed = savePendingSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid request" },
        { status: 400 }
      );
    }

    const { ids, searchRunId, workspaceId } = parsed.data;
    if (Array.isArray(ids) && ids.length === 0) {
      return NextResponse.json({
        ok: true,
        savedCount: 0,
        insertedCount: 0,
        updatedCount: 0,
      });
    }

    const [pendingCol, runsCol] = await Promise.all([
      getPendingLeadsCollection(),
      getSearchRunsCollection(),
    ]);

    const filter: Record<string, unknown> = {
      workspaceId,
      reviewStatus: "pending",
    };
    if (searchRunId) {
      filter.searchRunId = searchRunId;
    }
    if (ids !== "all") {
      filter.id = { $in: ids };
    }

    const docs = await pendingCol
      .find(filter, { projection: { _id: 0 } })
      .toArray();

    if (docs.length === 0) {
      return NextResponse.json({
        ok: true,
        savedCount: 0,
        insertedCount: 0,
        updatedCount: 0,
      });
    }

    const nowIso = new Date().toISOString();
    const leadsToSave = docs.map((d) => ({
      ...d.lead,
      freshAt: nowIso,
    }));

    // Reuse existing importer/saveLeadsToCrm (preserves status, notes, tags, dedupe)
    const saved = await saveLeadsToCrm(leadsToSave, workspaceId);

    // Delete from pending_leads so clicking twice is idempotent
    await pendingCol.deleteMany({
      id: { $in: docs.map((d) => d.id) },
    });

    if (searchRunId) {
      await runsCol
        .updateOne(
          { id: searchRunId },
          {
            $inc: { savedCount: docs.length },
            $set: { reviewedAt: nowIso },
          }
        )
        .catch(() => {});
    }

    if (FEATURE_HOOKS && leadsToSave.length > 0) {
      void generateHooksForTopLeadsInBackground(leadsToSave);
    }

    return NextResponse.json({
      ok: true,
      savedCount: docs.length,
      insertedCount: saved.insertedCount,
      updatedCount: saved.updatedCount,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save leads" },
      { status: 500 }
    );
  }
}
