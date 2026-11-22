import { NextRequest, NextResponse } from "next/server";
import { regenerateLeadMessage } from "@/lib/connectors/scoring";
import { getLeadsCollection, isMongoConfigured } from "@/lib/mongodb";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  if (!isMongoConfigured()) {
    return NextResponse.json(
      { error: "Database not configured" },
      { status: 503 }
    );
  }

  try {
    const body = (await req.json().catch(() => ({}))) as {
      clientName?: string;
    };
    const col = await getLeadsCollection();
    const lead = await col.findOne({ id }, { projection: { _id: 0 } });
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const aiMessage = await regenerateLeadMessage(lead, body.clientName);
    const nowIso = new Date().toISOString();

    const updated = await col.findOneAndUpdate(
      { id },
      {
        $set: { aiMessage },
        $push: {
          activity: {
            id: `act-${Date.now()}-regen`,
            type: "message_regenerated",
            detail: "Regenerated outreach message",
            at: nowIso,
          },
        },
      },
      { returnDocument: "after", projection: { _id: 0 } }
    );

    return NextResponse.json({ lead: updated, aiMessage });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to regenerate message",
      },
      { status: 500 }
    );
  }
}
