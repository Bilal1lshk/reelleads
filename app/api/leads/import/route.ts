import { NextRequest, NextResponse } from "next/server";
import { parseCsvToLeads } from "@/lib/connectors/importer";
import { getLeadsCollection, isMongoConfigured } from "@/lib/mongodb";
import type { LeadPlatform } from "@/types/lead";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      csvText?: string;
      platform?: LeadPlatform;
    };

    if (!body.csvText?.trim()) {
      return NextResponse.json(
        { error: "csvText is required." },
        { status: 400 }
      );
    }

    const leads = parseCsvToLeads(
      body.csvText,
      body.platform || "csv_import"
    );

    if (leads.length === 0) {
      return NextResponse.json(
        { error: "No valid rows found in CSV." },
        { status: 400 }
      );
    }

    let insertedCount = leads.length;
    let updatedCount = 0;

    if (isMongoConfigured()) {
      const col = await getLeadsCollection();
      const ops = leads.map((lead) => ({
        updateOne: {
          filter: { dedupeKey: lead.dedupeKey },
          update: { $setOnInsert: lead },
          upsert: true,
        },
      }));
      const res = await col.bulkWrite(ops, { ordered: false });
      insertedCount = res.upsertedCount;
      updatedCount = res.matchedCount;
    }

    return NextResponse.json({
      leads,
      totalParsed: leads.length,
      insertedCount,
      updatedCount,
      storage: isMongoConfigured() ? "mongodb" : "memory_fallback",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Import failed" },
      { status: 500 }
    );
  }
}
