import { NextRequest, NextResponse } from "next/server";
import { getLeadsCollection, isMongoConfigured } from "@/lib/mongodb";
import type { Lead } from "@/types/lead";

function buildCsv(selected: Lead[]): string {
  const headers = [
    "Name",
    "Type",
    "Platform",
    "City",
    "Country",
    "Score",
    "Status",
    "Email",
    "WhatsApp",
    "Instagram",
    "Website",
    "Source URL",
    "Followers",
    "Posts/Week",
    "Budget",
    "Tags",
    "Next Follow-Up",
    "Last Contacted",
    "Hiring Signal",
    "Why This Lead",
    "AI Message",
    "Notes",
  ];

  const escapeCsv = (val?: string | number) => {
    const str = val === undefined || val === null ? "" : String(val);
    return `"${str.replace(/"/g, '""')}"`;
  };

  const rows = selected.map((l) =>
    [
      l.name,
      l.type,
      l.sourcePlatform,
      l.city,
      l.country,
      l.score,
      l.status,
      l.email,
      l.whatsapp,
      l.instagram,
      l.website,
      l.sourceUrl,
      l.followers,
      l.postsPerWeek,
      l.budgetSignal,
      (l.tags ?? []).join("; "),
      l.nextFollowUpAt,
      l.lastContactedAt,
      l.hiringSignal,
      l.whyThisLead,
      l.aiMessage,
      l.notes,
    ]
      .map(escapeCsv)
      .join(",")
  );

  return [headers.join(","), ...rows].join("\n");
}

async function fetchLeadsByIds(ids: string[]): Promise<Lead[]> {
  if (!isMongoConfigured()) return [];
  const col = await getLeadsCollection();
  const filter = ids.length > 0 ? { id: { $in: ids } } : {};
  return col
    .find(filter, { projection: { _id: 0 } })
    .sort({ score: -1 })
    .toArray();
}

export async function GET(req: NextRequest) {
  try {
    const idsParam = req.nextUrl.searchParams.get("ids") || "";
    const ids = idsParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const selected = await fetchLeadsByIds(ids);
    const csv = buildCsv(selected);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="nicheleads-export.csv"',
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Export failed" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { ids = [] } = (await req.json()) as { ids?: string[] };
    const selected = await fetchLeadsByIds(ids);
    return NextResponse.json({ csv: buildCsv(selected) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Export failed" },
      { status: 500 }
    );
  }
}
