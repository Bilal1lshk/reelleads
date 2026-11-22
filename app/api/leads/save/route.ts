import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { saveLeadsToCrm } from "@/lib/connectors/orchestrator";
import { isMongoConfigured } from "@/lib/mongodb";
import type { Lead } from "@/types/lead";

const saveLeadsSchema = z.object({
  leads: z.array(z.record(z.string(), z.unknown())).min(1).max(200),
  workspaceId: z.string().trim().max(60).optional(),
});

export async function POST(req: NextRequest) {
  if (!isMongoConfigured()) {
    return NextResponse.json(
      { error: "Database not configured" },
      { status: 503 }
    );
  }

  try {
    const raw = await req.json();
    const parsed = saveLeadsSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid payload" },
        { status: 400 }
      );
    }

    const result = await saveLeadsToCrm(
      parsed.data.leads as unknown as Lead[],
      parsed.data.workspaceId || "default"
    );

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save leads" },
      { status: 500 }
    );
  }
}
