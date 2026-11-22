"use client";

import * as React from "react";
import { X } from "lucide-react";
import { FEATURE_REVIEW_BEFORE_SAVE } from "@/lib/config";
import { useLeadsStore } from "@/lib/store";
import { PendingReviewList } from "@/components/pending-review-list";

export function PendingReviewModal() {
  const {
    reviewModalOpen,
    reviewSearchRunId,
    newSearchBannerRunId,
    closeReviewModal,
    switchReviewToNewSearch,
  } = useLeadsStore();

  const modalRef = React.useRef<HTMLDivElement>(null);
  const [stats, setStats] = React.useState<{
    total: number;
    newCount: number;
    duplicateCount: number;
    perSource: Array<{ platform: string; label: string; kept: number }>;
  }>({
    total: 0,
    newCount: 0,
    duplicateCount: 0,
    perSource: [],
  });

  // Escape closes modal as "Review later" + focus trap
  React.useEffect(() => {
    if (!reviewModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeReviewModal();
        return;
      }
      if (e.key === "Tab" && modalRef.current) {
        const focusables = Array.from(
          modalRef.current.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], input:not(:disabled), [tabindex]:not([tabindex="-1"])'
          )
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeReviewModal, reviewModalOpen]);

  if (!FEATURE_REVIEW_BEFORE_SAVE || !reviewModalOpen) return null;

  const perSourceLine = stats.perSource
    .filter((s) => s.kept > 0)
    .map((s) => `${s.label} ${s.kept}`)
    .join(", ");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Review leads before saving"
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 sm:p-4"
    >
      <div
        ref={modalRef}
        className="flex h-[100dvh] w-full flex-col overflow-hidden bg-white sm:h-auto sm:max-h-[90vh] sm:max-w-[720px] sm:rounded-[8px] sm:border sm:border-gray-200 dark:bg-neutral-900 dark:sm:border-neutral-800"
      >
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-3.5 dark:border-neutral-800">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              {stats.total} leads found
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {stats.newCount} new, {stats.duplicateCount} already in your CRM
              {perSourceLine ? ` · ${perSourceLine}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={closeReviewModal}
            aria-label="Review later"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 dark:text-gray-400 dark:hover:bg-neutral-800 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {newSearchBannerRunId && (
          <div className="flex items-center justify-between gap-2 border-b border-indigo-200 bg-indigo-50/70 px-4 py-2 text-xs text-indigo-900 dark:border-indigo-900/50 dark:bg-indigo-950/30 dark:text-indigo-200">
            <span>New results from another search</span>
            <button
              type="button"
              onClick={switchReviewToNewSearch}
              className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400 cursor-pointer"
            >
              Load new results
            </button>
          </div>
        )}

        <PendingReviewList
          searchRunId={reviewSearchRunId}
          mode="modal"
          onClose={closeReviewModal}
          onStatsChange={setStats}
        />
      </div>
    </div>
  );
}
