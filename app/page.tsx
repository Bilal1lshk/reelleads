"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  ExternalLink,
  Globe,
  Instagram,
  Mail,
  MessageCircle,
  Repeat,
} from "lucide-react";
import {
  getOverview,
  getPendingLeads,
  updateLead,
  type OverviewData,
  type OverviewTopLead,
} from "@/lib/api";
import {
  formatRelativeTime,
  parseLeadDisplayName,
} from "@/lib/lead-display";
import { FEATURE_AUTOPILOT, FEATURE_REVIEW_BEFORE_SAVE } from "@/lib/config";
import { useLeadsStore } from "@/lib/store";
import {
  buildExternalUrl,
  buildInstagramUrl,
  buildWhatsAppUrl,
  cn,
  LEAD_STATUS_LABELS,
  PLATFORM_LABELS,
  STATUS_DOT_COLORS,
} from "@/lib/utils";
import type { LeadFilters } from "@/types/lead";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScoreBadge } from "@/components/score-badge";
import { LeadDetailDrawer } from "@/components/lead-detail-drawer";
import { useToast } from "@/components/providers";

function formatDelta(
  delta: number | null,
  suffix = "vs last week",
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
  const { workspaceId, openDrawer, applyFilters, openReviewModal } =
    useLeadsStore();

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

  const { data: pendingData } = useQuery({
    queryKey: ["pending-leads", workspaceId, "all"],
    queryFn: () => getPendingLeads(workspaceId),
    enabled: FEATURE_REVIEW_BEFORE_SAVE,
    staleTime: 15_000,
  });

  const pendingCount = pendingData?.total ?? 0;

  const refreshOverview = React.useCallback(async () => {
    const fresh = await getOverview(workspaceId, true);
    queryClient.setQueryData(["overview", workspaceId], fresh);
    queryClient.invalidateQueries({ queryKey: ["leads"] });
  }, [queryClient, workspaceId]);

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

    const totalSubLine =
      s && s.withContactInfo !== s.total
        ? `${s.withContactInfo} with contact info`
        : null;

    const repliedSubLine = s
      ? s.contacted > 0
        ? `${s.replyRate ?? 0}% of ${s.contacted} contacted`
        : "0 contacted"
      : null;

    return [
      {
        key: "total",
        label: "Total leads",
        rawValue: s?.total ?? 0,
        value: s ? String(s.total) : "0",
        subLine: totalSubLine,
        delta: formatDelta(d?.total ?? null),
        onClick: () => openFilteredLeads({}),
      },
      {
        key: "newThisWeek",
        label: "New this week",
        rawValue: s?.newThisWeek ?? 0,
        value: s ? String(s.newThisWeek) : "0",
        subLine: null,
        delta: formatDelta(d?.newThisWeek ?? null),
        onClick: () =>
          openFilteredLeads({ status: "new", dateFrom: sevenDaysAgoIso }),
      },
      {
        key: "contacted",
        label: "Contacted",
        rawValue: s?.contacted ?? 0,
        value: s ? String(s.contacted) : "0",
        subLine: null,
        delta: formatDelta(d?.contacted ?? null),
        onClick: () => openFilteredLeads({ status: "contacted" }),
      },
      {
        key: "replied",
        label: "Replied",
        rawValue: s?.replied ?? 0,
        value: s ? String(s.replied) : "0",
        subLine: repliedSubLine,
        delta: formatDelta(d?.replied ?? null),
        onClick: () => openFilteredLeads({ status: "replied" }),
      },
      {
        key: "won",
        label: "Won",
        rawValue: s?.won ?? 0,
        value: s ? String(s.won) : "0",
        subLine: null,
        delta: formatDelta(d?.won ?? null),
        onClick: () => openFilteredLeads({ status: "won" }),
      },
    ];
  }, [data, openFilteredLeads, sevenDaysAgoIso]);

  const pipeline = React.useMemo(() => data?.pipeline ?? [], [data?.pipeline]);
  const pipelineTotal = React.useMemo(
    () => pipeline.reduce((sum, p) => sum + p.count, 0),
    [pipeline]
  );

  const newCount = pipeline.find((p) => p.status === "new")?.count ?? 0;
  const contactedCount =
    pipeline.find((p) => p.status === "contacted")?.count ?? 0;
  const repliedCount = pipeline.find((p) => p.status === "replied")?.count ?? 0;
  const wonCount = pipeline.find((p) => p.status === "won")?.count ?? 0;

  const allLeadsAreNew =
    pipelineTotal > 0 && newCount === pipelineTotal;

  const pipelineInsight = React.useMemo(() => {
    if (pipelineTotal === 0) return null;
    if (contactedCount === 0 && newCount > 0) {
      return `${newCount} leads not contacted yet`;
    }
    if (repliedCount === 0 && contactedCount > 0) {
      return `${contactedCount} contacted, 0 replies yet`;
    }
    return `${repliedCount} replied · ${wonCount} won`;
  }, [pipelineTotal, contactedCount, newCount, repliedCount, wonCount]);

  const nextActions = React.useMemo(() => {
    const items: Array<{
      key: string;
      label: string;
      onClick: () => void;
    }> = [];

    if (pendingCount > 0) {
      items.push({
        key: "review-pending",
        label: `Review ${pendingCount} ${
          pendingCount === 1 ? "lead" : "leads"
        } from your last search`,
        onClick: () => openReviewModal(null),
      });
    }

    const highScoreNew = (data?.topNewLeads ?? []).filter(
      (l) => l.score >= 80
    );
    if (highScoreNew.length > 0) {
      const topN = Math.min(10, highScoreNew.length);
      items.push({
        key: "contact-top",
        label: `Contact your top ${topN} uncontacted ${
          topN === 1 ? "lead" : "leads"
        } (score 80+)`,
        onClick: () => openFilteredLeads({ status: "new", minScore: 80 }),
      });
    }

    const dueCount = data?.followUpsDueToday.length ?? 0;
    if (dueCount > 0) {
      items.push({
        key: "follow-ups-due",
        label: `${dueCount} ${
          dueCount === 1 ? "follow-up" : "follow-ups"
        } due today`,
        onClick: () => openDrawer(data!.followUpsDueToday[0].id),
      });
    }

    const s = data?.stats;
    if (s) {
      const missingContact = Math.max(0, s.total - s.withContactInfo);
      if (missingContact > 0) {
        items.push({
          key: "add-contact",
          label: `Add contact info to ${missingContact} ${
            missingContact === 1 ? "lead" : "leads"
          }`,
          onClick: () => openFilteredLeads({}),
        });
      }
      if (s.contacted > 0 && dueCount === 0) {
        items.push({
          key: "plan-follow-ups",
          label: `Plan follow-ups for ${s.contacted} contacted ${
            s.contacted === 1 ? "lead" : "leads"
          }`,
          onClick: () =>
            openFilteredLeads({ status: "contacted", missingFollowUp: true }),
        });
      }
    }

    return items.slice(0, 5);
  }, [data, openDrawer, openFilteredLeads, openReviewModal, pendingCount]);

  const maxSourceCount = React.useMemo(
    () => Math.max(1, ...(data?.sources ?? []).map((s) => s.count)),
    [data?.sources]
  );

  const visibleTopLeads = React.useMemo(
    () => (data?.topNewLeads ?? []).slice(0, 8),
    [data?.topNewLeads]
  );

  const visibleActivity = React.useMemo(
    () => (data?.recentActivity ?? []).slice(0, 8),
    [data?.recentActivity]
  );

  return (
    <div className="mx-auto min-w-0 max-w-[1280px] space-y-6">
      {/* 1. Header */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">
              Overview
            </h1>
            {FEATURE_AUTOPILOT &&
              !isLoading &&
              data?.autopilot &&
              data.autopilot.activeCount > 0 && (
                <Link
                  href="/autopilot"
                  className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-gray-300 dark:hover:bg-neutral-800"
                >
                  <Repeat className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" strokeWidth={1.5} />
                  <span>
                    Autopilot on · {data.autopilot.activeCount}{" "}
                    {data.autopilot.activeCount === 1 ? "search" : "searches"}
                  </span>
                </Link>
              )}
          </div>

          {isLoading ? (
            <Skeleton className="h-4 w-56" />
          ) : data?.lastSearch ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              <span>
                Last search {formatRelativeTime(data.lastSearch.createdAt)}
              </span>
              {pendingCount > 0 ? (
                <>
                  {" · "}
                  <span className="tabular-nums">
                    {data.lastSearch.insertedCount + pendingCount} found
                  </span>
                  {" · "}
                  <span className="tabular-nums">
                    {pendingCount} waiting for review
                  </span>{" "}
                  <Link
                    href="/review"
                    className="font-medium text-indigo-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 rounded dark:text-indigo-400"
                  >
                    Review
                  </Link>
                </>
              ) : (
                <>
                  {" · "}
                  <span className="tabular-nums">
                    {data.lastSearch.insertedCount} saved
                  </span>
                </>
              )}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {pendingCount > 0 && (
            <Link href="/review">
              <Button
                variant="ghost"
                className="min-h-[44px] sm:min-h-0 text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
              >
                Review ({pendingCount})
              </Button>
            </Link>
          )}
          <Link href="/search">
            <Button variant="secondary" className="min-h-[44px] sm:min-h-0">
              New search
            </Button>
          </Link>
          <Link href="/leads">
            <Button variant="default" className="min-h-[44px] sm:min-h-0">
              All leads
            </Button>
          </Link>
        </div>
      </header>

      {/* Error state */}
      {isError && (
        <div className="flex items-center justify-between rounded-[10px] border border-gray-200 bg-white px-5 py-3 text-sm text-gray-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-gray-300">
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

      {/* 3. Stats Row */}
      <section
        aria-label="Key metrics"
        className="grid grid-cols-2 divide-y divide-gray-200 overflow-hidden rounded-[10px] border border-gray-200 bg-white md:grid-cols-5 md:divide-x md:divide-y-0 dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-900"
      >
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-2 p-5">
                <Skeleton className="h-3.5 w-20" />
                <Skeleton className="h-7 w-14" />
                <Skeleton className="h-3 w-24" />
              </div>
            ))
          : statItems.map((item) => {
              const isZero = item.rawValue === 0;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={item.onClick}
                  className="flex min-h-[44px] flex-col items-start justify-start p-5 text-left transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-600 dark:hover:bg-neutral-800/60 cursor-pointer"
                >
                  <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
                    {item.label}
                  </span>
                  <span
                    className={cn(
                      "mt-1 text-[28px] leading-tight font-semibold tabular-nums",
                      isZero
                        ? "text-gray-400 dark:text-neutral-500"
                        : "text-gray-900 dark:text-gray-100"
                    )}
                  >
                    {item.value}
                  </span>
                  {item.subLine && (
                    <span className="mt-1 text-xs text-gray-500 tabular-nums dark:text-gray-400">
                      {item.subLine}
                    </span>
                  )}
                  {item.delta !== null && (
                    <span className="mt-0.5 text-xs text-gray-500 tabular-nums dark:text-gray-400">
                      {item.delta}
                    </span>
                  )}
                </button>
              );
            })}
      </section>

      {/* 4. Pipeline Snapshot */}
      <section
        aria-label="Pipeline snapshot"
        className="rounded-[10px] border border-gray-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900"
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Pipeline snapshot
          </h2>
          {!isLoading && pipelineInsight && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {pipelineInsight}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-2.5 w-full rounded-full" />
            <div className="grid grid-cols-3 gap-2 lg:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-5 w-24" />
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="flex h-2.5 w-full items-center gap-0.5 overflow-hidden rounded-full bg-gray-100 dark:bg-neutral-800">
              {pipeline.map((seg) => {
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
                      "h-full min-w-[6px] rounded-full transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 cursor-pointer",
                      STATUS_DOT_COLORS[seg.status]
                    )}
                  />
                );
              })}
            </div>

            {allLeadsAreNew && (
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                All leads are waiting for first contact
              </p>
            )}

            <div className="mt-4 grid grid-cols-3 gap-2 lg:grid-cols-6">
              {pipeline.map((seg) => {
                const pct =
                  pipelineTotal > 0
                    ? Math.round((seg.count / pipelineTotal) * 100)
                    : 0;
                const isZero = seg.count === 0;
                return (
                  <button
                    key={seg.status}
                    type="button"
                    onClick={() => openFilteredLeads({ status: seg.status })}
                    className={cn(
                      "flex min-h-[44px] sm:min-h-[32px] items-center justify-between gap-2 rounded-[8px] px-2 py-1 text-left text-xs transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 dark:hover:bg-neutral-800/60 cursor-pointer",
                      isZero && "opacity-50"
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-1.5 text-gray-600 dark:text-gray-300">
                      <span
                        aria-hidden="true"
                        className={cn(
                          "h-2 w-2 shrink-0 rounded-full",
                          STATUS_DOT_COLORS[seg.status]
                        )}
                      />
                      <span className="truncate">
                        {LEAD_STATUS_LABELS[seg.status]}
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums">
                      <span className="font-semibold text-gray-900 dark:text-gray-100">
                        {seg.count}
                      </span>{" "}
                      <span className="text-gray-400 dark:text-neutral-500">
                        {pct}%
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </section>

      {/* 5 & 6. Lower Grid: Do this next + Top new leads */}
      <div className="grid min-w-0 grid-cols-1 items-stretch gap-6 lg:grid-cols-2">
        {/* Left: Do this next */}
        <section
          aria-label="Do this next"
          className="flex min-w-0 flex-col rounded-[10px] border border-gray-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
        >
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3.5 dark:border-neutral-800">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Do this next
            </h2>
          </div>

          {isLoading ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : nextActions.length === 0 ? (
            <div className="flex flex-1 items-center p-5 text-sm text-gray-500 dark:text-gray-400">
              You&apos;re all caught up.
            </div>
          ) : (
            <ul className="divide-y divide-gray-200 dark:divide-neutral-800">
              {nextActions.map((item) => (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={item.onClick}
                    className="group flex min-h-[44px] w-full items-center justify-between gap-3 px-5 py-3 text-left text-sm transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-600 dark:hover:bg-neutral-800/50 cursor-pointer"
                  >
                    <span className="text-gray-900 dark:text-gray-100">
                      {item.label}
                    </span>
                    <ArrowRight
                      className="h-4 w-4 shrink-0 text-gray-400 transition-transform group-hover:translate-x-0.5 group-hover:text-indigo-600 dark:text-neutral-500 dark:group-hover:text-indigo-400"
                      strokeWidth={1.5}
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Right: Top new leads */}
        <section
          aria-label="Top new leads"
          className="flex min-w-0 flex-col rounded-[10px] border border-gray-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
        >
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3.5 dark:border-neutral-800">
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
            <div className="space-y-3 p-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3.5 w-full" />
                </div>
              ))}
            </div>
          ) : visibleTopLeads.length === 0 ? (
            <div className="flex flex-1 items-center p-5 text-sm text-gray-500 dark:text-gray-400">
              No new leads with contact info yet. Run a search.
            </div>
          ) : (
            <ul className="divide-y divide-gray-200 dark:divide-neutral-800">
              {visibleTopLeads.map((lead) => {
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
                    className="group px-5 py-3 text-sm transition-colors hover:bg-gray-50 dark:hover:bg-neutral-800/40"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => openDrawer(lead.id)}
                        className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 rounded cursor-pointer"
                      >
                        <p className="truncate font-semibold text-gray-900 dark:text-gray-100">
                          {displayName}
                        </p>
                        {postSnippet && (
                          <p className="truncate text-xs text-gray-400 dark:text-neutral-500">
                            {postSnippet}
                          </p>
                        )}
                        {lead.whyThisLead && (
                          <p className="mt-0.5 truncate text-xs text-gray-600 dark:text-gray-400">
                            {lead.whyThisLead}
                          </p>
                        )}
                      </button>

                      <div className="flex shrink-0 items-center gap-2.5">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {sourceLabel}
                        </span>
                        <ScoreBadge score={lead.score} />
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1">
                        {lead.email && (
                          <a
                            href={`mailto:${lead.email}`}
                            aria-label={`Email ${displayName}`}
                            title={lead.email}
                            className="inline-flex min-h-[44px] min-w-[44px] md:min-h-[28px] md:min-w-[28px] items-center justify-center rounded-[8px] text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 dark:text-gray-400 dark:hover:bg-neutral-800 dark:hover:text-gray-100"
                          >
                            <Mail className="h-4 w-4" strokeWidth={1.5} />
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
                            className="inline-flex min-h-[44px] min-w-[44px] md:min-h-[28px] md:min-w-[28px] items-center justify-center rounded-[8px] text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 dark:text-gray-400 dark:hover:bg-neutral-800 dark:hover:text-gray-100"
                          >
                            <MessageCircle className="h-4 w-4" strokeWidth={1.5} />
                          </a>
                        )}
                        {lead.instagram && (
                          <a
                            href={buildInstagramUrl(lead.instagram)}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Instagram for ${displayName}`}
                            title={lead.instagram}
                            className="inline-flex min-h-[44px] min-w-[44px] md:min-h-[28px] md:min-w-[28px] items-center justify-center rounded-[8px] text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 dark:text-gray-400 dark:hover:bg-neutral-800 dark:hover:text-gray-100"
                          >
                            <Instagram className="h-4 w-4" strokeWidth={1.5} />
                          </a>
                        )}
                        {lead.website && (
                          <a
                            href={buildExternalUrl(lead.website)}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Website for ${displayName}`}
                            title={lead.website}
                            className="inline-flex min-h-[44px] min-w-[44px] md:min-h-[28px] md:min-w-[28px] items-center justify-center rounded-[8px] text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 dark:text-gray-400 dark:hover:bg-neutral-800 dark:hover:text-gray-100"
                          >
                            <Globe className="h-4 w-4" strokeWidth={1.5} />
                          </a>
                        )}
                        {lead.sourceUrl && (
                          <a
                            href={buildExternalUrl(lead.sourceUrl)}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Source link for ${displayName}`}
                            title="Open source"
                            className="inline-flex min-h-[44px] min-w-[44px] md:min-h-[28px] md:min-w-[28px] items-center justify-center rounded-[8px] text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 dark:text-gray-400 dark:hover:bg-neutral-800 dark:hover:text-gray-100"
                          >
                            <ExternalLink className="h-4 w-4" strokeWidth={1.5} />
                          </a>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100 transition-opacity">
                        {lead.sourceUrl && (
                          <a
                            href={buildExternalUrl(lead.sourceUrl)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-[44px] sm:min-h-[28px] items-center rounded-[8px] border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-gray-200 dark:hover:bg-neutral-800"
                          >
                            Open source
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => handleCopyMessage(lead)}
                          className="inline-flex min-h-[44px] sm:min-h-[28px] items-center rounded-[8px] border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-gray-200 dark:hover:bg-neutral-800 cursor-pointer"
                        >
                          Copy message
                        </button>
                        <button
                          type="button"
                          disabled={markContactedMutation.isPending}
                          onClick={() => markContactedMutation.mutate(lead.id)}
                          className="inline-flex min-h-[44px] sm:min-h-[28px] items-center rounded-[8px] border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-gray-200 dark:hover:bg-neutral-800 cursor-pointer"
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

      {/* Bottom Row: Leads by source + Recent activity */}
      <div className="grid min-w-0 grid-cols-1 items-stretch gap-6 lg:grid-cols-2">
        {/* Leads by source */}
        <section
          aria-label="Leads by source"
          className="flex min-w-0 flex-col rounded-[10px] border border-gray-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
        >
          <div className="border-b border-gray-200 px-5 py-3.5 dark:border-neutral-800">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Leads by source
            </h2>
          </div>

          {isLoading ? (
            <div className="space-y-3 p-5">
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
                      className="flex min-h-[44px] sm:min-h-[36px] w-full items-center gap-3 px-5 py-2 text-left text-sm transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-600 dark:hover:bg-neutral-800/60 cursor-pointer"
                    >
                      <span className="w-24 shrink-0 truncate text-xs text-gray-600 dark:text-gray-300">
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
                      <span
                        className={cn(
                          "w-10 shrink-0 text-right text-xs font-semibold tabular-nums",
                          src.count === 0
                            ? "text-gray-400 dark:text-neutral-500"
                            : "text-gray-900 dark:text-gray-100"
                        )}
                      >
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
        <section
          aria-label="Recent activity"
          className="flex min-w-0 flex-col rounded-[10px] border border-gray-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
        >
          <div className="border-b border-gray-200 px-5 py-3.5 dark:border-neutral-800">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Recent activity
            </h2>
          </div>

          {isLoading ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-5 w-full" />
              ))}
            </div>
          ) : visibleActivity.length === 0 ? (
            <div className="flex flex-1 items-center p-5 text-sm text-gray-500 dark:text-gray-400">
              Activity will appear here.
            </div>
          ) : (
            <ul className="divide-y divide-gray-200 dark:divide-neutral-800">
              {visibleActivity.map((act) => (
                <li
                  key={act.id}
                  className="flex items-start justify-between gap-3 px-5 py-2.5 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    {act.leadId ? (
                      <button
                        type="button"
                        onClick={() => openDrawer(act.leadId!)}
                        className="block max-w-full truncate text-left font-semibold text-gray-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 rounded dark:text-gray-100 cursor-pointer"
                      >
                        {act.title}
                      </button>
                    ) : (
                      <p className="truncate font-semibold text-gray-900 dark:text-gray-100">
                        {act.title}
                      </p>
                    )}
                    {act.detail && (
                      <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                        {act.detail}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-gray-400 dark:text-neutral-500">
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
