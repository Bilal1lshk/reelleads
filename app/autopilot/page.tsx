"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Loader2, Play, Trash2 } from "lucide-react";
import {
  deleteSavedSearch,
  getSavedSearches,
  getSmtpStatus,
  runSavedSearchNow,
  updateSavedSearch,
} from "@/lib/api";
import { FEATURE_AUTOPILOT } from "@/lib/config";
import { formatRelativeTime } from "@/lib/lead-display";
import { useLeadsStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { AutopilotRun, SavedSearch } from "@/types/lead";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/providers";

export default function AutopilotPage() {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const { workspaceId } = useLeadsStore();

  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set());
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editDraft, setEditDraft] = React.useState<{
    name: string;
    schedule: "off" | "daily" | "weekly";
    runAtHour: string;
    minScore: string;
    digestEmail: string;
  }>({
    name: "",
    schedule: "daily",
    runAtHour: "7",
    minScore: "75",
    digestEmail: "",
  });
  const [runningId, setRunningId] = React.useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["saved-searches", workspaceId],
    queryFn: () => getSavedSearches(workspaceId),
    enabled: FEATURE_AUTOPILOT,
  });

  const { data: smtpStatus } = useQuery({
    queryKey: ["smtp-status", workspaceId],
    queryFn: () => getSmtpStatus(workspaceId),
    enabled: FEATURE_AUTOPILOT,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      updateSavedSearch(id, { active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-searches"] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
    },
    onError: (err) => {
      notify(
        err instanceof Error ? err.message : "Failed to update search",
        "error"
      );
    },
  });

  const saveEditMutation = useMutation({
    mutationFn: (id: string) =>
      updateSavedSearch(id, {
        name: editDraft.name.trim(),
        schedule: editDraft.schedule,
        runAtHour: Math.max(0, Math.min(23, Number(editDraft.runAtHour) || 7)),
        minScore: Math.max(0, Math.min(100, Number(editDraft.minScore) || 75)),
        digestEmail: editDraft.digestEmail.trim(),
      }),
    onSuccess: () => {
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ["saved-searches"] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
      notify("Saved search updated");
    },
    onError: (err) => {
      notify(
        err instanceof Error ? err.message : "Failed to update saved search",
        "error"
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteSavedSearch(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-searches"] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
      notify("Saved search deleted");
    },
    onError: (err) => {
      notify(
        err instanceof Error ? err.message : "Failed to delete saved search",
        "error"
      );
    },
  });

  const handleRunNow = async (id: string) => {
    setRunningId(id);
    try {
      const run = await runSavedSearchNow(id);
      queryClient.invalidateQueries({ queryKey: ["saved-searches"] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
      setExpandedIds((prev) => new Set(prev).add(id));
      notify(
        `Run finished: ${run.newLeadIds.length} new leads, ${run.duplicatesSkipped} duplicates skipped`
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : "Run failed", "error");
    } finally {
      setRunningId(null);
    }
  };

  if (!FEATURE_AUTOPILOT) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <h1 className="text-lg font-semibold">Autopilot</h1>
        <p className="text-sm text-gray-500">
          Autopilot recurring searches are currently disabled.
        </p>
      </div>
    );
  }

  const savedSearches = data?.savedSearches ?? [];
  const runsBySearchId = new Map<string, AutopilotRun[]>();
  for (const run of data?.runs ?? []) {
    const list = runsBySearchId.get(run.savedSearchId) ?? [];
    list.push(run);
    runsBySearchId.set(run.savedSearchId, list);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-gray-900 dark:text-gray-100">
            Autopilot
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Recurring searches that add qualified leads to your CRM and send
            morning SMTP digests.
          </p>
        </div>
        <Link href="/search">
          <Button size="sm" variant="outline" className="min-h-[44px] sm:min-h-[32px]">
            New search
          </Button>
        </Link>
      </div>

      {smtpStatus && !smtpStatus.configured && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-4 py-3 text-xs text-gray-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-gray-300">
          <span>Email digest off: configure SMTP in Settings</span>
          <Link
            href="/settings"
            className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
          >
            Open Settings
          </Link>
        </div>
      )}

      {isError && (
        <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-gray-300">
          <span>Could not load saved searches.</span>
          <button
            type="button"
            onClick={() => refetch()}
            className="text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400 cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
      ) : savedSearches.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-neutral-800 dark:bg-neutral-900 dark:text-gray-400">
          No saved searches yet. Run a search and click Save this search.
        </div>
      ) : (
        <ul className="space-y-4">
          {savedSearches.map((item: SavedSearch) => {
            const runs = runsBySearchId.get(item.id) ?? [];
            const lastRun = runs[0];
            const isExpanded = expandedIds.has(item.id);
            const isEditing = editingId === item.id;
            const isRunning = runningId === item.id;

            return (
              <li
                key={item.id}
                className="min-w-0 rounded-lg border border-gray-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 p-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {item.name}
                      </span>
                      <span className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[11px] font-medium capitalize text-gray-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-gray-300">
                        {item.schedule}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        Min score {item.minScore}
                      </span>
                    </div>
                    <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                      Niches: {item.params.niche}
                      {item.digestEmail ? ` · Digest: ${item.digestEmail}` : ""}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Last run:{" "}
                      {item.lastRunAt ? formatRelativeTime(item.lastRunAt) : "Never"}
                      {lastRun ? ` (${lastRun.newLeadIds.length} new)` : ""}
                      {" · "}
                      Next run:{" "}
                      {item.active && item.nextRunAt
                        ? new Date(item.nextRunAt).toLocaleString()
                        : "Off"}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex min-h-[44px] sm:min-h-[32px] items-center gap-1.5 px-1 text-xs text-gray-600 dark:text-gray-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={item.active}
                        onChange={(e) =>
                          toggleMutation.mutate({
                            id: item.id,
                            active: e.target.checked,
                          })
                        }
                        className="h-3.5 w-3.5 accent-indigo-600"
                      />
                      Active
                    </label>

                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isRunning}
                      onClick={() => handleRunNow(item.id)}
                      className="min-h-[44px] sm:min-h-[32px]"
                    >
                      {isRunning ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Play className="h-3.5 w-3.5" />
                      )}
                      {isRunning ? "Running..." : "Run now"}
                    </Button>

                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (isEditing) {
                          setEditingId(null);
                        } else {
                          setEditingId(item.id);
                          setEditDraft({
                            name: item.name,
                            schedule: item.schedule,
                            runAtHour: String(item.runAtHour),
                            minScore: String(item.minScore),
                            digestEmail: item.digestEmail || "",
                          });
                        }
                      }}
                      className="min-h-[44px] sm:min-h-[32px]"
                    >
                      Edit
                    </Button>

                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label={`Delete ${item.name}`}
                      onClick={() => deleteMutation.mutate(item.id)}
                      className="min-h-[44px] min-w-[44px] sm:min-h-[32px] sm:min-w-0 text-gray-500 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {isEditing && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      saveEditMutation.mutate(item.id);
                    }}
                    className="grid grid-cols-1 gap-3 border-t border-gray-100 bg-gray-50/50 p-4 text-xs sm:grid-cols-5 dark:border-neutral-800 dark:bg-neutral-950/40"
                  >
                    <div className="sm:col-span-2">
                      <label className="block text-gray-500 mb-1">Name</label>
                      <Input
                        value={editDraft.name}
                        onChange={(e) =>
                          setEditDraft((d) => ({ ...d, name: e.target.value }))
                        }
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-gray-500 mb-1">Schedule</label>
                      <select
                        value={editDraft.schedule}
                        onChange={(e) =>
                          setEditDraft((d) => ({
                            ...d,
                            schedule: e.target.value as
                              | "off"
                              | "daily"
                              | "weekly",
                          }))
                        }
                        className="h-9 w-full rounded-[8px] border border-gray-200 bg-white px-2 text-sm dark:border-neutral-800 dark:bg-neutral-950"
                      >
                        <option value="off">Off</option>
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-gray-500 mb-1">
                        Min score
                      </label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={editDraft.minScore}
                        onChange={(e) =>
                          setEditDraft((d) => ({
                            ...d,
                            minScore: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-gray-500 mb-1">
                        Digest email
                      </label>
                      <Input
                        type="email"
                        value={editDraft.digestEmail}
                        onChange={(e) =>
                          setEditDraft((d) => ({
                            ...d,
                            digestEmail: e.target.value,
                          }))
                        }
                        placeholder="you@domain.com"
                      />
                    </div>
                    <div className="sm:col-span-5 flex justify-end gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingId(null)}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        size="sm"
                        disabled={saveEditMutation.isPending}
                      >
                        Save
                      </Button>
                    </div>
                  </form>
                )}

                <div className="border-t border-gray-100 px-4 py-2 dark:border-neutral-800">
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(item.id)) next.delete(item.id);
                        else next.add(item.id);
                        return next;
                      })
                    }
                    className="inline-flex min-h-[36px] items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 cursor-pointer"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                    <span>Run history ({runs.length})</span>
                  </button>

                  {isExpanded && (
                    <div className="mt-2 pb-2">
                      {runs.length === 0 ? (
                        <p className="text-xs text-gray-500">
                          No runs recorded yet.
                        </p>
                      ) : (
                        <ul className="divide-y divide-gray-100 text-xs dark:divide-neutral-800">
                          {runs.slice(0, 5).map((run) => (
                            <li key={run.id} className="py-2 space-y-1">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-medium text-gray-800 dark:text-gray-200">
                                  {new Date(run.startedAt).toLocaleString()} ·{" "}
                                  <span
                                    className={cn(
                                      run.status === "failed"
                                        ? "text-red-600 dark:text-red-400"
                                        : "text-gray-600 dark:text-gray-300"
                                    )}
                                  >
                                    {run.status}
                                  </span>
                                </span>
                                <span className="text-gray-500 tabular-nums">
                                  {run.newLeadIds.length} new ·{" "}
                                  {run.duplicatesSkipped} duplicates skipped
                                  {run.digestStatus
                                    ? ` · digest: ${run.digestStatus}`
                                    : ""}
                                </span>
                              </div>
                              {run.perSource.length > 0 && (
                                <p className="text-gray-500 dark:text-gray-400">
                                  {run.perSource
                                    .map((s) =>
                                      s.error
                                        ? `${s.label}: ${s.found} (${s.error})`
                                        : `${s.label}: ${s.found}`
                                    )
                                    .join(" · ")}
                                </p>
                              )}
                              {run.error && (
                                <p className="text-red-600 dark:text-red-400">
                                  {run.error}
                                </p>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
