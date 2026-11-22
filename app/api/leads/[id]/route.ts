import { NextRequest, NextResponse } from "next/server";
import { computeLeadScore } from "@/lib/connectors/scoring";
import { buildDedupeKey, getLeadsCollection, isMongoConfigured } from "@/lib/mongodb";
import { stripPersonalNames } from "@/lib/utils";
import { patchLeadSchema } from "@/lib/validation";
import type { Lead, LeadActivityEntry, LeadNoteEntry } from "@/types/lead";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  if (!isMongoConfigured()) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  try {
    const col = await getLeadsCollection();
    const lead = await col.findOne({ id }, { projection: { _id: 0 } });
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    return NextResponse.json({
      lead: { ...lead, aiMessage: stripPersonalNames(lead.aiMessage) },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch lead" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  try {
    if (!isMongoConfigured()) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    const raw = await req.json();
    const parsed = patchLeadSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid update payload" },
        { status: 400 }
      );
    }

    const patch = parsed.data;
    const col = await getLeadsCollection();
    const existing = await col.findOne({ id }, { projection: { _id: 0 } });
    if (!existing) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const nowIso = new Date().toISOString();
    const setFields: Record<string, unknown> = {};
    const newActivities: LeadActivityEntry[] = [];

    const editableKeys = [
      "name",
      "type",
      "city",
      "country",
      "notes",
      "aiMessage",
      "email",
      "whatsapp",
      "instagram",
      "website",
      "sourceUrl",
      "budgetSignal",
      "followers",
      "postsPerWeek",
      "tags",
      "nextFollowUpAt",
      "lastContactedAt",
      "notFitReason",
    ] as const;

    for (const key of editableKeys) {
      const val = patch[key];
      if (val !== undefined) {
        setFields[key] = val === null ? undefined : val;
        if (val !== existing[key]) {
          newActivities.push({
            id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            type: "field_edit",
            field: key,
            from: existing[key] !== undefined ? String(existing[key]) : undefined,
            to: val !== null ? String(val) : "",
            at: nowIso,
          });
        }
      }
    }

    if (patch.logContact) {
      setFields.lastContactedAt = nowIso;
      if (!patch.status && existing.status === "new") {
        setFields.status = "contacted";
      }
      newActivities.push({
        id: `act-${Date.now()}-log`,
        type: "contact_logged",
        detail: "Contact logged",
        at: nowIso,
      });
    }

    if (patch.status !== undefined && patch.status !== existing.status) {
      setFields.status = patch.status;
      newActivities.push({
        id: `act-${Date.now()}-st`,
        type: "status_change",
        from: existing.status,
        to: patch.status,
        detail: patch.notFitReason ? `Reason: ${patch.notFitReason}` : undefined,
        at: nowIso,
      });
    }

    let updatedNoteEntries = existing.noteEntries ?? [];
    if (patch.addNote) {
      const entry: LeadNoteEntry = {
        id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        text: patch.addNote,
        createdAt: nowIso,
      };
      updatedNoteEntries = [entry, ...updatedNoteEntries];
      setFields.noteEntries = updatedNoteEntries;
      newActivities.push({
        id: `act-${Date.now()}-note`,
        type: "note_added",
        detail: patch.addNote.slice(0, 120),
        at: nowIso,
      });
    }

    const candidate: Lead = { ...existing, ...(setFields as Partial<Lead>) };
    const nextDedupeKey = buildDedupeKey(candidate);

    // Merge into an existing duplicate lead if requested
    if (patch.mergeIntoId) {
      const target = await col.findOne(
        { id: patch.mergeIntoId },
        { projection: { _id: 0 } }
      );
      if (!target) {
        return NextResponse.json(
          { error: "Merge target not found" },
          { status: 404 }
        );
      }
      const merged: Partial<Lead> = {
        email: target.email || candidate.email,
        whatsapp: target.whatsapp || candidate.whatsapp,
        instagram: target.instagram || candidate.instagram,
        website: target.website || candidate.website,
        followers: target.followers ?? candidate.followers,
        budgetSignal: target.budgetSignal || candidate.budgetSignal,
        tags: Array.from(new Set([...(target.tags ?? []), ...(candidate.tags ?? [])])),
        noteEntries: [...(target.noteEntries ?? []), ...(candidate.noteEntries ?? [])],
        activity: [
          ...(target.activity ?? []),
          {
            id: `act-${Date.now()}-merge`,
            type: "field_edit",
            detail: `Merged duplicate lead "${existing.name}"`,
            at: nowIso,
          },
        ],
      };
      merged.score = computeLeadScore({ ...target, ...merged });
      const mergedRes = await col.findOneAndUpdate(
        { id: target.id },
        { $set: merged },
        { returnDocument: "after", projection: { _id: 0 } }
      );
      await col.deleteOne({ id });
      return NextResponse.json({ lead: mergedRes, mergedFromId: id });
    }

    // Duplicate check on dedupeKey collision
    if (nextDedupeKey !== existing.dedupeKey && !patch.force) {
      const duplicate = await col.findOne(
        { dedupeKey: nextDedupeKey, id: { $ne: id } },
        { projection: { _id: 0, id: 1, name: 1, email: 1, instagram: 1, sourceUrl: 1 } }
      );
      if (duplicate) {
        return NextResponse.json(
          {
            error: `Duplicate lead detected: ${duplicate.name}`,
            duplicate,
          },
          { status: 409 }
        );
      }
    }

    setFields.dedupeKey = nextDedupeKey;
    setFields.score = computeLeadScore(candidate);

    const updateOp: Record<string, unknown> = { $set: setFields };
    if (newActivities.length > 0) {
      updateOp.$push = { activity: { $each: newActivities } };
    }

    const result = await col.findOneAndUpdate({ id }, updateOp, {
      returnDocument: "after",
      projection: { _id: 0 },
    });

    if (!result) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    return NextResponse.json({ lead: result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update lead" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!isMongoConfigured()) {
    return NextResponse.json({ deleted: true });
  }

  try {
    const col = await getLeadsCollection();
    await col.deleteOne({ id });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete lead" },
      { status: 500 }
    );
  }
}
