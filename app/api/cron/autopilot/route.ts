import { NextRequest, NextResponse } from "next/server";
import { runSavedSearch } from "@/lib/autopilot/run";
import { FEATURE_AUTOPILOT } from "@/lib/config";
import { getSavedSearchesCollection, isMongoConfigured } from "@/lib/mongodb";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!FEATURE_AUTOPILOT) {
    return NextResponse.json({ skipped: true, reason: "Autopilot disabled" });
  }

  if (!isMongoConfigured()) {
    return NextResponse.json(
      { error: "MONGODB_URI is not configured" },
      { status: 503 }
    );
  }

  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 500 }
    );
  }

  const authHeader = req.headers.get("authorization") || "";
  const headerSecret = req.headers.get("x-cron-secret") || "";
  const bearer = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";

  if (bearer !== cronSecret && headerSecret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const col = await getSavedSearchesCollection();
    const nowIso = new Date().toISOString();

    const due = await col
      .find(
        {
          active: true,
          schedule: { $in: ["daily", "weekly"] },
          nextRunAt: { $lte: nowIso },
        },
        { projection: { _id: 0, id: 1 } }
      )
      .sort({ nextRunAt: 1 })
      .limit(2)
      .toArray();

    const results = [];
    for (const item of due) {
      const run = await runSavedSearch(item.id, {
        baseUrl: req.nextUrl.origin,
      });
      results.push({
        savedSearchId: item.id,
        runId: run.id,
        status: run.status,
        newLeads: run.newLeadIds.length,
      });
    }

    return NextResponse.json({ ok: true, processed: results });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cron run failed" },
      { status: 500 }
    );
  }
}
