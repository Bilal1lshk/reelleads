"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Mail,
  Pause,
  Play,
  RotateCcw,
} from "lucide-react";
import { getHealthStatus, getLeads, updateLead } from "@/lib/api";
import { getClientProfile } from "@/lib/config";
import { useLeadsStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { Lead, LeadStatus } from "@/types/lead";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ScoreBadge } from "@/components/score-badge";
import { useToast } from "@/components/providers";

type SendMode = "api" | "mailto";
type RowSendStatus = "queued" | "sending" | "sent" | "failed";

function renderTemplate(template: string, lead: Lead, senderName: string): string {
  return template
    .replace(/\{\{\s*name\s*\}\}/gi, lead.name || "there")
    .replace(/\{\{\s*niche\s*\}\}/gi, lead.niche || "content")
    .replace(/\{\{\s*city\s*\}\}/gi, lead.city || "")
    .replace(/\{\{\s*country\s*\}\}/gi, lead.country || "")
    .replace(/\{\{\s*sender\s*\}\}/gi, senderName)
    .replace(/\{\{\s*aiMessage\s*\}\}/gi, lead.aiMessage || "");
}

export default function CampaignsPage() {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const { workspaceId } = useLeadsStore();
  const profile = React.useMemo(() => getClientProfile(workspaceId), [workspaceId]);

  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: getHealthStatus,
    staleTime: 60_000,
  });

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["leads", "campaigns", workspaceId],
    queryFn: () =>
      getLeads({
        workspaceId,
        hasEmail: true,
        sortBy: "score",
        sortDir: "desc",
        showLowScore: true,
        pageSize: 200,
      }),
  });

  const apiConfigured = Boolean(health?.connectors?.email_sending);

  const [mode, setMode] = React.useState<SendMode>("mailto");
  const [statusFilter, setStatusFilter] = React.useState<LeadStatus | "all">("new");
  const [minScore, setMinScore] = React.useState<number>(0);
  const [delaySeconds, setDelaySeconds] = React.useState<1 | 3 | 5>(3);

  const [subject, setSubject] = React.useState(
    "Quick idea for {{name}}'s {{niche}} videos"
  );
  const [useAiPitch, setUseAiPitch] = React.useState(true);
  const [bodyTemplate, setBodyTemplate] = React.useState(
    "Hi {{name}},\n\n{{aiMessage}}"
  );

  const [excludedIds, setExcludedIds] = React.useState<Set<string>>(new Set());
  const [rowStatus, setRowStatus] = React.useState<Record<string, RowSendStatus>>({});
  const [rowError, setRowError] = React.useState<Record<string, string>>({});
  const [previewId, setPreviewId] = React.useState<string | null>(null);

  const [running, setRunning] = React.useState(false);
  const pauseRef = React.useRef(false);

  // Switch default mode to API automatically if Resend is configured
  React.useEffect(() => {
    if (apiConfigured) {
      setMode("api");
    }
  }, [apiConfigured]);

  const filteredRecipients = React.useMemo(() => {
    return leads.filter((l) => {
      if (!l.email?.trim()) return false;
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
      if (l.score < minScore) return false;
      return true;
    });
  }, [leads, statusFilter, minScore]);

  const selectedRecipients = React.useMemo(
    () => filteredRecipients.filter((l) => !excludedIds.has(l.id)),
    [filteredRecipients, excludedIds]
  );

  const previewLead = React.useMemo(
    () =>
      filteredRecipients.find((l) => l.id === previewId) ||
      selectedRecipients[0] ||
      filteredRecipients[0] ||
      null,
    [filteredRecipients, selectedRecipients, previewId]
  );

  const stats = React.useMemo(() => {
    let sent = 0;
    let failed = 0;
    let queued = 0;
    for (const lead of selectedRecipients) {
      const st = rowStatus[lead.id] || "queued";
      if (st === "sent") sent++;
      else if (st === "failed") failed++;
      else queued++;
    }
    return { sent, failed, queued, total: selectedRecipients.length };
  }, [selectedRecipients, rowStatus]);

  const getComposedEmail = React.useCallback(
    (lead: Lead) => {
      const renderedSubject = renderTemplate(subject, lead, profile.name).trim();
      const rawBody = useAiPitch
        ? lead.aiMessage?.trim() || renderTemplate(bodyTemplate, lead, profile.name)
        : renderTemplate(bodyTemplate, lead, profile.name);
      return { subject: renderedSubject, body: rawBody };
    },
    [subject, bodyTemplate, useAiPitch, profile.name]
  );

  const markLeadContacted = async (lead: Lead) => {
    try {
      await updateLead(lead.id, {
        status: lead.status === "new" ? "contacted" : lead.status,
        logContact: true,
      });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    } catch {
      // Keep campaign runner moving even if status update fails
    }
  };

  const handleToggleRecipient = (id: string) => {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleAll = () => {
    if (excludedIds.size === 0) {
      setExcludedIds(new Set(filteredRecipients.map((l) => l.id)));
    } else {
      setExcludedIds(new Set());
    }
  };

  const handleResetRunner = () => {
    pauseRef.current = true;
    setRunning(false);
    setRowStatus({});
    setRowError({});
  };

  const handleStartApiCampaign = async () => {
    if (selectedRecipients.length === 0) return;
    if (!subject.trim()) {
      notify("Enter an email subject first.", "error");
      return;
    }

    pauseRef.current = false;
    setRunning(true);

    for (const lead of selectedRecipients) {
      if (pauseRef.current) break;
      const current = rowStatus[lead.id];
      if (current === "sent") continue;

      setRowStatus((prev) => ({ ...prev, [lead.id]: "sending" }));
      const composed = getComposedEmail(lead);

      try {
        const res = await fetch("/api/campaigns/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: lead.email,
            subject: composed.subject,
            body: composed.body,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          throw new Error(data.error || `HTTP ${res.status}`);
        }

        setRowStatus((prev) => ({ ...prev, [lead.id]: "sent" }));
        await markLeadContacted(lead);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Send failed";
        setRowStatus((prev) => ({ ...prev, [lead.id]: "failed" }));
        setRowError((prev) => ({ ...prev, [lead.id]: msg }));
        if (msg.includes("RESEND_API_KEY")) {
          notify(msg, "error");
          break;
        }
      }

      if (!pauseRef.current) {
        await new Promise((r) => setTimeout(r, delaySeconds * 1000));
      }
    }

    setRunning(false);
  };

  const nextQueuedLead = React.useMemo(
    () =>
      selectedRecipients.find(
        (l) => (rowStatus[l.id] || "queued") === "queued"
      ) || null,
    [selectedRecipients, rowStatus]
  );

  const handleSendNextMailto = async () => {
    if (!nextQueuedLead || !nextQueuedLead.email) return;
    const composed = getComposedEmail(nextQueuedLead);
    const mailtoUrl = `mailto:${encodeURIComponent(
      nextQueuedLead.email
    )}?subject=${encodeURIComponent(composed.subject)}&body=${encodeURIComponent(
      composed.body
    )}`;
    window.open(mailtoUrl, "_blank", "noopener,noreferrer");
    setRowStatus((prev) => ({ ...prev, [nextQueuedLead.id]: "sent" }));
    await markLeadContacted(nextQueuedLead);
    notify(`Opened email for ${nextQueuedLead.name} & marked contacted`);
  };

  const handleCopyAndMarkSent = async () => {
    if (!nextQueuedLead) return;
    const composed = getComposedEmail(nextQueuedLead);
    const text = `To: ${nextQueuedLead.email}\nSubject: ${composed.subject}\n\n${composed.body}`;
    await navigator.clipboard.writeText(text);
    setRowStatus((prev) => ({ ...prev, [nextQueuedLead.id]: "sent" }));
    await markLeadContacted(nextQueuedLead);
    notify(`Copied email for ${nextQueuedLead.name} & marked contacted`);
  };

  const insertToken = (token: string) => {
    setSubject((prev) => `${prev}${prev.endsWith(" ") || !prev ? "" : " "}${token}`);
  };

  const progressPct =
    stats.total > 0
      ? Math.round(((stats.sent + stats.failed) / stats.total) * 100)
      : 0;

  return (
    <div className="mx-auto max-w-5xl space-y-5 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-gray-900 dark:text-gray-100">
            Email Campaigns
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Send personalized outreach to leads with verified email addresses and auto-log them as contacted.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[8px] border px-2.5 py-1.5 font-medium",
              "border-gray-200 bg-white text-gray-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-gray-300"
            )}
          >
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                apiConfigured ? "bg-emerald-500" : "bg-gray-300 dark:bg-neutral-600"
              )}
            />
            {apiConfigured ? "Resend API Ready" : "Mailto Queue Mode"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left column: Composer */}
        <div className="space-y-4 rounded-[8px] border border-gray-200 bg-white p-5 lg:col-span-5 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="space-y-2">
            <span className="block text-xs font-medium text-gray-500 dark:text-gray-400">
              Delivery mode
            </span>
            <SegmentedControl
              ariaLabel="Delivery mode"
              value={mode}
              onChange={setMode}
              disabled={running}
              options={[
                { value: "mailto", label: "Mailto Queue" },
                { value: "api", label: "Auto Send (API)" },
              ]}
            />
            {mode === "api" && !apiConfigured && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Add RESEND_API_KEY and RESEND_FROM_EMAIL in .env for direct sending, or switch to Mailto Queue.
              </p>
            )}
          </div>

          {/* Audience filter */}
          <div className="grid grid-cols-2 gap-3 border-t border-gray-100 pt-4 dark:border-neutral-800">
            <div className="space-y-1.5">
              <label
                htmlFor="camp-status"
                className="block text-xs font-medium text-gray-500 dark:text-gray-400"
              >
                Lead status
              </label>
              <Select
                id="camp-status"
                value={statusFilter}
                disabled={running}
                onChange={(e) =>
                  setStatusFilter(e.target.value as LeadStatus | "all")
                }
              >
                <option value="new">New only</option>
                <option value="all">All with email</option>
                <option value="contacted">Contacted</option>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="camp-score"
                className="block text-xs font-medium text-gray-500 dark:text-gray-400"
              >
                Min score
              </label>
              <Select
                id="camp-score"
                value={String(minScore)}
                disabled={running}
                onChange={(e) => setMinScore(Number(e.target.value))}
              >
                <option value="0">Any score</option>
                <option value="50">50+</option>
                <option value="70">70+ (High fit)</option>
              </Select>
            </div>
          </div>

          {/* Subject */}
          <div className="space-y-1.5 border-t border-gray-100 pt-4 dark:border-neutral-800">
            <div className="flex items-center justify-between">
              <label
                htmlFor="camp-subject"
                className="block text-xs font-medium text-gray-500 dark:text-gray-400"
              >
                Subject line
              </label>
              <div className="flex items-center gap-1.5 text-[11px]">
                {["{{name}}", "{{niche}}", "{{city}}"].map((tok) => (
                  <button
                    key={tok}
                    type="button"
                    disabled={running}
                    onClick={() => insertToken(tok)}
                    className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-gray-600 hover:bg-gray-100 dark:border-neutral-800 dark:bg-neutral-950 dark:text-gray-300 cursor-pointer"
                  >
                    {tok}
                  </button>
                ))}
              </div>
            </div>
            <Input
              id="camp-subject"
              value={subject}
              disabled={running}
              onChange={(e) => setSubject(e.target.value)}
              className="h-9 rounded-[8px] border-gray-200 text-sm"
            />
          </div>

          {/* Body / AI Pitch toggle */}
          <div className="space-y-2 border-t border-gray-100 pt-4 dark:border-neutral-800">
            <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={useAiPitch}
                disabled={running}
                onChange={(e) => setUseAiPitch(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-gray-300 accent-indigo-600"
              />
              Use each lead&apos;s personalized AI pitch
            </label>

            {!useAiPitch && (
              <Textarea
                rows={5}
                value={bodyTemplate}
                disabled={running}
                onChange={(e) => setBodyTemplate(e.target.value)}
                placeholder="Write your email template using {{name}}, {{niche}}, {{aiMessage}}, {{sender}}..."
                className="text-xs"
              />
            )}
          </div>

          {mode === "api" && (
            <div className="space-y-1.5 border-t border-gray-100 pt-4 dark:border-neutral-800">
              <span className="block text-xs font-medium text-gray-500 dark:text-gray-400">
                Delay between sends
              </span>
              <SegmentedControl
                ariaLabel="Delay between sends"
                value={delaySeconds}
                onChange={setDelaySeconds}
                disabled={running}
                options={[
                  { value: 1, label: "1s" },
                  { value: 3, label: "3s" },
                  { value: 5, label: "5s" },
                ]}
              />
            </div>
          )}
        </div>

        {/* Right column: Queue & Preview */}
        <div className="space-y-4 lg:col-span-7">
          {/* Runner control bar */}
          <div className="rounded-[8px] border border-gray-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {stats.total} recipients selected
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Sent: {stats.sent} · Failed: {stats.failed} · Remaining: {stats.queued}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {(stats.sent > 0 || stats.failed > 0) && (
                  <button
                    type="button"
                    onClick={handleResetRunner}
                    className="inline-flex h-9 items-center gap-1.5 rounded-[8px] border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-neutral-800 dark:bg-neutral-950 dark:text-gray-200 cursor-pointer"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reset
                  </button>
                )}

                {mode === "api" ? (
                  running ? (
                    <button
                      type="button"
                      onClick={() => {
                        pauseRef.current = true;
                        setRunning(false);
                      }}
                      className="inline-flex h-9 items-center gap-1.5 rounded-[8px] border border-gray-200 bg-white px-3.5 text-xs font-medium text-gray-900 hover:bg-gray-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-gray-100 cursor-pointer"
                    >
                      <Pause className="h-3.5 w-3.5" />
                      Pause
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={stats.queued === 0 || !apiConfigured}
                      onClick={handleStartApiCampaign}
                      className="inline-flex h-9 items-center gap-1.5 rounded-[8px] bg-gray-900 px-4 text-xs font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 cursor-pointer"
                    >
                      <Play className="h-3.5 w-3.5" />
                      Start campaign
                    </button>
                  )
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={!nextQueuedLead}
                      onClick={handleCopyAndMarkSent}
                      className="inline-flex h-9 items-center gap-1.5 rounded-[8px] border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-800 dark:bg-neutral-950 dark:text-gray-200 cursor-pointer"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Copy next
                    </button>
                    <button
                      type="button"
                      disabled={!nextQueuedLead}
                      onClick={handleSendNextMailto}
                      className="inline-flex h-9 items-center gap-1.5 rounded-[8px] bg-gray-900 px-4 text-xs font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 cursor-pointer"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Open next email
                    </button>
                  </>
                )}
              </div>
            </div>

            {stats.total > 0 && (stats.sent > 0 || stats.failed > 0 || running) && (
              <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-neutral-800">
                <div
                  className="h-full rounded-full bg-indigo-600 transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            )}
          </div>

          {/* Recipient list */}
          <div className="overflow-hidden rounded-[8px] border border-gray-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2.5 text-xs dark:border-neutral-800">
              <span className="font-medium text-gray-700 dark:text-gray-300">
                Recipients ({filteredRecipients.length})
              </span>
              {filteredRecipients.length > 0 && (
                <button
                  type="button"
                  disabled={running}
                  onClick={handleToggleAll}
                  className="text-indigo-600 hover:underline disabled:opacity-50 dark:text-indigo-400 cursor-pointer"
                >
                  {excludedIds.size === 0 ? "Deselect all" : "Select all"}
                </button>
              )}
            </div>

            {isLoading ? (
              <div className="p-6 text-center text-xs text-gray-500">
                Loading leads with email...
              </div>
            ) : filteredRecipients.length === 0 ? (
              <div className="p-6 text-center text-xs text-gray-500 dark:text-gray-400">
                No leads with an email address match this filter.{" "}
                <Link href="/search" className="text-indigo-600 hover:underline">
                  Find more leads
                </Link>
                .
              </div>
            ) : (
              <div className="max-h-[280px] divide-y divide-gray-100 overflow-y-auto dark:divide-neutral-800">
                {filteredRecipients.map((lead) => {
                  const included = !excludedIds.has(lead.id);
                  const st = rowStatus[lead.id] || "queued";
                  const err = rowError[lead.id];
                  const isPreviewed = previewLead?.id === lead.id;

                  return (
                    <div
                      key={lead.id}
                      onClick={() => setPreviewId(lead.id)}
                      className={cn(
                        "flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-xs transition-colors",
                        isPreviewed
                          ? "bg-gray-50 dark:bg-neutral-800/60"
                          : "hover:bg-gray-50/70 dark:hover:bg-neutral-800/30"
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={included}
                          disabled={running}
                          onChange={(e) => {
                            e.stopPropagation();
                            handleToggleRecipient(lead.id);
                          }}
                          aria-label={`Include ${lead.name}`}
                          className="h-3.5 w-3.5 rounded border-gray-300 accent-indigo-600"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-medium text-gray-900 dark:text-gray-100">
                              {lead.name}
                            </span>
                            <ScoreBadge score={lead.score} />
                          </div>
                          <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">
                            {lead.email}
                          </p>
                          {err && (
                            <p className="truncate text-[11px] text-red-600 dark:text-red-400">
                              {err}
                            </p>
                          )}
                        </div>
                      </div>

                      <span
                        className={cn(
                          "inline-flex shrink-0 items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium",
                          !included
                            ? "bg-gray-100 text-gray-400 dark:bg-neutral-800 dark:text-neutral-500"
                            : st === "sent"
                            ? "bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400"
                            : st === "failed"
                            ? "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400"
                            : st === "sending"
                            ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-400"
                            : "bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-gray-300"
                        )}
                      >
                        {st === "sending" && (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        )}
                        {st === "sent" && <Check className="h-3 w-3" />}
                        {!included ? "Skipped" : st.charAt(0).toUpperCase() + st.slice(1)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Live Email Preview */}
          {previewLead && (
            <div className="rounded-[8px] border border-gray-200 bg-white p-4 text-xs dark:border-neutral-800 dark:bg-neutral-900">
              <div className="mb-2 flex items-center justify-between border-b border-gray-100 pb-2 dark:border-neutral-800">
                <span className="flex items-center gap-1.5 font-medium text-gray-700 dark:text-gray-300">
                  <Mail className="h-3.5 w-3.5 text-gray-400" />
                  Preview for {previewLead.name}
                </span>
                <span className="text-[11px] text-gray-400">
                  {previewLead.email}
                </span>
              </div>
              {(() => {
                const composed = getComposedEmail(previewLead);
                return (
                  <div className="space-y-2">
                    <p className="font-medium text-gray-900 dark:text-gray-100">
                      Subject: {composed.subject}
                    </p>
                    <p className="whitespace-pre-wrap text-gray-600 dark:text-gray-300">
                      {composed.body}
                    </p>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
