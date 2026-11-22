import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { FEATURE_HOOKS } from "@/lib/config";
import { generateHookMessagesForLead } from "@/lib/hooks/generate-messages";
import { getLeadsCollection, isMongoConfigured } from "@/lib/mongodb";
import type { LeadMessages } from "@/types/lead";

const postMessagesSchema = z.object({
  tone: z.string().trim().max(80).optional(),
  regenerate: z.boolean().optional(),
});

const patchMessagesSchema = z.object({
  shortDm: z.string().max(1000).optional(),
  email: z
    .object({
      subject: z.string().max(240),
      body: z.string().max(5000),
    })
    .optional(),
  loomScript: z.string().max(4000).optional(),
  followUp: z.string().max(1000).optional(),
  tone: z.string().max(80).optional(),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!FEATURE_HOOKS) {
    return NextResponse.json(
      { error: "Pitch hooks feature is disabled" },
      { status: 404 }
    );
  }

  const { id } = await context.params;
  if (!isMongoConfigured()) {
    return NextResponse.json(
      { error: "Database not configured" },
      { status: 503 }
    );
  }

  try {
    const raw = await req.json().catch(() => ({}));
    const parsed = postMessagesSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid request" },
        { status: 400 }
      );
    }

    const col = await getLeadsCollection();
    const lead = await col.findOne({ id }, { projection: { _id: 0 } });
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    if (
      !parsed.data.regenerate &&
      lead.messages?.shortDm &&
      lead.hookContext &&
      (!parsed.data.tone || lead.messages.tone === parsed.data.tone)
    ) {
      return NextResponse.json({
        hookContext: lead.hookContext,
        messages: lead.messages,
      });
    }

    const { hookContext, messages } = await generateHookMessagesForLead(lead, {
      tone: parsed.data.tone,
      workspaceId: lead.workspaceId,
    });

    await col.updateOne(
      { id },
      {
        $set: {
          hookContext,
          messages,
        },
      }
    );

    return NextResponse.json({ hookContext, messages });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to generate messages",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!FEATURE_HOOKS) {
    return NextResponse.json(
      { error: "Pitch hooks feature is disabled" },
      { status: 404 }
    );
  }

  const { id } = await context.params;
  if (!isMongoConfigured()) {
    return NextResponse.json(
      { error: "Database not configured" },
      { status: 503 }
    );
  }

  try {
    const raw = await req.json();
    const parsed = patchMessagesSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid payload" },
        { status: 400 }
      );
    }

    const col = await getLeadsCollection();
    const lead = await col.findOne({ id }, { projection: { _id: 0 } });
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const nextMessages: LeadMessages = {
      ...(lead.messages || { generatedAt: new Date().toISOString() }),
      ...parsed.data,
    };

    await col.updateOne({ id }, { $set: { messages: nextMessages } });
    return NextResponse.json({ messages: nextMessages });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save messages" },
      { status: 500 }
    );
  }
}
