import { cn, getScoreTone } from "@/lib/utils";

export function ScoreBadge({ score }: { score: number }) {
  const tone = getScoreTone(score);
  const dot =
    tone === "high"
      ? "bg-green-600"
      : tone === "medium"
        ? "bg-amber-500"
        : "bg-gray-400";

  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2 py-0.5 text-xs font-medium tabular-nums text-gray-800 dark:border-neutral-800 dark:bg-neutral-900 dark:text-gray-200">
      <span aria-hidden="true" className={cn("h-1.5 w-1.5 rounded-full", dot)} />
      {score}
    </span>
  );
}
