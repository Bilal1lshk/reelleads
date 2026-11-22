"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string | number> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}

/**
 * Neutral segmented control with gray-100 track and crisp 1px-bordered active segment.
 */
export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  disabled = false,
  ariaLabel,
  className,
}: SegmentedControlProps<T>) {
  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    idx: number
  ) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const nextIdx =
      e.key === "ArrowRight"
        ? (idx + 1) % options.length
        : (idx - 1 + options.length) % options.length;
    onChange(options[nextIdx].value);
    const parent = e.currentTarget.parentElement;
    const buttons = parent?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    buttons?.[nextIdx]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex h-9 w-full items-center rounded-[8px] border border-gray-200 bg-gray-100 p-0.5 dark:border-neutral-800 dark:bg-neutral-950",
        className
      )}
    >
      {options.map((opt, idx) => {
        const selected = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            className={cn(
              "flex-1 h-full rounded-[6px] px-2.5 text-[13px] font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600",
              disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
              selected
                ? "border border-gray-200 bg-white text-gray-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-gray-100"
                : "border border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
