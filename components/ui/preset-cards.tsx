"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface PresetCardOption<T extends string> {
  value: T;
  title: string;
  description: string;
}

export interface PresetCardsProps<T extends string> {
  options: PresetCardOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}

export function PresetCards<T extends string>({
  options,
  value,
  onChange,
  disabled = false,
  ariaLabel = "Presets",
  className,
}: PresetCardsProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn("grid grid-cols-1 gap-2.5 sm:grid-cols-3", className)}
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex min-h-[44px] flex-col items-start justify-start rounded-[8px] border p-3 text-left transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600",
              selected
                ? "border-indigo-600 bg-indigo-50/40 dark:border-indigo-500 dark:bg-indigo-950/20"
                : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/60 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700",
              disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
            )}
          >
            <div className="flex w-full items-center justify-between gap-2">
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {opt.title}
              </span>
              <span
                aria-hidden="true"
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                  selected
                    ? "border-indigo-600 dark:border-indigo-400"
                    : "border-gray-300 dark:border-neutral-700"
                )}
              >
                {selected && (
                  <span className="h-2 w-2 rounded-full bg-indigo-600 dark:bg-indigo-400" />
                )}
              </span>
            </div>
            <span className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {opt.description}
            </span>
          </button>
        );
      })}
    </div>
  );
}
