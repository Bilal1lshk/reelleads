import { NextRequest, NextResponse } from "next/server";
import { parseRawTextToLead } from "@/lib/connectors/importer";
import { computeLeadScore } from "@/lib/connectors/scoring";
import {
  buildDedupeKey,
  getLeadsCollection,
  isMongoConfigured,
} from "@/lib/mongodb";
import { getCountryVariants, stripPersonalNames } from "@/lib/utils";
import { createLeadSchema } from "@/lib/validation";

const SORTABLE_FIELDS = new Set([
  "name",
  "sourcePlatform",
  "type",
  "country",
  "city",
  "score",
  "status",
  "email",
  "whatsapp",
  "instagram",
  "website",
  "followers",
  "postsPerWeek",
  "budgetSignal",
  "lastContactedAt",
  "nextFollowUpAt",
  "createdAt",
]);

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const workspaceId = searchParams.get("workspaceId")?.trim() || "";
  const search = searchParams.get("search")?.trim() || "";
  const type = searchParams.get("type") || "all";
  const platform = searchParams.get("platform") || "all";
  const country = searchParams.get("country")?.trim() || "all";
  const tag = searchParams.get("tag")?.trim() || "";
  const minScore = Number(searchParams.get("minScore") || 0);
  const maxScore = Number(searchParams.get("maxScore") || 0);
  const hasWhatsApp = searchParams.get("hasWhatsApp") === "true";
  const hasEmail = searchParams.get("hasEmail") === "true";
  const hasContact = searchParams.get("hasContact") === "true";
  const missingFollowUp = searchParams.get("missingFollowUp") === "true";
  const freshToday = searchParams.get("freshToday") === "true";
  const dateFrom = searchParams.get("dateFrom")?.trim() || "";
  const dateTo = searchParams.get("dateTo")?.trim() || "";
  const status = searchParams.get("status") || "all";
  const savedOnly = searchParams.get("savedOnly") === "true";
  const qualityOnly = searchParams.get("qualityOnly") === "true";
  const showLowScore = searchParams.get("showLowScore") !== "false";

  const rawSortBy = searchParams.get("sortBy") || "score";
  const rawSortDir = searchParams.get("sortDir") || "desc";
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const pageSize = Math.min(200, Math.max(1, Number(searchParams.get("pageSize") || 50)));

  if (!isMongoConfigured()) {
    return NextResponse.json({
      leads: [],
      total: 0,
      page,
      pageSize,
      totalPages: 1,
      storage: "not_configured",
    });
  }

  try {
    const col = await getLeadsCollection();
    const andClauses: Record<string, unknown>[] = [];

    // Single unified workspace: only filter by workspaceId if a non-default explicit filter is passed
    if (
      workspaceId &&
      workspaceId !== "all" &&
      workspaceId !== "default"
    ) {
      andClauses.push({ workspaceId });
    }

    if (savedOnly) {
      andClauses.push({ status: { $ne: "new" } });
    } else if (status !== "all") {
      andClauses.push({ status });
    }

    if (type !== "all") andClauses.push({ type });
    if (platform !== "all") andClauses.push({ sourcePlatform: platform });

    if (country && country !== "all") {
      const variants = getCountryVariants(country);
      andClauses.push({
        country: { $in: variants.map((v) => new RegExp(`^${v}$`, "i")) },
      });
    }

    if (tag) {
      andClauses.push({ tags: tag });
    }

    const effectiveMinScore = Math.max(minScore, showLowScore ? 0 : 50);
    if (effectiveMinScore > 0 || maxScore > 0) {
      const scoreCond: Record<string, number> = {};
      if (effectiveMinScore > 0) scoreCond.$gte = effectiveMinScore;
      if (maxScore > 0) scoreCond.$lte = maxScore;
      andClauses.push({ score: scoreCond });
    }

    if (hasWhatsApp) {
      andClauses.push({ whatsapp: { $exists: true, $nin: ["", null] } });
    }
    if (hasEmail) {
      andClauses.push({ email: { $exists: true, $nin: ["", null] } });
    }
    if (hasContact) {
      andClauses.push({
        $or: [
          { email: { $exists: true, $nin: ["", null] } },
          { whatsapp: { $exists: true, $nin: ["", null] } },
          { instagram: { $exists: true, $nin: ["", null] } },
          { sourceUrl: { $exists: true, $nin: ["", null] } },
        ],
      });
    }
    if (missingFollowUp) {
      andClauses.push({
        $or: [
          { nextFollowUpAt: { $exists: false } },
          { nextFollowUpAt: null },
          { nextFollowUpAt: "" },
        ],
      });
    }
    if (freshToday) {
      const yesterdayIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      andClauses.push({ freshAt: { $gte: yesterdayIso } });
    }

    if (qualityOnly) {
      andClauses.push({ sourceUrl: { $exists: true, $nin: ["", null] } });
      andClauses.push({
        $or: [
          { email: { $exists: true, $nin: ["", null] } },
          { whatsapp: { $exists: true, $nin: ["", null] } },
          { instagram: { $exists: true, $nin: ["", null] } },
          { website: { $exists: true, $nin: ["", null] } },
        ],
      });
    }

    if (dateFrom || dateTo) {
      const dateCond: Record<string, string> = {};
      if (dateFrom) dateCond.$gte = new Date(dateFrom).toISOString();
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        dateCond.$lte = end.toISOString();
      }
      andClauses.push({ createdAt: dateCond });
    }

    if (search) {
      const regex = { $regex: search, $options: "i" };
      andClauses.push({
        $or: [
          { name: regex },
          { city: regex },
          { country: regex },
          { email: regex },
          { whatsapp: regex },
          { instagram: regex },
          { whyThisLead: regex },
          { niche: regex },
          { tags: regex },
        ],
      });
    }

    const filter = andClauses.length > 0 ? { $and: andClauses } : {};

    let sortSpec: Record<string, 1 | -1> = { score: -1 };
    if (rawSortBy === "score_asc") sortSpec = { score: 1 };
    else if (rawSortBy === "score_desc") sortSpec = { score: -1 };
    else if (rawSortBy === "newest") sortSpec = { createdAt: -1 };
    else if (SORTABLE_FIELDS.has(rawSortBy)) {
      sortSpec = { [rawSortBy]: rawSortDir === "asc" ? 1 : -1 };
    }

    const [total, docs] = await Promise.all([
      col.countDocuments(filter),
      col
        .find(filter, { projection: { _id: 0 } })
        .sort(sortSpec)
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .toArray(),
    ]);

    const sanitizedDocs = docs.map((d) => ({
      ...d,
      aiMessage: stripPersonalNames(d.aiMessage),
    }));

    return NextResponse.json({
      leads: sanitizedDocs,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      storage: "mongodb",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Database query failed" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json();
    const parsed = createLeadSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid lead payload" },
        { status: 400 }
      );
    }

    const body = parsed.data;
    if (!body.text && !body.name) {
      return NextResponse.json(
        { error: "Provide at least a name or raw text snippet." },
        { status: 400 }
      );
    }

    const lead = parseRawTextToLead({
      name: body.name,
      text: body.text || body.name || "",
      platform: body.platform || "manual",
      type: body.type,
      sourceUrl: body.sourceUrl,
      city: body.city,
      country: body.country,
      niche: body.niche,
      workspaceId: body.workspaceId,
    });

    if (body.email) lead.email = body.email;
    if (body.whatsapp) lead.whatsapp = body.whatsapp;
    if (body.instagram) lead.instagram = body.instagram;
    if (body.website) lead.website = body.website;
    if (body.budgetSignal) lead.budgetSignal = body.budgetSignal;
    if (body.followers !== undefined) lead.followers = body.followers;
    if (body.tags) lead.tags = body.tags;
    lead.score = computeLeadScore(lead);
    lead.dedupeKey = buildDedupeKey(lead);

    if (isMongoConfigured()) {
      const col = await getLeadsCollection();
      await col.updateOne(
        { dedupeKey: lead.dedupeKey },
        { $setOnInsert: lead },
        { upsert: true }
      );
    }

    return NextResponse.json({ lead }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create lead" },
      { status: 500 }
    );
  }
}
