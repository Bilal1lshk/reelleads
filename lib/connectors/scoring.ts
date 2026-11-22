import { APP_CONFIG, getClientProfile } from "@/lib/config";
import type { Lead, LeadPlatform, LeadType } from "@/types/lead";

export interface ExtractedContacts {
  email?: string;
  whatsapp?: string;
  instagram?: string;
  website?: string;
  budgetSignal?: string;
  followers?: number;
}

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const IG_REGEX = /(?:instagram\.com\/|(?<![a-zA-Z0-9._%+-])@)([a-zA-Z0-9._]{3,30})/i;
const IG_BLACKLIST = new Set(["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com"]);
const WA_REGEX =
  /(?:wa\.me\/|whatsapp[:\s]*\+?)(\+?\d[\d\s-]{8,15}\d)/i;
const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
const BUDGET_REGEX =
  /(?:\$|USD|PKR|Rs\.?|AED|GBP|£|€)\s?\d[\d,]*(?:\s?[-–to]+\s?(?:\$|USD|PKR|Rs\.?|AED|GBP|£|€)?\s?\d[\d,]*)?(?:\s*(?:\/|\bper\b)\s*(?:hr|hour|video|reel|short|month|mo|project))?/i;

export function extractContactsFromText(text: string): ExtractedContacts {
  if (!text) return {};

  const emails = text.match(EMAIL_REGEX)?.filter(
    (e) =>
      !e.endsWith(".png") &&
      !e.endsWith(".jpg") &&
      !e.endsWith(".webp") &&
      !e.includes("example.com") &&
      !e.includes("sentry.io") &&
      !e.includes("wixpress.com")
  );
  const igMatch = text.match(IG_REGEX);
  const waMatch = text.match(WA_REGEX);
  const pkMatch = text.match(/(?:\+92|0092|0)3\d{2}[\s-]?\d{7}\b/);
  const rawWa = (waMatch?.[1] || pkMatch?.[0])?.replace(/[\s\-()]/g, "");
  const whatsapp =
    rawWa && rawWa.startsWith("03") && rawWa.length === 11
      ? `+92${rawWa.slice(1)}`
      : rawWa;
  const folMatch = text.match(
    /(\d+(?:\.\d+)?)\s*([KkMm])\+?\s*(?:followers|subscribers|subs)\b/i
  );
  const followers = folMatch
    ? Math.round(
        Number(folMatch[1]) * (folMatch[2].toLowerCase() === "m" ? 1_000_000 : 1_000)
      )
    : undefined;
  const urls = text.match(URL_REGEX)?.filter(
    (u) =>
      !u.includes("instagram.com") &&
      !u.includes("reddit.com") &&
      !u.includes("youtube.com") &&
      !u.includes("youtu.be")
  );
  const budgetMatch = text.match(BUDGET_REGEX);

  const rawUrl = urls?.[0]?.replace(/[.,;!?)\]]+$/, "");

  const igHandle = igMatch?.[1]?.replace(/^@/, "");
  const validIg =
    igHandle && !IG_BLACKLIST.has(igHandle.toLowerCase())
      ? `https://instagram.com/${igHandle}`
      : undefined;

  return {
    email: emails?.[0]?.toLowerCase(),
    whatsapp,
    instagram: validIg,
    website: rawUrl,
    budgetSignal: budgetMatch?.[0]?.trim(),
    followers,
  };
}

export function hasAnyContact(lead: Partial<Lead>): boolean {
  return Boolean(
    lead.email?.trim() ||
      lead.whatsapp?.trim() ||
      lead.instagram?.trim() ||
      lead.website?.trim() ||
      lead.sourceUrl?.trim()
  );
}

export function getScoreBreakdown(
  lead: Partial<Lead>
): Array<{ label: string; points: number }> {
  const rules: Array<{ label: string; points: number }> = [
    { label: "base", points: 35 },
  ];

  if (lead.whatsapp) rules.push({ label: "WhatsApp", points: 20 });
  if (lead.email) rules.push({ label: "email", points: 18 });
  if (lead.instagram || lead.website) {
    rules.push({ label: "social/web", points: 7 });
  }

  if (typeof lead.postsPerWeek === "number") {
    if (lead.postsPerWeek >= 5) rules.push({ label: "5+ posts/wk", points: 15 });
    else if (lead.postsPerWeek >= 3) rules.push({ label: "3+ posts/wk", points: 10 });
    else if (lead.postsPerWeek >= 1) rules.push({ label: "1+ posts/wk", points: 5 });
  }

  if (typeof lead.followers === "number") {
    if (lead.followers >= 5_000 && lead.followers <= 250_000) {
      rules.push({ label: "sweet-spot audience", points: 10 });
    } else if (lead.followers > 250_000) {
      rules.push({ label: "large audience", points: 6 });
    } else if (lead.followers >= 1_000) {
      rules.push({ label: "1K+ audience", points: 4 });
    }
  }

  if (lead.budgetSignal) rules.push({ label: "budget mention", points: 8 });
  if (lead.hiringSignal) rules.push({ label: "hiring signal", points: 15 });
  if (lead.countryVerified) rules.push({ label: "verified country", points: 5 });

  return rules;
}

export function computeLeadScore(lead: Partial<Lead>): number {
  const total = getScoreBreakdown(lead).reduce((acc, r) => acc + r.points, 0);
  return Math.max(10, Math.min(99, total));
}

export async function regenerateLeadMessage(
  lead: Lead,
  clientName?: string
): Promise<string> {
  const enriched = await enrichLeadsWithGroq([lead], lead.niche || APP_CONFIG.niche, {
    clientName: clientName || lead.workspaceId || APP_CONFIG.clientName,
  });
  return (
    enriched[0]?.aiMessage ||
    buildPersonalizedPitch({
      name: lead.name,
      type: lead.type,
      niche: lead.niche,
      platform: lead.sourcePlatform,
      signalText: lead.sourceSnippet || lead.notes || lead.name,
      clientName: clientName || lead.workspaceId,
    })
  );
}

export function buildWhyThisLead(input: {
  name: string;
  type: LeadType;
  platform?: LeadPlatform;
  postsPerWeek?: number;
  followers?: number;
  budgetSignal?: string;
  hiringSignal?: string;
  niche?: string;
}): string {
  const parts: string[] = [];

  if (input.platform === "reddit") {
    parts.push(
      input.hiringSignal
        ? `Hiring post on Reddit (${input.hiringSignal})`
        : "Hiring request on Reddit"
    );
  } else if (input.platform === "google_cse") {
    parts.push(
      input.hiringSignal
        ? `Hiring signal on Google (${input.hiringSignal})`
        : `Google result for ${input.niche || APP_CONFIG.niche}`
    );
  } else if (input.platform === "linkedin") {
    parts.push(
      input.hiringSignal
        ? `LinkedIn profile (${input.hiringSignal})`
        : `LinkedIn profile in ${input.niche || APP_CONFIG.niche}`
    );
  } else if (input.platform === "exa") {
    parts.push(
      input.hiringSignal
        ? `Hiring signal via AI Agents (${input.hiringSignal})`
        : `AI Agents match for ${input.niche || APP_CONFIG.niche}`
    );
  } else if (input.platform === "ytjobs") {
    parts.push("Active creator job listing on YTJobs");
  } else if (input.platform === "youtube") {
    parts.push("YouTube channel");
  } else if (input.platform === "google_places") {
    parts.push("Local business with web presence");
  } else if (input.platform === "instagram") {
    parts.push(`Instagram profile in ${input.niche || APP_CONFIG.niche}`);
  } else {
    parts.push(`Matches ${input.niche || APP_CONFIG.niche}`);
  }

  if (input.postsPerWeek) {
    parts.push(`posts ~${input.postsPerWeek}x/week`);
  }
  if (input.followers) {
    parts.push(`${input.followers.toLocaleString()} followers`);
  }
  if (input.budgetSignal) {
    parts.push(`budget: ${input.budgetSignal}`);
  }

  return parts.join(" · ");
}

export function buildPersonalizedPitch(input: {
  name: string;
  type: LeadType;
  niche?: string;
  platform?: LeadPlatform;
  signalText?: string;
  clientName?: string;
  offer?: string;
}): string {
  const profile = getClientProfile(input.clientName);
  const offer =
    input.offer ||
    profile?.offer ||
    `reels editor specializing in ${input.niche || APP_CONFIG.niche}`;
  const niche = input.niche || APP_CONFIG.niche;
  const cleanSignal = input.signalText
    ?.replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);

  if (input.platform === "reddit" && cleanSignal) {
    return `Hi ${input.name}, I saw your Reddit post "${cleanSignal}" and would love to help. I'm a ${offer}. Happy to share relevant reels samples and edit a short test clip if you're still looking.`;
  }

  if (input.platform === "youtube") {
    return `Hi ${input.name}, I came across your YouTube channel in ${niche}. I'm a ${offer}, and I'd love to help repurpose your videos into short-form Reels/Shorts. Would you be open to a quick test edit?`;
  }

  if (input.platform === "instagram") {
    return `Hi ${input.name}, I came across your ${niche} page on Instagram. I'm a ${offer}, and I'd love to help with your short-form Reels. Open to seeing a few samples?`;
  }

  return `Hi ${input.name}, I found your ${niche} profile and wanted to reach out. I'm a ${offer}. Let me know if you're looking for help with Reels or short-form editing.`;
}

export async function enrichLeadsWithGroq(
  leads: Lead[],
  niche: string,
  options?: { clientName?: string; offer?: string }
): Promise<Lead[]> {
  const apiKey = process.env.Groq_API_KEY || process.env.GROQ_API_KEY;
  if (!apiKey || leads.length === 0) return leads;

  const profile = getClientProfile(options?.clientName);
  const offer =
    options?.offer ||
    profile?.offer ||
    `reels editor specializing in ${niche}`;

  const batch = leads.slice(0, 15);
  const compactInput = batch.map((l) => ({
    id: l.id,
    name: l.name,
    type: l.type,
    platform: l.sourcePlatform,
    city: l.city,
    country: l.country,
    niche: l.niche || niche,
    hiringSignal: l.hiringSignal,
    budgetSignal: l.budgetSignal,
    signal: (l.sourceSnippet || l.notes || l.whyThisLead || "").slice(0, 200),
  }));

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-20b",
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You write first-person outreach messages for a ${offer}.
For each lead in JSON, return {"items":[{"id":"...","whyThisLead":"1 factual sentence based ONLY on the provided fields","aiMessage":"Max 3 short sentences for a reels editor offering to work with them"}]}.
Rules:
- Reference the lead's actual signal (e.g. their Reddit post title, niche, or channel/page) from the input JSON.
- Do NOT include any personal sender name or placeholders like [Your Name].
- Do NOT invent stats, follower counts, video titles, prices, or claims not present in the input.
- Keep aiMessage to at most 3 short sentences.`,
          },
          {
            role: "user",
            content: JSON.stringify(compactInput),
          },
        ],
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) return leads;
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const rawContent = data.choices?.[0]?.message?.content;
    if (!rawContent) return leads;

    const parsed = JSON.parse(rawContent) as {
      items?: Array<{ id: string; whyThisLead?: string; aiMessage?: string }>;
    };
    const byId = new Map((parsed.items ?? []).map((i) => [i.id, i]));

    return leads.map((lead) => {
      const enriched = byId.get(lead.id);
      if (!enriched) return lead;
      return {
        ...lead,
        whyThisLead: enriched.whyThisLead?.trim() || lead.whyThisLead,
        aiMessage: enriched.aiMessage?.trim() || lead.aiMessage,
      };
    });
  } catch {
    return leads;
  }
}
