import nodemailer from "nodemailer";
import { getWorkspaceSettingsCollection, isMongoConfigured } from "@/lib/mongodb";
import { PLATFORM_LABELS } from "@/lib/utils";
import type { Lead } from "@/types/lead";

export interface ResolvedSmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromEmail: string;
  fromName?: string;
  source: "database" | "env";
}

export interface SmtpPublicStatus {
  configured: boolean;
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  fromEmail?: string;
  fromName?: string;
  source: "database" | "env" | "none";
}

export async function resolveSmtpConfig(
  workspaceId = "default"
): Promise<ResolvedSmtpConfig | null> {
  if (isMongoConfigured()) {
    try {
      const col = await getWorkspaceSettingsCollection();
      const doc = await col.findOne(
        { workspaceId },
        { projection: { _id: 0 } }
      );
      if (doc?.host && doc?.user && doc?.pass && doc?.fromEmail) {
        return {
          host: doc.host,
          port: doc.port || 587,
          secure: Boolean(doc.secure),
          user: doc.user,
          pass: doc.pass,
          fromEmail: doc.fromEmail,
          fromName: doc.fromName,
          source: "database",
        };
      }
    } catch {
      // fall through to env
    }
  }

  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const fromEmail =
    process.env.SMTP_FROM?.trim() || process.env.DIGEST_FROM_EMAIL?.trim();
  if (host && user && pass && fromEmail) {
    const port = Number(process.env.SMTP_PORT || 587);
    return {
      host,
      port: Number.isFinite(port) ? port : 587,
      secure: process.env.SMTP_SECURE === "true" || port === 465,
      user,
      pass,
      fromEmail,
      fromName: "NicheLeads",
      source: "env",
    };
  }

  return null;
}

export async function getSmtpPublicStatus(
  workspaceId = "default"
): Promise<SmtpPublicStatus> {
  const cfg = await resolveSmtpConfig(workspaceId);
  if (!cfg) {
    return { configured: false, source: "none" };
  }
  return {
    configured: true,
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    user: cfg.user,
    fromEmail: cfg.fromEmail,
    fromName: cfg.fromName,
    source: cfg.source,
  };
}

export async function sendSmtpMail(options: {
  workspaceId?: string;
  to: string;
  subject: string;
  text: string;
}): Promise<{ ok: true } | { ok: false; reason: "no_smtp" | "error"; error?: string }> {
  const cfg = await resolveSmtpConfig(options.workspaceId || "default");
  if (!cfg) {
    // Optional Resend fallback if someone configured RESEND_API_KEY
    const resendKey = process.env.RESEND_API_KEY?.trim();
    const resendFrom = process.env.DIGEST_FROM_EMAIL?.trim();
    if (resendKey && resendFrom) {
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: resendFrom,
            to: [options.to],
            subject: options.subject,
            text: options.text,
          }),
        });
        if (res.ok) return { ok: true };
        const errBody = (await res.json().catch(() => ({}))) as { message?: string };
        return {
          ok: false,
          reason: "error",
          error: errBody.message || `Resend failed (${res.status})`,
        };
      } catch (err) {
        return {
          ok: false,
          reason: "error",
          error: err instanceof Error ? err.message : "Resend request failed",
        };
      }
    }
    return { ok: false, reason: "no_smtp" };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: {
        user: cfg.user,
        pass: cfg.pass,
      },
    });

    const from = cfg.fromName
      ? `${cfg.fromName} <${cfg.fromEmail}>`
      : cfg.fromEmail;

    await transporter.sendMail({
      from,
      to: options.to,
      subject: options.subject,
      text: options.text,
    });

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason: "error",
      error: err instanceof Error ? err.message : "SMTP send failed",
    };
  }
}

export async function sendAutopilotDigestEmail(params: {
  workspaceId: string;
  to?: string;
  searchName: string;
  newLeads: Lead[];
  baseUrl?: string;
}): Promise<{
  status: "sent" | "skipped_zero" | "skipped_no_smtp" | "failed";
  error?: string;
}> {
  if (!params.to?.trim()) {
    return { status: "skipped_no_smtp", error: "No digest email configured" };
  }
  if (params.newLeads.length === 0) {
    return { status: "skipped_zero" };
  }

  const baseUrl = (
    params.baseUrl ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000"
  ).replace(/\/+$/, "");

  const top10 = [...params.newLeads]
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 10);

  const subject = `${params.newLeads.length} new leads found today`;

  const lines = top10.map((lead, idx) => {
    const sourceLabel = lead.sourcePlatform
      ? PLATFORM_LABELS[lead.sourcePlatform] || lead.sourcePlatform
      : "Web";
    const reason = lead.whyThisLead || "Matched target criteria";
    return `${idx + 1}. ${lead.name} (${sourceLabel} · Score ${lead.score})\n   ${reason}\n   Open: ${baseUrl}/leads`;
  });

  const text = [
    `Autopilot search "${params.searchName}" found ${params.newLeads.length} new leads.`,
    "",
    ...lines,
    "",
    `View all fresh leads today: ${baseUrl}/leads`,
  ].join("\n");

  const res = await sendSmtpMail({
    workspaceId: params.workspaceId,
    to: params.to.trim(),
    subject,
    text,
  });

  if (res.ok) return { status: "sent" };
  if (res.reason === "no_smtp") return { status: "skipped_no_smtp" };
  return { status: "failed", error: res.error };
}
