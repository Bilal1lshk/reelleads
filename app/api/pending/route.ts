import { NextRequest, NextResponse } from "next/server";
import { FEATURE_REVIEW_BEFORE_SAVE } from "@/lib/config";
import {
  getPendingLeadsCollection,
  getSearchRunsCollection,
  isMongoConfigured,
} from "@/lib/mongodb";

export async function GET(req: NextRequest) {
  if (!FEATURE_REVIEW_BEFORE_SAVE || !isMongoConfigured()) {
    return NextResponse.json({
      pendingLeads: [],
      total: 0,
      newCount: 0,
      duplicateCount: 0,
      perSource: [],
    });
  }

  const workspaceId =
    req.nextUrl.searchParams.get("workspaceId")?.trim() || "default";
  const searchRunId = req.nextUrl.searchParams.get("searchRunId")?.trim() || "";

  try {
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

    const pendingLeads = await pendingCol
      .find(filter, { projection: { _id: 0 } })
      .sort({ createdAt: -1 })
      .toArray();

    const duplicateCount = pendingLeads.filter((p) =>
      Boolean(p.duplicateOfId)
    ).length;
    const newCount = pendingLeads.length - duplicateCount;

    let perSource: Array<{ platform: string; label: string; kept: number }> = [];
    if (searchRunId) {
      const run = await runsCol.findOne(
        { id: searchRunId },
        { projection: { _id: 0, sourceStats: 1 } }
      );
      if (run?.sourceStats) {
        perSource = run.sourceStats.map((s) => ({
          platform: s.platform,
          label: s.label,
          kept: s.kept,
        }));
      }
    }

    return NextResponse.json({
      pendingLeads,
      total: pendingLeads.length,
      newCount,
      duplicateCount,
      perSource,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to load pending leads",
      },
      { status: 500 }
    );
  }
}
