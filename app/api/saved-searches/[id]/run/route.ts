import { NextRequest, NextResponse } from "next/server";
import { runSavedSearch } from "@/lib/autopilot/run";
import { FEATURE_AUTOPILOT } from "@/lib/config";
import { isMongoConfigured } from "@/lib/mongodb";

export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!FEATURE_AUTOPILOT) {
    return NextResponse.json(
      { error: "Autopilot feature is disabled" },
      { status: 404 }
    );
  }
  if (!isMongoConfigured()) {
    return NextResponse.json(
      { error: "Database not configured" },
      { status: 503 }
    );
  }

  const { id } = await context.params;
  try {
    const origin = req.nextUrl.origin;
    const run = await runSavedSearch(id, { baseUrl: origin });
    return NextResponse.json({ run });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to run saved search",
      },
      { status: 500 }
    );
  }
}
