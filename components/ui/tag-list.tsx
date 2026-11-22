"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TagListProps {
  items: string[];
  onRemove: (item: string) => void;
  onOverflowClick?: () => void;
  maxVisible?: number;
  variant?: "default" | "exclude";
  disabled?: boolean;
  className?: string;
}

/**
 * Single-row list of removable tags with a "+N more" overflow trigger.
 */
export function TagList({
  items,
  onRemove,
  onOverflowClick,
  maxVisible = 6,
  variant = "default",
  disabled = false,
  className,
}: TagListProps) {
  if (items.length === 0) return null;

  const visible = items.slice(0, maxVisible);
  const overflowCount = items.length - visible.length;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1.5",
        className
      )}
    >
      {visible.map((item) => (
        <span
          key={item}
          className={cn(
            "inline-flex h-6 shrink-0 items-center gap-1 rounded-[6px] border px-2 text-xs font-medium",
            variant === "exclude"
              ? "border-red-200/80 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
              : "border-gray-200 bg-gray-100 text-gray-800 dark:border-neutral-800 dark:bg-neutral-800 dark:text-gray-200"
          )}
        >
          <span className="max-w-[120px] truncate">{item}</span>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onRemove(item)}
            aria-label={`Remove ${item}`}
            className={cn(
              "inline-flex h-3.5 w-3.5 items-center justify-center rounded-sm transition-colors",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-600",
              disabled
                ? "cursor-not-allowed opacity-50"
                : variant === "exclude"
                ? "cursor-pointer text-red-600 hover:bg-red-100 dark:text-red-300 dark:hover:bg-red-900/40"
                : "cursor-pointer text-gray-500 hover:bg-gray-200 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-neutral-700 dark:hover:text-gray-100"
            )}
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </span>
      ))}

      {overflowCount > 0 && (
        <button
          type="button"
          disabled={disabled}
          onClick={onOverflowClick}
          className={cn(
            "inline-flex h-6 shrink-0 items-center rounded-[6px] border border-gray-200 bg-white px-2 text-xs font-medium text-gray-600 hover:bg-gray-50",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600",
            "dark:border-neutral-800 dark:bg-neutral-900 dark:text-gray-300 dark:hover:bg-neutral-800",
            disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
          )}
        >
          +{overflowCount} more
        </button>
      )}
    </div>
  );
}
