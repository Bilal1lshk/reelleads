"use client";

import * as React from "react";
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
  discardPendingLeads,
  getPendingLeads,
  savePendingLeads,
} from "@/lib/api";
import { useLeadsStore } from "@/lib/store";
import {
  buildExternalUrl,
  buildInstagramUrl,
  buildWhatsAppUrl,
  cn,
  PLATFORM_LABELS,
} from "@/lib/utils";
import type { PendingLead } from "@/types/lead";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScoreBadge } from "@/components/score-badge";
import { useToast } from "@/components/providers";

const VIRTUALIZE_THRESHOLD = 100;
const ROW_HEIGHT = 86;
const VIEWPORT_HEIGHT = 360;

export interface PendingReviewListProps {
  searchRunId?: string | null;
  mode: "modal" | "page";
  onClose?: () => void;
  onStatsChange?: (stats: {
    total: number;
    newCount: number;
    duplicateCount: number;
    perSource: Array<{ platform: string; label: string; kept: number }>;
  }) => void;
}

function hasContactInfo(item: PendingLead): boolean {
  const l = item.lead;
  return Boolean(
    l.email?.trim() ||
      l.whatsapp?.trim() ||
      l.instagram?.trim() ||
      l.website?.trim()
  );
}

export function PendingReviewList({
  searchRunId,
  mode,
  onClose,
  onStatsChange,
}: PendingReviewListProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const { workspaceId, applyFilters } = useLeadsStore();

  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [score70Only, setScore70Only] = React.useState(false);
  const [contactOnly, setContactOnly] = React.useState(false);
  const [confirmDiscard, setConfirmDiscard] = React.useState(false);
  const [scrollTop, setScrollTop] = React.useState(0);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["pending-leads", workspaceId, searchRunId ?? "all"],
    queryFn: () => getPendingLeads(workspaceId, searchRunId),
  });

  const pendingLeads = React.useMemo(
    () => data?.pendingLeads ?? [],
    [data?.pendingLeads]
  );

  React.useEffect(() => {
    if (!data) return;
    onStatsChange?.({
      total: data.total,
      newCount: data.newCount,
      duplicateCount: data.duplicateCount,
      perSource: data.perSource,
    });
  }, [data, onStatsChange]);

  // Default selection: all non-duplicate leads checked, duplicates unchecked
  React.useEffect(() => {
    if (pendingLeads.length === 0) {
      setSelectedIds(new Set());
      return;
    }
    const next = new Set<string>();
    for (const item of pendingLeads) {
      if (!item.duplicateOfId) {
        next.add(item.id);
      }
    }
    setSelectedIds(next);
  }, [pendingLeads]);

  const filteredLeads = React.useMemo(() => {
    return pendingLeads.filter((item) => {
      if (score70Only && (item.lead.score ?? 0) < 70) return false;
      if (contactOnly && !hasContactInfo(item)) return false;
      return true;
    });
  }, [contactOnly, pendingLeads, score70Only]);

  const saveMutation = useMutation({
    mutationFn: (ids: string[]) =>
      savePendingLeads({ ids, searchRunId, workspaceId }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["pending-leads"] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
      onClose?.();
      notify(`Saved ${res.savedCount} leads to CRM`, "success", {
        label: "View leads",
        onClick: () => {
          applyFilters({
            freshToday: true,
            qualityOnly: false,
            showLowScore: true,
          });
          router.push("/leads");
        },
      });
    },
    onError: (err) => {
      notify(
        err instanceof Error ? err.message : "Failed to save leads",
        "error"
      );
    },
  });

  const discardMutation = useMutation({
    mutationFn: () =>
      discardPendingLeads({ ids: "all", searchRunId, workspaceId }),
    onSuccess: (res) => {
      setConfirmDiscard(false);
      queryClient.invalidateQueries({ queryKey: ["pending-leads"] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
      onClose?.();
      notify(`Discarded ${res.discardedCount} leads`);
    },
    onError: (err) => {
      notify(
        err instanceof Error ? err.message : "Failed to discard leads",
        "error"
      );
    },
  });

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(filteredLeads.map((l) => l.id)));
  };

  const selectNone = () => {
    setSelectedIds(new Set());
  };

  const selectedCount = React.useMemo(() => {
    const visibleSet = new Set(pendingLeads.map((l) => l.id));
    let count = 0;
    for (const id of selectedIds) {
      if (visibleSet.has(id)) count += 1;
    }
    return count;
  }, [pendingLeads, selectedIds]);

  const isVirtualized =
    mode === "modal" && filteredLeads.length > VIRTUALIZE_THRESHOLD;
  const startIndex = isVirtualized
    ? Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 3)
    : 0;
  const endIndex = isVirtualized
    ? Math.min(
        filteredLeads.length,
        Math.ceil((scrollTop + VIEWPORT_HEIGHT) / ROW_HEIGHT) + 3
      )
    : filteredLeads.length;
  const visibleSlice = filteredLeads.slice(startIndex, endIndex);

  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-4 w-4 rounded" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-between p-4 text-sm text-gray-700 dark:text-gray-300">
        <span>Could not load pending leads.</span>
        <button
          type="button"
          onClick={() => refetch()}
          className="text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400 cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  if (pendingLeads.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">
        No pending leads to review.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Controls above list */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-2.5 text-xs dark:border-neutral-800">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={selectAll}
            className="min-h-[44px] sm:min-h-0 font-medium text-indigo-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 rounded px-1 dark:text-indigo-400 cursor-pointer"
          >
            Select all
          </button>
          <button
            type="button"
            onClick={selectNone}
            className="min-h-[44px] sm:min-h-0 font-medium text-gray-600 hover:text-gray-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 rounded px-1 dark:text-gray-400 dark:hover:text-gray-200 cursor-pointer"
          >
            Select none
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-gray-700 dark:text-gray-300">
          <label className="inline-flex min-h-[44px] sm:min-h-0 items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={score70Only}
              onChange={(e) => setScore70Only(e.target.checked)}
              className="h-3.5 w-3.5 accent-indigo-600"
            />
            Score 70+
          </label>
          <label className="inline-flex min-h-[44px] sm:min-h-0 items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={contactOnly}
              onChange={(e) => setContactOnly(e.target.checked)}
              className="h-3.5 w-3.5 accent-indigo-600"
            />
            Has contact info
          </label>
        </div>
      </div>

      {/* Lead list */}
      <div
        onScroll={
          isVirtualized
            ? (e) => setScrollTop(e.currentTarget.scrollTop)
            : undefined
        }
        className={cn(
          "divide-y divide-gray-200 dark:divide-neutral-800",
          mode === "modal" && "hover-thin-scrollbar max-h-[360px] flex-1 overflow-y-auto"
        )}
      >
        {filteredLeads.length === 0 ? (
          <p className="p-6 text-center text-xs text-gray-500 dark:text-gray-400">
            No pending leads match the current filters.
          </p>
        ) : (
          <div
            style={
              isVirtualized
                ? {
                    height: filteredLeads.length * ROW_HEIGHT,
                    position: "relative",
                  }
                : undefined
            }
          >
            <div
              style={
                isVirtualized
                  ? {
                      transform: `translateY(${startIndex * ROW_HEIGHT}px)`,
                    }
                  : undefined
              }
              className="divide-y divide-gray-200 dark:divide-neutral-800"
            >
              {visibleSlice.map((item) => {
                const lead = item.lead;
                const isDup = Boolean(item.duplicateOfId);
                const checked = selectedIds.has(item.id);
                const sourceLabel = lead.sourcePlatform
                  ? PLATFORM_LABELS[lead.sourcePlatform] || lead.sourcePlatform
                  : "Web";

                return (
                  <div
                    key={item.id}
                    className={cn(
                      "flex items-start gap-3 px-4 py-2.5 text-xs transition-colors",
                      isDup
                        ? "bg-gray-50/70 opacity-60 dark:bg-neutral-950/50"
                        : "hover:bg-gray-50/70 dark:hover:bg-neutral-800/30"
                    )}
                  >
                    <label className="flex min-h-[44px] min-w-[44px] sm:min-h-[24px] sm:min-w-[24px] items-center justify-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        aria-label={`Select ${lead.name}`}
                        onChange={() => toggleOne(item.id)}
                        className="h-4 w-4 accent-indigo-600 cursor-pointer"
                      />
                    </label>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <span className="truncate font-medium text-sm text-gray-900 dark:text-gray-100">
                            {lead.name}
                          </span>
                          {isDup && (
                            <span className="rounded border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-gray-300">
                              Already in CRM
                            </span>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="text-[11px] text-gray-500 dark:text-gray-400">
                            {sourceLabel}
                          </span>
                          <span className="hidden sm:inline text-[11px] text-gray-500 dark:text-gray-400">
                            {lead.country}
                          </span>
                          <ScoreBadge score={lead.score} />
                        </div>
                      </div>

                      {lead.whyThisLead && (
                        <p className="truncate text-gray-600 dark:text-gray-300">
                          {lead.whyThisLead}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                          {lead.email && (
                            <a
                              href={`mailto:${lead.email}`}
                              aria-label={`Email ${lead.name}`}
                              title={lead.email}
                              className="hover:text-gray-900 dark:hover:text-gray-100"
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
                              rel="noreferrer"
                              aria-label={`WhatsApp ${lead.name}`}
                              title={lead.whatsapp}
                              className="hover:text-gray-900 dark:hover:text-gray-100"
                            >
                              <MessageCircle className="h-3.5 w-3.5" />
                            </a>
                          )}
                          {lead.instagram && (
                            <a
                              href={buildInstagramUrl(lead.instagram)}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={`Instagram ${lead.name}`}
                              title={lead.instagram}
                              className="hover:text-gray-900 dark:hover:text-gray-100"
                            >
                              <Instagram className="h-3.5 w-3.5" />
                            </a>
                          )}
                          {lead.website && (
                            <a
                              href={buildExternalUrl(lead.website)}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={`Website ${lead.name}`}
                              title={lead.website}
                              className="hover:text-gray-900 dark:hover:text-gray-100"
                            >
                              <Globe className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>

                        {lead.sourceUrl && (
                          <a
                            href={buildExternalUrl(lead.sourceUrl)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                          >
                            Open source
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Expiry note + Footer */}
      <div className="border-t border-gray-200 px-4 py-3 space-y-2.5 dark:border-neutral-800">
        <p className="text-[11px] text-gray-500 dark:text-gray-400">
          Unreviewed leads are deleted after 7 days.
        </p>

        {confirmDiscard ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-red-200 bg-red-50/70 px-3 py-2 text-xs dark:border-red-900/50 dark:bg-red-950/30">
            <span className="text-red-700 dark:text-red-300">
              Discard {pendingLeads.length} leads? This can&apos;t be undone.
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setConfirmDiscard(false)}
                className="min-h-[44px] sm:min-h-[28px]"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={discardMutation.isPending}
                onClick={() => discardMutation.mutate()}
                className="min-h-[44px] sm:min-h-[28px]"
              >
                {discardMutation.isPending ? "Discarding..." : "Confirm discard"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                disabled={selectedCount === 0 || saveMutation.isPending}
                onClick={() => saveMutation.mutate(Array.from(selectedIds))}
                className="min-h-[44px] sm:min-h-[32px]"
              >
                {saveMutation.isPending
                  ? "Saving..."
                  : `Save ${selectedCount} to CRM`}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={discardMutation.isPending}
                onClick={() => setConfirmDiscard(true)}
                className="min-h-[44px] sm:min-h-[32px]"
              >
                Discard all
              </Button>
            </div>

            {mode === "modal" && onClose && (
              <button
                type="button"
                onClick={onClose}
                className="min-h-[44px] sm:min-h-0 text-xs font-medium text-gray-500 hover:text-gray-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 rounded px-1 dark:text-gray-400 dark:hover:text-gray-200 cursor-pointer"
              >
                Review later
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
