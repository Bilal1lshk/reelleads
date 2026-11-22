import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const sendEmailSchema = z.object({
  to: z.string().trim().email("Valid recipient email is required"),
  subject: z.string().trim().min(1, "Subject is required").max(200),
  body: z.string().trim().min(1, "Email body is required").max(10000),
  fromName: z.string().trim().max(100).optional(),
  fromEmail: z.string().trim().email().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const parsed = sendEmailSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid email payload" },
        { status: 400 }
      );
    }

    const apiKey = process.env.RESEND_API_KEY?.trim();
    const defaultFrom = process.env.RESEND_FROM_EMAIL?.trim();
    const fromEmail = parsed.data.fromEmail || defaultFrom;

    if (!apiKey || !fromEmail) {
      return NextResponse.json(
        {
          configured: false,
          error:
            "Set RESEND_API_KEY and RESEND_FROM_EMAIL in .env for direct sending, or use Mailto Queue mode.",
        },
        { status: 400 }
      );
    }

    const from = parsed.data.fromName
      ? `${parsed.data.fromName} <${fromEmail}>`
      : fromEmail;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [parsed.data.to],
        subject: parsed.data.subject,
        text: parsed.data.body,
      }),
    });

    const data = (await res.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
      error?: string;
    };

    if (!res.ok) {
      return NextResponse.json(
        { error: data.message || data.error || `Email API failed (${res.status})` },
        { status: res.status }
      );
    }

    return NextResponse.json({ ok: true, id: data.id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send email" },
      { status: 500 }
    );
  }
}
