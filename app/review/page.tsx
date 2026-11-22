"use client";

import * as React from "react";
import Link from "next/link";
import { FEATURE_REVIEW_BEFORE_SAVE } from "@/lib/config";
import { Button } from "@/components/ui/button";
import { PendingReviewList } from "@/components/pending-review-list";

export default function ReviewPage() {
  const [stats, setStats] = React.useState<{
    total: number;
    newCount: number;
    duplicateCount: number;
  }>({ total: 0, newCount: 0, duplicateCount: 0 });

  if (!FEATURE_REVIEW_BEFORE_SAVE) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <h1 className="text-lg font-semibold">Review</h1>
        <p className="text-sm text-gray-500">
          Review before saving is currently disabled.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-gray-900 dark:text-gray-100">
            Review leads
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {stats.total > 0
              ? `${stats.total} pending (${stats.newCount} new, ${stats.duplicateCount} already in your CRM)`
              : "Approve or discard leads from recent searches before saving them to your CRM."}
          </p>
        </div>
        <Link href="/search">
          <Button
            size="sm"
            variant="outline"
            className="min-h-[44px] sm:min-h-[32px]"
          >
            New search
          </Button>
        </Link>
      </div>

      <div className="overflow-hidden rounded-[8px] border border-gray-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <PendingReviewList mode="page" onStatsChange={setStats} />
      </div>
    </div>
  );
}
