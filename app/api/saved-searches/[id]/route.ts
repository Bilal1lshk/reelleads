import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { computeNextRunAt } from "@/lib/autopilot/run";
import { FEATURE_AUTOPILOT } from "@/lib/config";
import { getSavedSearchesCollection, isMongoConfigured } from "@/lib/mongodb";

const patchSavedSearchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  schedule: z.enum(["off", "daily", "weekly"]).optional(),
  runAtHour: z.number().int().min(0).max(23).optional(),
  timezone: z.string().trim().min(1).max(60).optional(),
  minScore: z.number().int().min(0).max(100).optional(),
  maxLeadsPerRun: z.number().int().min(1).max(50).optional(),
  digestEmail: z
    .string()
    .trim()
    .email("Enter a valid digest email")
    .optional()
    .or(z.literal("")),
  active: z.boolean().optional(),
});

export async function PATCH(
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
    const raw = await req.json();
    const parsed = patchSavedSearchSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid update payload" },
        { status: 400 }
      );
    }

    const col = await getSavedSearchesCollection();
    const existing = await col.findOne({ id }, { projection: { _id: 0 } });
    if (!existing) {
      return NextResponse.json(
        { error: "Saved search not found" },
        { status: 404 }
      );
    }

    const nextSchedule = parsed.data.schedule ?? existing.schedule;
    const nextActive =
      parsed.data.active !== undefined
        ? parsed.data.active
        : nextSchedule !== "off";
    const nextHour = parsed.data.runAtHour ?? existing.runAtHour;
    const nextTz = parsed.data.timezone ?? existing.timezone;

    if (nextActive && !existing.active && nextSchedule !== "off") {
      const activeCount = await col.countDocuments({
        workspaceId: existing.workspaceId,
        active: true,
        schedule: { $ne: "off" },
      });
      if (activeCount >= 5) {
        return NextResponse.json(
          {
            error:
              "Maximum 5 active scheduled searches per workspace. Pause or delete one first.",
          },
          { status: 400 }
        );
      }
    }

    const nextRunAt =
      nextActive && nextSchedule !== "off"
        ? computeNextRunAt(nextSchedule, nextHour, nextTz)
        : undefined;

    const updateFields: Record<string, unknown> = {
      ...parsed.data,
      active: nextActive,
      nextRunAt,
    };
    if (parsed.data.digestEmail === "") {
      updateFields.digestEmail = undefined;
    }

    const updated = await col.findOneAndUpdate(
      { id },
      { $set: updateFields },
      { returnDocument: "after", projection: { _id: 0 } }
    );

    return NextResponse.json({ savedSearch: updated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update search" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
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
    const col = await getSavedSearchesCollection();
    const res = await col.deleteOne({ id });
    if (res.deletedCount === 0) {
      return NextResponse.json(
        { error: "Saved search not found" },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete search" },
      { status: 500 }
    );
  }
}
