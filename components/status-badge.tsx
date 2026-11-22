import { cn, LEAD_STATUS_LABELS, STATUS_DOT_COLORS } from "@/lib/utils";
import type { LeadStatus } from "@/types/lead";

export function StatusBadge({ status }: { status: LeadStatus }) {
  const safeStatus = (status in LEAD_STATUS_LABELS ? status : "new") as LeadStatus;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
      <span
        aria-hidden="true"
        className={cn("h-2 w-2 rounded-full shrink-0", STATUS_DOT_COLORS[safeStatus])}
      />
      <span>{LEAD_STATUS_LABELS[safeStatus]}</span>
    </span>
  );
}
