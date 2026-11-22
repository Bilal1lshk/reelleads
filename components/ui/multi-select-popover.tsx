"use client";

import * as React from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export interface RegionPresetOption {
  label: string;
  items: string[];
}

export interface MultiSelectPopoverProps {
  id?: string;
  items: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  itemNoun?: string;
  regions?: RegionPresetOption[];
  blockedItems?: string[];
  blockedMessage?: string;
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  ariaLabel?: string;
  className?: string;
}

/**
 * Searchable multi-select popover with quick region buttons, selected-first
 * sorting, conflict blocking, and a keyboard focus trap.
 */
export function MultiSelectPopover({
  id,
  items,
  selected,
  onChange,
  placeholder = "Select options",
  itemNoun = "selected",
  regions = [],
  blockedItems = [],
  blockedMessage = "Already excluded",
  disabled = false,
  open: controlledOpen,
  onOpenChange,
  ariaLabel,
  className,
}: MultiSelectPopoverProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = React.useCallback(
    (next: boolean) => {
      onOpenChange?.(next);
      if (controlledOpen === undefined) {
        setUncontrolledOpen(next);
      }
    },
    [controlledOpen, onOpenChange]
  );

  const [query, setQuery] = React.useState("");
  const [conflictNote, setConflictNote] = React.useState<string | null>(null);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const popoverRef = React.useRef<HTMLDivElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);

  const blockedSet = React.useMemo(
    () => new Set(blockedItems.map((b) => b.toLowerCase())),
    [blockedItems]
  );

  // Close on outside click
  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open, setOpen]);

  // Focus search input when opened, clear transient query/conflict when closed
  React.useEffect(() => {
    if (open) {
      requestAnimationFrame(() => searchRef.current?.focus());
    } else {
      setQuery("");
      setConflictNote(null);
    }
  }, [open]);

  // Focus trap & Escape handling inside popover
  const handlePopoverKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }

    if (e.key !== "Tab" || !popoverRef.current) return;
    const focusables = Array.from(
      popoverRef.current.querySelectorAll<HTMLElement>(
        'input:not(:disabled), button:not(:disabled), [tabindex]:not([tabindex="-1"])'
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
  };

  const selectedSet = React.useMemo(() => new Set(selected), [selected]);

  const sortedFilteredItems = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? items.filter((item) => item.toLowerCase().includes(q))
      : items;
    const selectedFirst = filtered.filter((i) => selectedSet.has(i));
    const unselectedRest = filtered.filter((i) => !selectedSet.has(i));
    return [...selectedFirst, ...unselectedRest];
  }, [items, query, selectedSet]);

  const toggleItem = (item: string) => {
    setConflictNote(null);
    if (selectedSet.has(item)) {
      onChange(selected.filter((x) => x !== item));
      return;
    }
    if (blockedSet.has(item.toLowerCase())) {
      setConflictNote(`${item}: ${blockedMessage}`);
      return;
    }
    onChange([...selected, item]);
  };

  const applyRegion = (regionItems: string[]) => {
    setConflictNote(null);
    const allowed = regionItems.filter(
      (i) => items.includes(i) && !blockedSet.has(i.toLowerCase())
    );
    const merged = Array.from(new Set([...selected, ...allowed]));
    onChange(merged);
  };

  const handleSelectAll = () => {
    setConflictNote(null);
    const allowed = items.filter((i) => !blockedSet.has(i.toLowerCase()));
    onChange(allowed);
  };

  const handleClear = () => {
    setConflictNote(null);
    onChange([]);
  };

  const summaryText = React.useMemo(() => {
    if (selected.length === 0) return placeholder;
    const preview = selected.slice(0, 2).join(", ");
    const rest = selected.length - 2;
    const countLabel = `${selected.length} ${itemNoun}`;
    return rest > 0
      ? `${countLabel} — ${preview} +${rest}`
      : `${countLabel} — ${preview}`;
  }, [selected, placeholder, itemNoun]);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(!open)}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-[8px] border border-gray-200 bg-white px-3 text-left text-sm transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-1",
          "dark:border-neutral-800 dark:bg-neutral-950",
          disabled
            ? "cursor-not-allowed bg-gray-50 text-gray-400 dark:bg-neutral-900 dark:text-neutral-500"
            : "cursor-pointer hover:bg-gray-50 dark:hover:bg-neutral-900"
        )}
      >
        <span
          className={cn(
            "truncate",
            selected.length === 0
              ? "text-gray-400 dark:text-neutral-500"
              : "text-gray-900 dark:text-gray-100"
          )}
        >
          {summaryText}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-gray-400 transition-transform",
            open && "rotate-180"
          )}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label={ariaLabel || placeholder}
          onKeyDown={handlePopoverKeyDown}
          className="absolute left-0 right-0 z-50 mt-1.5 flex max-h-[280px] flex-col overflow-hidden rounded-[8px] border border-gray-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
        >
          {/* Search input */}
          <div className="flex items-center gap-2 border-b border-gray-200 px-3 py-2 dark:border-neutral-800">
            <Search
              className="h-3.5 w-3.5 shrink-0 text-gray-400"
              aria-hidden="true"
            />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search countries..."
              aria-label="Search countries"
              className="w-full bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none dark:text-gray-100 dark:placeholder:text-neutral-500"
            />
          </div>

          {/* Quick regions + Select all / Clear */}
          <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-gray-100 bg-gray-50/70 px-2.5 py-1.5 dark:border-neutral-800 dark:bg-neutral-950/60">
            <div className="flex flex-wrap items-center gap-1">
              {regions.map((region) => (
                <button
                  key={region.label}
                  type="button"
                  onClick={() => applyRegion(region.items)}
                  className="rounded px-1.5 py-0.5 text-[11px] font-medium text-gray-600 hover:bg-gray-200/70 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-600 dark:text-gray-300 dark:hover:bg-neutral-800 cursor-pointer"
                >
                  {region.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              <button
                type="button"
                onClick={handleSelectAll}
                className="font-medium text-indigo-600 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-600 dark:text-indigo-400 cursor-pointer"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={handleClear}
                className="font-medium text-gray-500 hover:text-gray-800 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-600 dark:text-gray-400 dark:hover:text-gray-200 cursor-pointer"
              >
                Clear
              </button>
            </div>
          </div>

          {conflictNote && (
            <div
              role="alert"
              className="border-b border-red-100 bg-red-50 px-3 py-1.5 text-xs text-red-600 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-400"
            >
              {conflictNote}
            </div>
          )}

          {/* Checkbox list */}
          <div
            role="listbox"
            aria-multiselectable="true"
            className="hover-thin-scrollbar flex-1 overflow-y-auto p-1"
          >
            {sortedFilteredItems.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-gray-500 dark:text-gray-400">
                No matching countries.
              </p>
            ) : (
              sortedFilteredItems.map((item) => {
                const isSelected = selectedSet.has(item);
                const isBlocked = blockedSet.has(item.toLowerCase());
                return (
                  <button
                    key={item}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => toggleItem(item)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-[6px] px-2.5 py-1.5 text-left text-sm transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600",
                      isBlocked && !isSelected
                        ? "cursor-not-allowed text-gray-400 hover:bg-red-50/60 dark:text-neutral-500"
                        : "cursor-pointer text-gray-800 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-neutral-800"
                    )}
                  >
                    <span className="flex items-center gap-2 truncate">
                      <span
                        aria-hidden="true"
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border",
                          isSelected
                            ? "border-indigo-600 bg-indigo-600 text-white"
                            : "border-gray-300 bg-white dark:border-neutral-700 dark:bg-neutral-950"
                        )}
                      >
                        {isSelected && <Check className="h-3 w-3" />}
                      </span>
                      <span className="truncate">{item}</span>
                    </span>
                    {isBlocked && !isSelected && (
                      <span className="shrink-0 text-[11px] text-gray-400">
                        Excluded
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
