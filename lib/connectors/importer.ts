import {
  buildPersonalizedPitch,
  buildWhyThisLead,
  computeLeadScore,
  extractContactsFromText,
} from "@/lib/connectors/scoring";
import { buildDedupeKey } from "@/lib/mongodb";
import type { Lead, LeadPlatform, LeadType } from "@/types/lead";

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export function parseCsvToLeads(
  csvText: string,
  defaultPlatform: LeadPlatform = "csv_import"
): Lead[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const leads: Lead[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = cols[idx] ?? "";
    });

    const name =
      row.name ||
      row["channel name"] ||
      row["company"] ||
      row["full name"] ||
      row["creator"] ||
      `Imported Lead #${i}`;

    const rawPlatform = (row.platform || row.source || defaultPlatform)
      .toLowerCase()
      .trim() as LeadPlatform;

    const rawType = (row.type || "creator").toLowerCase().trim();
    const type: LeadType = (
      ["local_brand", "creator", "coach", "youtuber", "agency"].includes(rawType)
        ? rawType
        : "creator"
    ) as LeadType;

    const partial: Partial<Lead> = {
      name,
      type,
      city: row.city || "",
      country: row.country || "Global",
      email: row.email || undefined,
      whatsapp: row.whatsapp || row.phone || undefined,
      instagram: row.instagram || undefined,
      website: row.website || row.url || undefined,
      sourcePlatform: rawPlatform || defaultPlatform,
      sourceUrl: row.sourceurl || row.url || undefined,
      budgetSignal: row.budget || undefined,
      niche: row.niche || undefined,
      followers: row.followers ? Number(row.followers) || undefined : undefined,
      postsPerWeek: row.postsperweek
        ? Number(row.postsperweek) || undefined
        : undefined,
    };

    const lead: Lead = {
      id: `imp-${Date.now()}-${i}`,
      name: partial.name!,
      type,
      city: partial.city!,
      country: partial.country!,
      score: row.score ? Number(row.score) || computeLeadScore(partial) : computeLeadScore(partial),
      whyThisLead:
        row["why this lead"] ||
        row.whythislead ||
        buildWhyThisLead({
          name,
          type,
          platform: partial.sourcePlatform,
          followers: partial.followers,
          postsPerWeek: partial.postsPerWeek,
          budgetSignal: partial.budgetSignal,
          niche: partial.niche,
        }),
      email: partial.email,
      whatsapp: partial.whatsapp,
      instagram: partial.instagram,
      website: partial.website,
      followers: partial.followers,
      postsPerWeek: partial.postsPerWeek,
      aiMessage:
        row["ai message"] ||
        row.aimessage ||
        buildPersonalizedPitch({
          name,
          type,
          niche: partial.niche,
          platform: partial.sourcePlatform,
        }),
      status: "new",
      notes: row.notes || undefined,
      createdAt: new Date().toISOString(),
      sourcePlatform: partial.sourcePlatform,
      sourceUrl: partial.sourceUrl,
      budgetSignal: partial.budgetSignal,
      niche: partial.niche,
    };
    lead.dedupeKey = buildDedupeKey(lead);
    leads.push(lead);
  }

  return leads;
}

export function parseRawTextToLead(input: {
  name?: string;
  text: string;
  platform?: LeadPlatform;
  type?: LeadType;
  sourceUrl?: string;
  city?: string;
  country?: string;
  niche?: string;
  workspaceId?: string;
}): Lead {
  const contacts = extractContactsFromText(input.text);
  const platform = input.platform || "manual";
  const type = input.type || "creator";
  const name =
    input.name?.trim() ||
    contacts.instagram ||
    contacts.email?.split("@")[0] ||
    "Imported Lead";

  const partial: Partial<Lead> = {
    name,
    type,
    city: input.city || "",
    country: input.country || "Global",
    email: contacts.email,
    whatsapp: contacts.whatsapp,
    instagram: contacts.instagram,
    website: contacts.website || input.sourceUrl,
    budgetSignal: contacts.budgetSignal,
    sourcePlatform: platform,
    sourceUrl: input.sourceUrl,
    niche: input.niche,
  };

  const lead: Lead = {
    id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    type,
    city: partial.city!,
    country: partial.country!,
    score: computeLeadScore(partial),
    whyThisLead: buildWhyThisLead({
      name,
      type,
      platform,
      budgetSignal: contacts.budgetSignal,
      niche: input.niche,
    }),
    email: contacts.email,
    whatsapp: contacts.whatsapp,
    instagram: contacts.instagram,
    website: partial.website,
    aiMessage: buildPersonalizedPitch({
      name,
      type,
      niche: input.niche,
      platform,
    }),
    status: "new",
    notes: input.text.slice(0, 500),
    rawText: input.text,
    sourceSnippet: input.text.slice(0, 220),
    tags: [],
    workspaceId: input.workspaceId,
    activity: [
      {
        id: `act-${Date.now()}`,
        type: "created",
        detail: `Added via ${platform}`,
        at: new Date().toISOString(),
      },
    ],
    createdAt: new Date().toISOString(),
    sourcePlatform: platform,
    sourceUrl: input.sourceUrl,
    budgetSignal: contacts.budgetSignal,
    niche: input.niche,
  };
  lead.dedupeKey = buildDedupeKey(lead);
  return lead;
}
