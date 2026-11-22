import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSmtpPublicStatus, sendSmtpMail } from "@/lib/autopilot/digest";
import { getWorkspaceSettingsCollection, isMongoConfigured } from "@/lib/mongodb";

const saveSmtpSchema = z.object({
  workspaceId: z.string().trim().max(60).default("default"),
  host: z.string().trim().min(1, "SMTP host is required").max(200),
  port: z.number().int().min(1).max(65535).default(587),
  secure: z.boolean().default(false),
  user: z.string().trim().min(1, "SMTP username is required").max(200),
  pass: z.string().min(1, "SMTP password is required").max(400),
  fromEmail: z.string().trim().email("Valid From email is required"),
  fromName: z.string().trim().max(100).optional(),
});

const testSmtpSchema = z.object({
  workspaceId: z.string().trim().max(60).default("default"),
  to: z.string().trim().email("Valid test recipient email is required"),
});

export async function GET(req: NextRequest) {
  const workspaceId =
    req.nextUrl.searchParams.get("workspaceId")?.trim() || "default";
  const status = await getSmtpPublicStatus(workspaceId);
  return NextResponse.json(status);
}

export async function POST(req: NextRequest) {
  if (!isMongoConfigured()) {
    return NextResponse.json(
      { error: "Database not configured" },
      { status: 503 }
    );
  }

  try {
    const raw = await req.json();
    const parsed = saveSmtpSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid SMTP settings" },
        { status: 400 }
      );
    }

    const col = await getWorkspaceSettingsCollection();
    const nowIso = new Date().toISOString();
    await col.updateOne(
      { workspaceId: parsed.data.workspaceId },
      {
        $set: {
          ...parsed.data,
          updatedAt: nowIso,
        },
      },
      { upsert: true }
    );

    const status = await getSmtpPublicStatus(parsed.data.workspaceId);
    return NextResponse.json(status);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save SMTP" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const raw = await req.json();
    const parsed = testSmtpSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid test email" },
        { status: 400 }
      );
    }

    const res = await sendSmtpMail({
      workspaceId: parsed.data.workspaceId,
      to: parsed.data.to,
      subject: "NicheLeads SMTP test digest",
      text: "Your NicheLeads SMTP settings are working. Morning Autopilot digests will be sent to this address.",
    });

    if (!res.ok) {
      return NextResponse.json(
        {
          error:
            res.reason === "no_smtp"
              ? "SMTP is not configured yet. Save your SMTP settings first."
              : res.error || "Failed to send test email",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send test email" },
      { status: 500 }
    );
  }
}
