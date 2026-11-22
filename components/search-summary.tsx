"use client";

import * as React from "react";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface SearchSummaryRow {
  label: string;
  value: string;
  stepId: string;
}

export interface SearchSummaryProps {
  rows: SearchSummaryRow[];
  estimatedTime: string;
  disabledReason: string | null;
  isSubmitting: boolean;
  onEditStep: (stepId: string) => void;
  onReset: () => void;
  onSavePreset: () => void;
  onSaveSearch?: () => void;
  onSubmit: () => void;
}

export function SearchSummary({
  rows,
  estimatedTime,
  disabledReason,
  isSubmitting,
  onEditStep,
  onReset,
  onSavePreset,
  onSaveSearch,
  onSubmit,
}: SearchSummaryProps) {
  const isDisabled = isSubmitting || Boolean(disabledReason);

  return (
    <>
      {/* Desktop sticky 320px summary card */}
      <aside
        aria-label="Search summary"
        className="hidden lg:block lg:sticky lg:top-16 w-[320px] shrink-0"
      >
        <div className="rounded-[8px] border border-gray-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center justify-between border-b border-gray-200 pb-3 dark:border-neutral-800">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Search summary
            </h2>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {estimatedTime}
            </span>
          </div>

          <dl className="divide-y divide-gray-100 py-1 text-xs dark:divide-neutral-800">
            {rows.map((row) => (
              <div
                key={row.stepId}
                className="flex items-start justify-between gap-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <dt className="text-gray-500 dark:text-gray-400">
                    {row.label}
                  </dt>
                  <dd className="mt-0.5 break-words font-medium text-gray-900 dark:text-gray-100">
                    {row.value}
                  </dd>
                </div>
                <button
                  type="button"
                  onClick={() => onEditStep(row.stepId)}
                  className="shrink-0 text-xs font-medium text-indigo-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 rounded px-1 dark:text-indigo-400 cursor-pointer"
                >
                  Edit
                </button>
              </div>
            ))}
          </dl>

          <div className="mt-3 space-y-2 border-t border-gray-200 pt-3 dark:border-neutral-800">
            <Button
              type="button"
              disabled={isDisabled}
              onClick={onSubmit}
              className="w-full h-9"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Search className="h-4 w-4" aria-hidden="true" />
              )}
              {isSubmitting ? "Searching..." : "Find leads"}
            </Button>

            {disabledReason && !isSubmitting && (
              <p className="text-center text-xs text-gray-500 dark:text-gray-400">
                {disabledReason}
              </p>
            )}

            {onSaveSearch && (
              <Button
                type="button"
                variant="outline"
                disabled={isDisabled}
                onClick={onSaveSearch}
                className="w-full h-8 text-xs"
              >
                Save this search
              </Button>
            )}

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={onReset}
                className="text-xs font-medium text-gray-500 hover:text-gray-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 rounded px-1 disabled:opacity-50 dark:text-gray-400 dark:hover:text-gray-200 cursor-pointer"
              >
                Reset
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={onSavePreset}
                className="text-xs font-medium text-gray-600 hover:text-gray-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 rounded px-1 disabled:opacity-50 dark:text-gray-300 dark:hover:text-gray-100 cursor-pointer"
              >
                Save as preset
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile sticky bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-gray-200 bg-white px-4 py-3 lg:hidden dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mx-auto flex max-w-[720px] items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-gray-900 dark:text-gray-100">
              {rows[0]?.value || "No niches"} · {rows[4]?.value || "50 leads"}
            </p>
            <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">
              {disabledReason ? disabledReason : estimatedTime}
            </p>
          </div>
          <Button
            type="button"
            disabled={isDisabled}
            onClick={onSubmit}
            className={cn("min-h-[44px] shrink-0 px-4")}
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Search className="h-4 w-4" aria-hidden="true" />
            )}
            {isSubmitting ? "Searching..." : "Find leads"}
          </Button>
        </div>
      </div>
    </>
  );
}
