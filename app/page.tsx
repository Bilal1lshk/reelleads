"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ExternalLink,
  Globe,
  Instagram,
  Mail,
  MessageCircle,
} from "lucide-react";
import {
  getOverview,
  updateLead,
  type OverviewData,
  type OverviewPipelineItem,
  type OverviewTopLead,
} from "@/lib/api";
import {
  formatRelativeTime,
  formatShortDate,
  parseLeadDisplayName,
} from "@/lib/lead-display";
import { FEATURE_AUTOPILOT } from "@/lib/config";
import { useLeadsStore } from "@/lib/store";
import {
  buildExternalUrl,
  buildInstagramUrl,
  buildWhatsAppUrl,
  cn,
  LEAD_STATUS_LABELS,
  PLATFORM_LABELS,
} from "@/lib/utils";
import type { LeadFilters } from "@/types/lead";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScoreBadge } from "@/components/score-badge";
import { LeadDetailDrawer } from "@/components/lead-detail-drawer";
import { useToast } from "@/components/providers";

const PIPELINE_BAR_COLORS: Record<OverviewPipelineItem["status"], string> = {
  new: "bg-gray-300 dark:bg-neutral-600",
  contacted: "bg-gray-400 dark:bg-neutral-500",
  replied: "bg-gray-500 dark:bg-neutral-400",
  meeting_booked: "bg-gray-600 dark:bg-neutral-300",
  won: "bg-indigo-600 dark:bg-indigo-500",
  lost: "bg-gray-200 dark:bg-neutral-700",
};

function formatDelta(
  delta: number | null,
  suffix = "this week",
  isPercent = false
): string | null {
  if (delta === null) return null;
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta}${isPercent ? "%" : ""} ${suffix}`;
}

export default function OverviewPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const { workspaceId, openDrawer, applyFilters } = useLeadsStore();

  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery<OverviewData>({
    queryKey: ["overview", workspaceId],
    queryFn: () => getOverview(workspaceId),
    staleTime: 30_000,
  });

  const refreshOverview = React.useCallback(async () => {
    const fresh = await getOverview(workspaceId, true);
    queryClient.setQueryData(["overview", workspaceId], fresh);
    queryClient.invalidateQueries({ queryKey: ["leads"] });
  }, [queryClient, workspaceId]);

  const markFollowUpDoneMutation = useMutation({
    mutationFn: (id: string) => updateLead(id, { nextFollowUpAt: null }),
    onSuccess: async () => {
      notify("Follow-up marked done");
      await refreshOverview();
    },
    onError: (err) => {
      notify(
        err instanceof Error ? err.message : "Failed to update follow-up",
        "error"
      );
    },
  });

  const markContactedMutation = useMutation({
    mutationFn: (id: string) =>
      updateLead(id, { status: "contacted", logContact: true }),
    onSuccess: async () => {
      notify("Marked as contacted");
      await refreshOverview();
    },
    onError: (err) => {
      notify(
        err instanceof Error ? err.message : "Failed to mark contacted",
        "error"
      );
    },
  });

  const openFilteredLeads = React.useCallback(
    (partial: Partial<LeadFilters>) => {
      applyFilters({
        qualityOnly: false,
        showLowScore: true,
        ...partial,
      });
      router.push("/leads");
    },
    [applyFilters, router]
  );

  const handleCopyMessage = async (lead: OverviewTopLead) => {
    const text = lead.aiMessage?.trim();
    if (!text) {
      notify("No message available to copy", "error");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      notify("Outreach message copied");
    } catch {
      notify("Could not copy message", "error");
    }
  };

  const sevenDaysAgoIso = React.useMemo(
    () => new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    []
  );

  const statItems = React.useMemo(() => {
    const s = data?.stats;
    const d = data?.deltas;
    return [
      {
        key: "total",
        label: "Total",
        value: s ? String(s.total) : "0",
        delta: formatDelta(d?.total ?? null),
        onClick: () => openFilteredLeads({}),
      },
      {
        key: "newThisWeek",
        label: "New this week",
        value: s ? String(s.newThisWeek) : "0",
        delta: formatDelta(d?.newThisWeek ?? null),
        onClick: () =>
          openFilteredLeads({ status: "new", dateFrom: sevenDaysAgoIso }),
      },
      {
        key: "contacted",
        label: "Contacted",
        value: s ? String(s.contacted) : "0",
        delta: formatDelta(d?.contacted ?? null),
        onClick: () => openFilteredLeads({ status: "contacted" }),
      },
      {
        key: "replied",
        label: "Replied",
        value: s ? String(s.replied) : "0",
        delta: formatDelta(d?.replied ?? null),
        onClick: () => openFilteredLeads({ status: "replied" }),
      },
      {
        key: "won",
        label: "Won",
        value: s ? String(s.won) : "0",
        delta: formatDelta(d?.won ?? null),
        onClick: () => openFilteredLeads({ status: "won" }),
      },
      {
        key: "withContactInfo",
        label: "With contact info",
        value: s ? String(s.withContactInfo) : "0",
        delta: formatDelta(d?.withContactInfo ?? null),
        onClick: () => openFilteredLeads({ hasContact: true }),
      },
      {
        key: "replyRate",
        label: "Reply rate",
        value:
          s && s.contacted > 0 && s.replyRate !== null
            ? `${s.replyRate}%`
            : "-",
        delta: formatDelta(d?.replyRate ?? null, "this week", true),
        onClick: () => openFilteredLeads({ status: "replied" }),
      },
    ];
  }, [data, openFilteredLeads, sevenDaysAgoIso]);

  const pipelineTotal = React.useMemo(
    () => (data?.pipeline ?? []).reduce((sum, p) => sum + p.count, 0),
    [data?.pipeline]
  );

  const maxSourceCount = React.useMemo(
    () => Math.max(1, ...(data?.sources ?? []).map((s) => s.count)),
    [data?.sources]
  );

  return (
    <div className="min-w-0 space-y-5">
      {/* 6. Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight text-gray-900 dark:text-gray-100">
            Overview
          </h1>
          {isLoading ? (
            <Skeleton className="mt-1 h-4 w-48" />
          ) : (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {data?.lastSearch
                ? `Last search: ${formatRelativeTime(data.lastSearch.createdAt)} · ${data.lastSearch.insertedCount} leads added`
                : "No searches run yet"}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link href="/search">
            <Button variant="outline" size="sm" className="min-h-[44px] sm:min-h-[32px]">
              New search
            </Button>
          </Link>
          <Link href="/leads">
            <Button size="sm" className="min-h-[44px] sm:min-h-[32px]">
              All leads
            </Button>
          </Link>
        </div>
      </div>

      {FEATURE_AUTOPILOT &&
        !isLoading &&
        data?.autopilot &&
        data.autopilot.activeCount > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm dark:border-neutral-800 dark:bg-neutral-900">
            <span className="text-gray-700 dark:text-gray-200">
              Autopilot:{" "}
              <span className="font-semibold tabular-nums">
                {data.autopilot.freshTodayCount}
              </span>{" "}
              new leads today
            </span>
            <button
              type="button"
              onClick={() => openFilteredLeads({ freshToday: true })}
              className="text-xs font-medium text-indigo-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 rounded px-1 dark:text-indigo-400 cursor-pointer"
            >
              View fresh today
            </button>
          </div>
        )}

      {/* 7. Error state */}
      {isError && (
        <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-gray-300">
          <span>Could not load overview data.</span>
          <button
            type="button"
            onClick={() => refetch()}
            className="text-sm font-medium text-indigo-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 rounded px-1 dark:text-indigo-400 cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* 1. Stats Bar */}
      <section
        aria-label="Key metrics"
        className="grid grid-cols-2 gap-2 rounded-lg border border-gray-200 bg-white p-3 lg:grid-cols-7 dark:border-neutral-800 dark:bg-neutral-900"
      >
        {isLoading
          ? Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="space-y-1.5 px-2 py-1.5">
                <Skeleton className="h-3.5 w-20" />
                <Skeleton className="h-6 w-12" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))
          : statItems.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={item.onClick}
                className="flex min-h-[44px] flex-col items-start justify-center rounded-md px-2 py-1.5 text-left transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 dark:hover:bg-neutral-800/60 cursor-pointer"
              >
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {item.label}
                </span>
                <span className="mt-0.5 text-lg font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                  {item.value}
                </span>
                {item.delta !== null && (
                  <span className="text-[11px] tabular-nums text-gray-500 dark:text-gray-400">
                    {item.delta}
                  </span>
                )}
              </button>
            ))}
      </section>

      {/* 2. Pipeline Snapshot */}
      <section
        aria-label="Pipeline snapshot"
        className="rounded-lg border border-gray-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Pipeline snapshot
          </h2>
          {!isLoading && (
            <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">
              {pipelineTotal} in pipeline
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-2 w-full rounded-full" />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-5 w-24" />
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-neutral-800">
              {(data?.pipeline ?? []).map((seg) => {
                if (seg.count === 0 || pipelineTotal === 0) return null;
                const pct = (seg.count / pipelineTotal) * 100;
                return (
                  <button
                    key={seg.status}
                    type="button"
                    aria-label={`${LEAD_STATUS_LABELS[seg.status]}: ${seg.count}`}
                    title={`${LEAD_STATUS_LABELS[seg.status]}: ${seg.count}`}
                    style={{ width: `${pct}%` }}
                    onClick={() => openFilteredLeads({ status: seg.status })}
                    className={cn(
                      "h-full transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 cursor-pointer",
                      PIPELINE_BAR_COLORS[seg.status]
                    )}
                  />
                );
              })}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-6">
              {(data?.pipeline ?? []).map((seg) => (
                <button
                  key={seg.status}
                  type="button"
                  onClick={() => openFilteredLeads({ status: seg.status })}
                  className="flex min-h-[44px] sm:min-h-[28px] items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left text-xs hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 dark:hover:bg-neutral-800/60 cursor-pointer"
                >
                  <span className="flex items-center gap-1.5 truncate text-gray-600 dark:text-gray-300">
                    <span
                      aria-hidden="true"
                      className={cn(
                        "h-2 w-2 shrink-0 rounded-full",
                        PIPELINE_BAR_COLORS[seg.status]
                      )}
                    />
                    <span className="truncate">
                      {LEAD_STATUS_LABELS[seg.status]}
                    </span>
                  </span>
                  <span className="font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                    {seg.count}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      {/* 3 & 4. Follow-ups due today + Top new leads */}
      <div className="grid min-w-0 gap-6 min-[1025px]:grid-cols-2 items-start">
        {/* 3. Follow-ups due today */}
        <section className="min-w-0 rounded-lg border border-gray-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-neutral-800">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Follow-ups due today
            </h2>
            {!isLoading && (
              <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">
                {data?.followUpsDueToday.length ?? 0}
              </span>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-2.5 p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (data?.followUpsDueToday.length ?? 0) === 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <span className="text-gray-500 dark:text-gray-400">
                No follow-ups due today
              </span>
              <button
                type="button"
                onClick={() =>
                  openFilteredLeads({
                    status: "contacted",
                    missingFollowUp: true,
                  })
                }
                className="min-h-[44px] sm:min-h-0 text-xs font-medium text-indigo-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 rounded px-1 dark:text-indigo-400 cursor-pointer"
              >
                Plan follow-ups for contacted leads
              </button>
            </div>
          ) : (
            <ul className="divide-y divide-gray-200 dark:divide-neutral-800">
              {data!.followUpsDueToday.map((item) => {
                const dateText = item.lastContactedAt
                  ? `Last contacted ${formatShortDate(item.lastContactedAt)}`
                  : `Due ${formatShortDate(item.nextFollowUpAt)}`;

                return (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-gray-900 dark:text-gray-100">
                        {item.name}
                      </p>
                      <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                        <span>
                          {item.sourcePlatform
                            ? PLATFORM_LABELS[item.sourcePlatform]
                            : "Source"}
                        </span>
                        {" · "}
                        <span
                          className={cn(
                            item.isOverdue &&
                              "font-medium text-red-600 dark:text-red-400"
                          )}
                        >
                          {dateText}
                        </span>
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openDrawer(item.id)}
                        className="min-h-[44px] min-w-[44px] sm:min-h-[28px] sm:min-w-0 px-2.5 text-xs"
                      >
                        Open
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={markFollowUpDoneMutation.isPending}
                        onClick={() => markFollowUpDoneMutation.mutate(item.id)}
                        className="min-h-[44px] min-w-[44px] sm:min-h-[28px] sm:min-w-0 px-2.5 text-xs"
                      >
                        Mark done
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* 4. Top new leads */}
        <section className="min-w-0 rounded-lg border border-gray-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-neutral-800">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Top new leads
            </h2>
            <Link
              href="/leads"
              className="text-xs font-medium text-indigo-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 rounded px-1 dark:text-indigo-400"
            >
              View table
            </Link>
          </div>

          {isLoading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3.5 w-full" />
                </div>
              ))}
            </div>
          ) : (data?.topNewLeads.length ?? 0) === 0 ? (
            <p className="p-4 text-sm text-gray-500 dark:text-gray-400">
              No new leads with contact info yet. Run a search.
            </p>
          ) : (
            <ul className="divide-y divide-gray-200 dark:divide-neutral-800">
              {data!.topNewLeads.map((lead) => {
                const { displayName, postSnippet } = parseLeadDisplayName(
                  lead.name,
                  lead.sourceSnippet
                );
                const sourceLabel = lead.sourcePlatform
                  ? PLATFORM_LABELS[lead.sourcePlatform]
                  : "Source";

                return (
                  <li
                    key={lead.id}
                    className="group px-4 py-3 text-sm transition-colors hover:bg-gray-50 dark:hover:bg-neutral-800/40"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => openDrawer(lead.id)}
                        className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 rounded cursor-pointer"
                      >
                        <p className="truncate font-medium text-gray-900 dark:text-gray-100">
                          {displayName}
                        </p>
                        {postSnippet && (
                          <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                            Post: {postSnippet}
                          </p>
                        )}
                        {lead.whyThisLead && (
                          <p className="mt-0.5 truncate text-xs text-gray-600 dark:text-gray-300">
                            {lead.whyThisLead}
                          </p>
                        )}
                      </button>

                      <div className="flex shrink-0 items-center gap-2">
                        <span className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[11px] font-medium text-gray-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-gray-300">
                          {sourceLabel}
                        </span>
                        <span className="hidden sm:inline text-xs text-gray-500 dark:text-gray-400">
                          {lead.country}
                        </span>
                        <ScoreBadge score={lead.score} />
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      {/* Clickable contact icons */}
                      <div className="flex items-center gap-1">
                        {lead.email && (
                          <a
                            href={`mailto:${lead.email}`}
                            aria-label={`Email ${displayName}`}
                            title={lead.email}
                            className="inline-flex min-h-[44px] min-w-[44px] md:min-h-[28px] md:min-w-[28px] items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 dark:text-gray-400 dark:hover:bg-neutral-800 dark:hover:text-gray-100"
                          >
                            <Mail className="h-3.5 w-3.5" />
                          </a>
                        )}
                        {lead.whatsapp && (
                          <a
                            href={buildWhatsAppUrl(
                              lead.whatsapp,
                              lead.aiMessage || ""
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`WhatsApp ${displayName}`}
                            title={lead.whatsapp}
                            className="inline-flex min-h-[44px] min-w-[44px] md:min-h-[28px] md:min-w-[28px] items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 dark:text-gray-400 dark:hover:bg-neutral-800 dark:hover:text-gray-100"
                          >
                            <MessageCircle className="h-3.5 w-3.5" />
                          </a>
                        )}
                        {lead.instagram && (
                          <a
                            href={buildInstagramUrl(lead.instagram)}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Instagram for ${displayName}`}
                            title={lead.instagram}
                            className="inline-flex min-h-[44px] min-w-[44px] md:min-h-[28px] md:min-w-[28px] items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 dark:text-gray-400 dark:hover:bg-neutral-800 dark:hover:text-gray-100"
                          >
                            <Instagram className="h-3.5 w-3.5" />
                          </a>
                        )}
                        {lead.website && (
                          <a
                            href={buildExternalUrl(lead.website)}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Website for ${displayName}`}
                            title={lead.website}
                            className="inline-flex min-h-[44px] min-w-[44px] md:min-h-[28px] md:min-w-[28px] items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 dark:text-gray-400 dark:hover:bg-neutral-800 dark:hover:text-gray-100"
                          >
                            <Globe className="h-3.5 w-3.5" />
                          </a>
                        )}
                        {lead.sourceUrl && (
                          <a
                            href={buildExternalUrl(lead.sourceUrl)}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Profile or source link for ${displayName}`}
                            title="Profile / source link"
                            className="inline-flex min-h-[44px] min-w-[44px] md:min-h-[28px] md:min-w-[28px] items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 dark:text-gray-400 dark:hover:bg-neutral-800 dark:hover:text-gray-100"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>

                      {/* Row actions on hover (always visible on mobile) */}
                      <div className="flex flex-wrap items-center gap-1.5 opacity-100 min-[1025px]:opacity-0 min-[1025px]:group-hover:opacity-100 min-[1025px]:group-focus-within:opacity-100 transition-opacity">
                        {lead.sourceUrl && (
                          <a
                            href={buildExternalUrl(lead.sourceUrl)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-[44px] sm:min-h-[28px] items-center rounded-md border border-gray-200 bg-white px-2 text-xs font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-gray-200 dark:hover:bg-neutral-800"
                          >
                            Open source
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => handleCopyMessage(lead)}
                          className="inline-flex min-h-[44px] sm:min-h-[28px] items-center rounded-md border border-gray-200 bg-white px-2 text-xs font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-gray-200 dark:hover:bg-neutral-800 cursor-pointer"
                        >
                          Copy message
                        </button>
                        <button
                          type="button"
                          disabled={markContactedMutation.isPending}
                          onClick={() => markContactedMutation.mutate(lead.id)}
                          className="inline-flex min-h-[44px] sm:min-h-[28px] items-center rounded-md border border-gray-200 bg-white px-2 text-xs font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-gray-200 dark:hover:bg-neutral-800 cursor-pointer"
                        >
                          Mark contacted
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {/* 5. Sources and Activity */}
      <div className="grid min-w-0 gap-6 min-[1025px]:grid-cols-2">
        {/* Leads by source */}
        <section className="min-w-0 rounded-lg border border-gray-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
          <div className="border-b border-gray-200 px-4 py-3 dark:border-neutral-800">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Leads by source
            </h2>
          </div>

          {isLoading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-5 w-full" />
              ))}
            </div>
          ) : (
            <ul className="divide-y divide-gray-200 dark:divide-neutral-800">
              {(data?.sources ?? []).map((src) => {
                const widthPct =
                  src.count > 0
                    ? Math.max(4, Math.round((src.count / maxSourceCount) * 100))
                    : 0;
                return (
                  <li key={src.platform}>
                    <button
                      type="button"
                      onClick={() =>
                        openFilteredLeads({ platform: src.platform })
                      }
                      className="flex min-h-[44px] sm:min-h-[36px] w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 dark:hover:bg-neutral-800/60 cursor-pointer"
                    >
                      <span className="w-24 shrink-0 truncate text-xs font-medium text-gray-700 dark:text-gray-300">
                        {src.label}
                      </span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-neutral-800">
                        {widthPct > 0 && (
                          <div
                            className="h-full rounded-full bg-gray-400 dark:bg-neutral-500"
                            style={{ width: `${widthPct}%` }}
                          />
                        )}
                      </div>
                      <span className="w-10 shrink-0 text-right text-xs font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                        {src.count}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Recent activity */}
        <section className="min-w-0 rounded-lg border border-gray-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
          <div className="border-b border-gray-200 px-4 py-3 dark:border-neutral-800">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Recent activity
            </h2>
          </div>

          {isLoading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-5 w-full" />
              ))}
            </div>
          ) : (data?.recentActivity.length ?? 0) === 0 ? (
            <p className="p-4 text-sm text-gray-500 dark:text-gray-400">
              Activity will appear here.
            </p>
          ) : (
            <ul className="divide-y divide-gray-200 dark:divide-neutral-800">
              {data!.recentActivity.map((act) => (
                <li
                  key={act.id}
                  className="flex items-start justify-between gap-3 px-4 py-2.5 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    {act.leadId ? (
                      <button
                        type="button"
                        onClick={() => openDrawer(act.leadId!)}
                        className="truncate text-left font-medium text-gray-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 rounded dark:text-gray-100 cursor-pointer block max-w-full"
                      >
                        {act.title}
                      </button>
                    ) : (
                      <p className="truncate font-medium text-gray-900 dark:text-gray-100">
                        {act.title}
                      </p>
                    )}
                    {act.detail && (
                      <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                        {act.detail}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-gray-500 dark:text-gray-400">
                    {formatRelativeTime(act.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <LeadDetailDrawer />
    </div>
  );
}
