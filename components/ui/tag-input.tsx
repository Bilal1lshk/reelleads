"use client";

import * as React from "react";
import { Check, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TagInputProps {
  id?: string;
  values: string[];
  onChange: (next: string[]) => void;
  suggestions?: string[];
  maxTags?: number;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}

export function TagInput({
  id,
  values,
  onChange,
  suggestions = [],
  maxTags = 8,
  placeholder = "Type a niche and press Enter...",
  disabled = false,
  ariaLabel = "Niches",
  className,
}: TagInputProps) {
  const [draft, setDraft] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  const normalizedSet = React.useMemo(
    () => new Set(values.map((v) => v.trim().toLowerCase())),
    [values]
  );

  const addTag = React.useCallback(
    (raw: string) => {
      const cleaned = raw.replace(/,/g, "").trim();
      if (!cleaned) return;
      if (values.length >= maxTags) return;
      if (normalizedSet.has(cleaned.toLowerCase())) {
        setDraft("");
        return;
      }
      onChange([...values, cleaned]);
      setDraft("");
    },
    [maxTags, normalizedSet, onChange, values]
  );

  const removeTag = React.useCallback(
    (tag: string) => {
      const target = tag.toLowerCase();
      onChange(values.filter((v) => v.toLowerCase() !== target));
    },
    [onChange, values]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(draft);
    } else if (e.key === "Backspace" && !draft && values.length > 0) {
      e.preventDefault();
      onChange(values.slice(0, -1));
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val.includes(",")) {
      const parts = val.split(",");
      const nextList = [...values];
      const seen = new Set(nextList.map((v) => v.toLowerCase()));
      for (let i = 0; i < parts.length - 1; i += 1) {
        const cleaned = parts[i].trim();
        if (cleaned && !seen.has(cleaned.toLowerCase()) && nextList.length < maxTags) {
          seen.add(cleaned.toLowerCase());
          nextList.push(cleaned);
        }
      }
      if (nextList.length !== values.length) {
        onChange(nextList);
      }
      setDraft(parts[parts.length - 1]);
    } else {
      setDraft(val);
    }
  };

  const remainingSuggestions = React.useMemo(
    () => suggestions.filter((s) => !normalizedSet.has(s.toLowerCase())),
    [normalizedSet, suggestions]
  );

  const atLimit = values.length >= maxTags;

  return (
    <div className={cn("space-y-2.5", className)}>
      <div
        onClick={() => inputRef.current?.focus()}
        className={cn(
          "flex min-h-[42px] flex-wrap items-center gap-1.5 rounded-[8px] border border-gray-200 bg-white px-2.5 py-1.5 text-sm transition-colors",
          "focus-within:border-indigo-600 focus-within:ring-2 focus-within:ring-indigo-600/20",
          "dark:border-neutral-800 dark:bg-neutral-900",
          disabled && "cursor-not-allowed opacity-60"
        )}
      >
        {values.map((tag) => (
          <span
            key={tag}
            className="inline-flex h-7 items-center gap-1 rounded-[6px] border border-gray-200 bg-gray-100 px-2 text-xs font-medium text-gray-800 dark:border-neutral-700 dark:bg-neutral-800 dark:text-gray-200"
          >
            <Check className="h-3 w-3 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
            <span>{tag}</span>
            <button
              type="button"
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation();
                removeTag(tag);
              }}
              aria-label={`Remove ${tag}`}
              className="inline-flex h-4 w-4 items-center justify-center rounded-sm text-gray-500 hover:bg-gray-200 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 dark:text-gray-400 dark:hover:bg-neutral-700 dark:hover:text-gray-100 cursor-pointer"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </span>
        ))}

        <input
          ref={inputRef}
          id={id}
          type="text"
          value={draft}
          disabled={disabled || atLimit}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (draft.trim()) addTag(draft);
          }}
          aria-label={ariaLabel}
          placeholder={
            atLimit
              ? `Maximum ${maxTags} niches reached`
              : values.length === 0
              ? placeholder
              : "Add another..."
          }
          className="min-w-[140px] flex-1 bg-transparent py-1 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none disabled:cursor-not-allowed dark:text-gray-100 dark:placeholder:text-neutral-500"
        />
      </div>

      {remainingSuggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Suggested niches">
          {remainingSuggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              disabled={disabled || atLimit}
              onClick={() => addTag(suggestion)}
              className={cn(
                "inline-flex min-h-[44px] sm:min-h-[28px] items-center gap-1 rounded-[6px] border border-gray-200 bg-gray-50 px-2.5 text-xs font-medium text-gray-700 transition-colors",
                "hover:border-gray-300 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600",
                "disabled:cursor-not-allowed disabled:opacity-50",
                "dark:border-neutral-800 dark:bg-neutral-950 dark:text-gray-300 dark:hover:bg-neutral-800 cursor-pointer"
              )}
            >
              <Plus className="h-3 w-3 text-gray-400" aria-hidden="true" />
              <span>{suggestion}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
