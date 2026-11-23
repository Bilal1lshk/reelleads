import { NextRequest, NextResponse } from "next/server";
import { FEATURE_HOOKS, FEATURE_REVIEW_BEFORE_SAVE } from "@/lib/config";
import { runMultiPlatformSearch } from "@/lib/connectors/orchestrator";
import { generateHooksForTopLeadsInBackground } from "@/lib/hooks/background";
import { getSearchRunsCollection, isMongoConfigured } from "@/lib/mongodb";
import { stagePendingLeads } from "@/lib/pending";
import type { SearchLeadsParams } from "@/types/lead";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const params = (await req.json()) as SearchLeadsParams;
    const shouldReview =
      FEATURE_REVIEW_BEFORE_SAVE && params.saveToCrm !== false;

    let runIndex = params.runIndex;
    if (runIndex === undefined && isMongoConfigured()) {
      try {
        const runsCol = await getSearchRunsCollection();
        runIndex = await runsCol.countDocuments({
          niche: params.niche,
          city: params.city || "",
        });
      } catch {
        runIndex = 0;
      }
    }

    const searchParams: SearchLeadsParams = {
      ...params,
      excludeExisting: params.excludeExisting ?? true,
      runIndex,
      ...(shouldReview ? { saveToCrm: false } : {}),
    };

    const {
      leads,
      warnings,
      sourceStats,
      insertedCount,
      updatedCount,
      duplicatesSkipped,
      searchRunId,
    } = await runMultiPlatformSearch(searchParams);

    if (shouldReview && isMongoConfigured()) {
      const staged = await stagePendingLeads({
        leads,
        workspaceId: params.workspaceId || "default",
        searchRunId,
        sourceStats,
      });

      return NextResponse.json({
        leads,
        warnings,
        sourceStats,
        insertedCount: 0,
        updatedCount: 0,
        storage: "mongodb",
        reviewRequired: true,
        searchRunId: staged.searchRunId,
        pendingCount: staged.pendingCount,
        duplicateCount: staged.duplicateCount,
        duplicatesSkipped,
        perSource: sourceStats.map((s) => ({
          platform: s.platform,
          label: s.label,
          kept: s.kept,
        })),
      });
    }

    if (FEATURE_HOOKS && params.saveToCrm !== false && leads.length > 0) {
      void generateHooksForTopLeadsInBackground(leads);
    }

    return NextResponse.json({
      leads,
      warnings,
      sourceStats,
      insertedCount,
      updatedCount,
      duplicatesSkipped,
      storage: isMongoConfigured() ? "mongodb" : "memory_fallback",
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Multi-platform search failed",
      },
      { status: 500 }
    );
  }
}
