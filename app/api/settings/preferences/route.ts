import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceSettingsCollection, isMongoConfigured } from "@/lib/mongodb";

const updatePrefsSchema = z.object({
  workspaceId: z.string().trim().max(60).default("default"),
  reviewAutopilotLeads: z.boolean(),
});

export async function GET(req: NextRequest) {
  const workspaceId =
    req.nextUrl.searchParams.get("workspaceId")?.trim() || "default";

  if (!isMongoConfigured()) {
    return NextResponse.json({ reviewAutopilotLeads: false });
  }

  const col = await getWorkspaceSettingsCollection();
  const doc = await col.findOne(
    { workspaceId },
    { projection: { _id: 0, reviewAutopilotLeads: 1 } }
  );

  return NextResponse.json({
    reviewAutopilotLeads: Boolean(doc?.reviewAutopilotLeads),
  });
}

export async function POST(req: NextRequest) {
  if (!isMongoConfigured()) {
    return NextResponse.json(
      { error: "Database not configured" },
      { status: 503 }
    );
  }

  try {
    const raw = await req.json();
    const parsed = updatePrefsSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid preferences" },
        { status: 400 }
      );
    }

    const col = await getWorkspaceSettingsCollection();
    await col.updateOne(
      { workspaceId: parsed.data.workspaceId },
      {
        $set: {
          reviewAutopilotLeads: parsed.data.reviewAutopilotLeads,
          updatedAt: new Date().toISOString(),
        },
      },
      { upsert: true }
    );

    return NextResponse.json({
      reviewAutopilotLeads: parsed.data.reviewAutopilotLeads,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to update preferences",
      },
      { status: 500 }
    );
  }
}
