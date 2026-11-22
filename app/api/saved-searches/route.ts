import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { computeNextRunAt } from "@/lib/autopilot/run";
import { FEATURE_AUTOPILOT } from "@/lib/config";
import {
  getAutopilotRunsCollection,
  getSavedSearchesCollection,
  isMongoConfigured,
} from "@/lib/mongodb";
import { leadPlatformEnum, leadTypeEnum } from "@/lib/validation";
import type { SavedSearch } from "@/types/lead";

const createSavedSearchSchema = z.object({
  workspaceId: z.string().trim().max(60).default("default"),
  name: z.string().trim().min(1, "Name is required").max(80),
  params: z.object({
    niche: z.string().trim().min(1),
    clientTypes: z.array(leadTypeEnum).min(1),
    platforms: z.array(leadPlatformEnum).optional(),
    country: z.string().default("all"),
    countries: z.array(z.string()).optional(),
    excludedCountries: z.array(z.string()).optional(),
    city: z.string().default(""),
    count: z.union([
      z.literal(10),
      z.literal(25),
      z.literal(50),
      z.literal(100),
    ]),
    offer: z.string().optional(),
  }),
  schedule: z.enum(["off", "daily", "weekly"]).default("daily"),
  runAtHour: z.number().int().min(0).max(23).default(7),
  timezone: z.string().trim().min(1).max(60).default("UTC"),
  minScore: z.number().int().min(0).max(100).default(75),
  maxLeadsPerRun: z.number().int().min(1).max(50).default(25),
  digestEmail: z
    .string()
    .trim()
    .email("Enter a valid digest email")
    .optional()
    .or(z.literal("")),
});

export async function GET(req: NextRequest) {
  if (!FEATURE_AUTOPILOT) {
    return NextResponse.json({ savedSearches: [], runs: [] });
  }
  if (!isMongoConfigured()) {
    return NextResponse.json({ savedSearches: [], runs: [] });
  }

  const workspaceId =
    req.nextUrl.searchParams.get("workspaceId")?.trim() || "default";

  try {
    const [savedCol, runsCol] = await Promise.all([
      getSavedSearchesCollection(),
      getAutopilotRunsCollection(),
    ]);

    const [savedSearches, runs] = await Promise.all([
      savedCol
        .find({ workspaceId }, { projection: { _id: 0 } })
        .sort({ createdAt: -1 })
        .toArray(),
      runsCol
        .find({ workspaceId }, { projection: { _id: 0 } })
        .sort({ startedAt: -1 })
        .limit(30)
        .toArray(),
    ]);

    return NextResponse.json({ savedSearches, runs });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to load saved searches",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
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

  try {
    const raw = await req.json();
    const parsed = createSavedSearchSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid saved search" },
        { status: 400 }
      );
    }

    const input = parsed.data;
    const col = await getSavedSearchesCollection();
    const active = input.schedule !== "off";

    if (active) {
      const activeCount = await col.countDocuments({
        workspaceId: input.workspaceId,
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

    const nowIso = new Date().toISOString();
    const doc: SavedSearch = {
      id: `ss-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      workspaceId: input.workspaceId,
      name: input.name,
      params: input.params,
      schedule: input.schedule,
      runAtHour: input.runAtHour,
      timezone: input.timezone,
      minScore: input.minScore,
      maxLeadsPerRun: input.maxLeadsPerRun,
      digestEmail: input.digestEmail || undefined,
      active,
      nextRunAt: active
        ? computeNextRunAt(input.schedule, input.runAtHour, input.timezone)
        : undefined,
      createdAt: nowIso,
    };

    await col.insertOne(doc);
    return NextResponse.json({ savedSearch: doc }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to save search",
      },
      { status: 500 }
    );
  }
}
