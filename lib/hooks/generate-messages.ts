import { extractLeadHookContext } from "@/lib/hooks/extract-context";
import { APP_CONFIG, getClientProfile } from "@/lib/config";
import { stripPersonalNames } from "@/lib/utils";
import type { Lead, LeadHookContext, LeadMessages } from "@/types/lead";

const PLACEHOLDER_RE = /\[(?:your\s+)?name\]|\[company\]|\[channel\]|\{\{[^}]+\}\}/i;
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const CLAIM_NUMBER_RE = /\b(\d+(?:\.\d+)?)\s*(?:%|x\b|percent|views|subscribers|clients|years)/gi;

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function buildFallbackMessages(
  lead: Partial<Lead>,
  tone?: string
): LeadMessages {
  const base =
    stripPersonalNames(lead.aiMessage)?.trim() ||
    `Hi${lead.name ? ` ${lead.name}` : ""}, I'm a freelance video editor specializing in short-form and YouTube editing. Are you currently looking for editing support?`;

  const shortDm = base.length <= 280 ? base : `${base.slice(0, 277).trim()}...`;

  return {
    shortDm,
    email: {
      subject: `Video editing for ${lead.name || "your content"}`,
      body: `${base}\n\nBest,\nVideo Editor`,
    },
    loomScript: [
      `1. Quick intro for ${lead.name || "you"} — I'm a freelance video editor.`,
      `2. ${base}`,
      "3. I focus on clean pacing, retention-focused cuts, and fast turnaround.",
      "4. Happy to edit a quick sample clip so you can judge the fit.",
      "5. Open to a quick chat this week?",
    ].join("\n"),
    followUp: `Following up on my note above — happy to share a quick sample edit if you're still looking for video editing help. Worth a quick look?`,
    generatedAt: new Date().toISOString(),
    tone,
  };
}

function validateGeneratedMessages(
  msgs: LeadMessages,
  allowedContextText: string
): string | null {
  const allText = [
    msgs.shortDm || "",
    msgs.email?.subject || "",
    msgs.email?.body || "",
    msgs.loomScript || "",
    msgs.followUp || "",
  ].join("\n");

  if (PLACEHOLDER_RE.test(allText)) {
    return "Contains placeholder text";
  }
  if (EMOJI_RE.test(allText)) {
    return "Contains emoji";
  }
  if ((msgs.shortDm || "").length > 280) {
    return "Short DM exceeds 280 characters";
  }
  if (wordCount(msgs.email?.body || "") > 110) {
    return "Email body exceeds 110 words";
  }
  if (wordCount(msgs.followUp || "") > 40) {
    return "Follow-up exceeds 40 words";
  }

  // Reject ungrounded numeric claims (e.g., "2x retention", "300% growth", "50k views")
  const contextNumbers = new Set(
    Array.from(allowedContextText.matchAll(/\d+(?:\.\d+)?/g)).map((m) => m[0])
  );
  for (const match of allText.matchAll(CLAIM_NUMBER_RE)) {
    const num = match[1];
    if (num && !contextNumbers.has(num)) {
      return `Ungrounded numeric claim: ${match[0]}`;
    }
  }

  return null;
}

async function callGroqForMessages(
  lead: Partial<Lead>,
  context: LeadHookContext,
  tone: string,
  offer: string,
  retryReason?: string
): Promise<LeadMessages | null> {
  const apiKey = process.env.Groq_API_KEY || process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  const systemPrompt = `You write outreach messages for a freelance video editor (sign off as "Video Editor", offer: ${offer}).
Return strict JSON matching:
{
  "shortDm": "string (max 280 chars)",
  "email": { "subject": "string", "body": "string (max 110 words)" },
  "loomScript": "string (5 short lines for a 30-45s Loom)",
  "followUp": "string (max 40 words)"
}
STRICT RULES:
1. Use ONLY facts present in the provided JSON context.
2. When sourceType is not "generic", quote or reference the lead's real requirement or content in the FIRST sentence.
3. NEVER invent statistics, view counts, retention claims (e.g. "2x"), prices, or past clients.
4. No ungrounded flattery and NO emojis.
5. No placeholders like [Name], [Your Name], or [Company].
6. End with one clear, low-pressure question.
7. Tone: ${tone}.${retryReason ? `\nPREVIOUS ATTEMPT REJECTED (${retryReason}). Fix it strictly.` : ""}`;

  const userPayload = {
    name: lead.name || "",
    type: lead.type || "",
    platform: lead.sourcePlatform || "",
    niche: lead.niche || APP_CONFIG.niche,
    sourceType: context.sourceType,
    basedOn: context.basedOn,
    requirements: context.requirements || [],
    country: lead.country || "",
    city: lead.city || "",
  };

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/gpt-oss-20b",
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(userPayload) },
      ],
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) return null;

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) return null;

  const parsed = JSON.parse(raw) as Partial<LeadMessages>;
  return {
    shortDm: typeof parsed.shortDm === "string" ? parsed.shortDm.trim() : "",
    email:
      parsed.email &&
      typeof parsed.email.subject === "string" &&
      typeof parsed.email.body === "string"
        ? {
            subject: parsed.email.subject.trim(),
            body: parsed.email.body.trim(),
          }
        : undefined,
    loomScript:
      typeof parsed.loomScript === "string" ? parsed.loomScript.trim() : "",
    followUp:
      typeof parsed.followUp === "string" ? parsed.followUp.trim() : "",
    generatedAt: new Date().toISOString(),
    tone,
  };
}

export async function generateHookMessagesForLead(
  lead: Partial<Lead>,
  options?: { tone?: string; workspaceId?: string }
): Promise<{ hookContext: LeadHookContext; messages: LeadMessages }> {
  const hookContext = extractLeadHookContext(lead);
  const tone = options?.tone?.trim() || "Direct & helpful";
  const profile = getClientProfile(options?.workspaceId);
  const offer = profile.offer;

  const allowedContextText = [
    lead.name,
    lead.niche,
    lead.rawText,
    lead.sourceSnippet,
    lead.hiringSignal,
    lead.budgetSignal,
    hookContext.basedOn,
    ...(hookContext.requirements || []),
  ]
    .filter(Boolean)
    .join(" ");

  try {
    let attempt = await callGroqForMessages(lead, hookContext, tone, offer);
    if (attempt) {
      const err = validateGeneratedMessages(attempt, allowedContextText);
      if (!err) {
        return { hookContext, messages: attempt };
      }
      // Retry once on validation failure
      attempt = await callGroqForMessages(lead, hookContext, tone, offer, err);
      if (attempt && !validateGeneratedMessages(attempt, allowedContextText)) {
        return { hookContext, messages: attempt };
      }
    }
  } catch {
    // Timeout or network error -> fall back safely
  }

  return {
    hookContext,
    messages: buildFallbackMessages(lead, tone),
  };
}
