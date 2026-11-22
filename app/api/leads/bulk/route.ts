import { NextRequest, NextResponse } from "next/server";
import { getLeadsCollection, isMongoConfigured } from "@/lib/mongodb";
import { bulkLeadsSchema } from "@/lib/validation";

export async function POST(req: NextRequest) {
  try {
    if (!isMongoConfigured()) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    const raw = await req.json();
    const parsed = bulkLeadsSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid bulk request" },
        { status: 400 }
      );
    }

    const { ids, action, status, tag, nextFollowUpAt } = parsed.data;
    const col = await getLeadsCollection();
    const nowIso = new Date().toISOString();

    if (action === "delete") {
      const res = await col.deleteMany({ id: { $in: ids } });
      return NextResponse.json({ affected: res.deletedCount });
    }

    if (action === "status") {
      if (!status) {
        return NextResponse.json(
          { error: "status is required for bulk status update" },
          { status: 400 }
        );
      }
      const res = await col.updateMany(
        { id: { $in: ids } },
        {
          $set: { status },
          $push: {
            activity: {
              id: `act-${Date.now()}-bulk`,
              type: "status_change",
              to: status,
              detail: "Bulk status update",
              at: nowIso,
            },
          },
        }
      );
      return NextResponse.json({ affected: res.modifiedCount });
    }

    if (action === "add_tag") {
      if (!tag) {
        return NextResponse.json(
          { error: "tag is required for bulk add_tag" },
          { status: 400 }
        );
      }
      const res = await col.updateMany(
        { id: { $in: ids } },
        { $addToSet: { tags: tag } }
      );
      return NextResponse.json({ affected: res.modifiedCount });
    }

    if (action === "follow_up") {
      const res = await col.updateMany(
        { id: { $in: ids } },
        {
          $set: { nextFollowUpAt: nextFollowUpAt || undefined },
          $push: {
            activity: {
              id: `act-${Date.now()}-fu`,
              type: "field_edit",
              field: "nextFollowUpAt",
              to: nextFollowUpAt || "",
              detail: "Bulk follow-up scheduled",
              at: nowIso,
            },
          },
        }
      );
      return NextResponse.json({ affected: res.modifiedCount });
    }

    return NextResponse.json({ error: "Unsupported bulk action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Bulk operation failed" },
      { status: 500 }
    );
  }
}
