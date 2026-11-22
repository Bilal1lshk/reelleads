import { NextRequest, NextResponse } from "next/server";
import { getSavedViewsCollection, isMongoConfigured } from "@/lib/mongodb";
import { savedViewSchema } from "@/lib/validation";
import type { SavedView } from "@/types/lead";

export async function GET(_req: NextRequest) {
  if (!isMongoConfigured()) {
    return NextResponse.json({ views: [] });
  }

  try {
    const col = await getSavedViewsCollection();
    const views = await col
      .find({}, { projection: { _id: 0 } })
      .sort({ createdAt: -1 })
      .toArray();
    return NextResponse.json({ views });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load saved views" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!isMongoConfigured()) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    const raw = await req.json();
    const parsed = savedViewSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid saved view" },
        { status: 400 }
      );
    }

    const view: SavedView = {
      id: `view-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      workspaceId: parsed.data.workspaceId,
      name: parsed.data.name,
      filters: parsed.data.filters as SavedView["filters"],
      createdAt: new Date().toISOString(),
    };

    const col = await getSavedViewsCollection();
    await col.insertOne(view);
    return NextResponse.json({ view }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save view" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  if (!isMongoConfigured()) {
    return NextResponse.json({ deleted: true });
  }

  try {
    const col = await getSavedViewsCollection();
    await col.deleteOne({ id });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete view" },
      { status: 500 }
    );
  }
}
