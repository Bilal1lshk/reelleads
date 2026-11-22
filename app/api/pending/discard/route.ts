import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { FEATURE_REVIEW_BEFORE_SAVE } from "@/lib/config";
import {
  getPendingLeadsCollection,
  getSearchRunsCollection,
  isMongoConfigured,
} from "@/lib/mongodb";

const discardPendingSchema = z.object({
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
    const parsed = discardPendingSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid request" },
        { status: 400 }
      );
    }

    const { ids, searchRunId, workspaceId } = parsed.data;
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

    const res = await pendingCol.deleteMany(filter);

    if (searchRunId && res.deletedCount > 0) {
      await runsCol
        .updateOne(
          { id: searchRunId },
          {
            $inc: { discardedCount: res.deletedCount },
            $set: { reviewedAt: new Date().toISOString() },
          }
        )
        .catch(() => {});
    }

    return NextResponse.json({
      ok: true,
      discardedCount: res.deletedCount,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to discard leads",
      },
      { status: 500 }
    );
  }
}
