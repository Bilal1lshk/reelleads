"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface OptionChipProps {
  label: string;
  selected: boolean;
  onToggle: () => void;
  disabled?: boolean;
  statusDot?: "ready" | "missing";
  statusTooltip?: string;
  className?: string;
}

/**
 * Selectable option chip with neutral light-mode styling, check icon when
 * selected, optional source status dot, and arrow-key navigation within a group.
 */
export function OptionChip({
  label,
  selected,
  onToggle,
  disabled = false,
  statusDot,
  statusTooltip,
  className,
}: OptionChipProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (
      e.key !== "ArrowRight" &&
      e.key !== "ArrowLeft" &&
      e.key !== "ArrowDown" &&
      e.key !== "ArrowUp"
    ) {
      return;
    }

    const group = e.currentTarget.closest('[role="group"]');
    if (!group) return;

    const buttons = Array.from(
      group.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")
    );
    const idx = buttons.indexOf(e.currentTarget);
    if (idx === -1 || buttons.length <= 1) return;

    e.preventDefault();
    const forward = e.key === "ArrowRight" || e.key === "ArrowDown";
    const nextIdx = forward
      ? (idx + 1) % buttons.length
      : (idx - 1 + buttons.length) % buttons.length;
    buttons[nextIdx]?.focus();
  };

  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      title={statusTooltip}
      onClick={onToggle}
      onKeyDown={handleKeyDown}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-[6px] border px-3 text-[13px] font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-1",
        disabled
          ? "cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-500"
          : selected
          ? "cursor-pointer border-indigo-600 bg-gray-100 text-gray-900 dark:border-indigo-500 dark:bg-neutral-800 dark:text-gray-100"
          : "cursor-pointer border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-neutral-800 dark:bg-neutral-950 dark:text-gray-300 dark:hover:bg-neutral-900",
        className
      )}
    >
      {selected && (
        <Check
          className="h-3.5 w-3.5 shrink-0 text-indigo-600 dark:text-indigo-400"
          aria-hidden="true"
        />
      )}
      <span>{label}</span>
      {statusDot && (
        <span
          aria-label={
            statusDot === "ready" ? "Configured" : "API key missing"
          }
          title={statusTooltip}
          className={cn(
            "ml-0.5 h-1.5 w-1.5 shrink-0 rounded-full",
            statusDot === "ready"
              ? "bg-emerald-500"
              : "bg-gray-300 dark:bg-neutral-600"
          )}
        />
      )}
    </button>
  );
}
