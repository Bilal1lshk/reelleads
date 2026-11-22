"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  Loader2,
  Plus,
  X,
  XCircle,
} from "lucide-react";
import {
  createSavedSearch,
  getHealthStatus,
  saveLeadsToCrm,
  searchLeads,
  type SearchResponse,
} from "@/lib/api";
import {
  FEATURE_AUTOPILOT,
  FEATURE_REVIEW_BEFORE_SAVE,
  getClientProfile,
} from "@/lib/config";
import { EUROPE_COUNTRIES, SELECTABLE_COUNTRIES } from "@/lib/countries";
import { useLeadsStore } from "@/lib/store";
import { cn, LEAD_TYPE_LABELS, PLATFORM_LABELS } from "@/lib/utils";
import type { Lead, LeadPlatform, LeadType } from "@/types/lead";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OptionChip } from "@/components/ui/option-chip";
import {
  MultiSelectPopover,
  type RegionPresetOption,
} from "@/components/ui/multi-select-popover";
import { TagList } from "@/components/ui/tag-list";
import { TagInput } from "@/components/ui/tag-input";
import { PresetCards, type PresetCardOption } from "@/components/ui/preset-cards";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ScoreBadge } from "@/components/score-badge";
import { SearchSummary } from "@/components/search-summary";
import { useToast } from "@/components/providers";

const LAST_SEARCH_KEY = "nicheleads:last-search";
const SAVED_PRESET_KEY = "nicheleads:search-preset";

const NICHE_SUGGESTIONS = [
  "Fashion",
  "Food",
  "Real estate",
  "Fitness",
  "Beauty",
  "Coaching",
  "E-commerce",
  "Talking head",
  "Faceless videos",
  "Podcasts",
  "Tech",
  "SaaS",
];

const CLIENT_TYPE_OPTIONS: {
  value: LeadType;
  label: string;
  description: string;
}[] = [
  {
    value: "local_brand",
    label: "Local brands",
    description: "Shops and businesses with Instagram or Google listings",
  },
  {
    value: "creator",
    label: "Instagram creators",
    description: "Creators posting reels and brand content",
  },
  {
    value: "coach",
    label: "Coaches",
    description: "Consultants, trainers, and course creators",
  },
  {
    value: "youtuber",
    label: "YouTubers",
    description: "Channels publishing regular long-form or Shorts",
  },
  {
    value: "agency",
    label: "Agencies",
    description: "Marketing, creative, and production agencies",
  },
];

const PLATFORM_OPTIONS: {
  value: LeadPlatform;
  label: string;
}[] = [
  { value: "exa", label: "AI Agents" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "youtube", label: "YouTube" },
  { value: "instagram", label: "Instagram" },
  { value: "reddit", label: "Reddit" },
  { value: "google_cse", label: "Google" },
  { value: "google_places", label: "Google Places" },
];

type SourcePresetMode = "recommended" | "hiring" | "custom";

const SOURCE_PRESET_OPTIONS: PresetCardOption<SourcePresetMode>[] = [
  {
    value: "recommended",
    title: "Recommended",
    description: "Runs all ready sources automatically.",
  },
  {
    value: "hiring",
    title: "Hiring posts only",
    description: "Reddit, LinkedIn, and AI Agents.",
  },
  {
    value: "custom",
    title: "Custom",
    description: "Pick individual sources.",
  },
];

const HIRING_PLATFORMS: LeadPlatform[] = ["reddit", "linkedin", "exa"];

const LEAD_COUNT_OPTIONS: { value: 10 | 25 | 50 | 100; label: string }[] = [
  { value: 10, label: "10" },
  { value: 25, label: "25" },
  { value: 50, label: "50" },
  { value: 100, label: "100" },
];

const GULF_MIDDLE_EAST = [
  "Lebanon",
  "United Arab Emirates",
  "Saudi Arabia",
  "Qatar",
  "Kuwait",
  "Bahrain",
  "Oman",
  "Egypt",
  "Turkey",
];

const COUNTRY_REGIONS: RegionPresetOption[] = [
  { label: "Europe", items: EUROPE_COUNTRIES },
  { label: "North America", items: ["United States", "Canada"] },
  { label: "Middle East", items: GULF_MIDDLE_EAST },
  { label: "Asia", items: ["India", "Pakistan", "Bangladesh"] },
];

interface SavedSearchState {
  niches: string[];
  clientTypes: LeadType[];
  sourceMode: SourcePresetMode;
  customPlatforms: LeadPlatform[];
  countries: string[];
  excludedCountries: string[];
  city: string;
  count: 10 | 25 | 50 | 100;
}

type SourceProgressState = "waiting" | "searching" | "done" | "warning";

interface SourceProgressRow {
  platform: LeadPlatform;
  label: string;
  state: SourceProgressState;
  count?: number;
  message?: string;
}

function estimateSeconds(sourceCount: number, leadCount: number): string {
  const base = leadCount <= 10 ? 15 : leadCount <= 25 ? 25 : leadCount <= 50 ? 45 : 75;
  const adjusted = Math.max(10, Math.round(base * Math.max(0.6, Math.min(1.2, sourceCount / 4))));
  return `About ${adjusted} seconds`;
}

export function LeadSearchForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const {
    workspaceId,
    resetFilters,
    openReviewModal,
    notifyNewSearchResults,
  } = useLeadsStore();

  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: getHealthStatus,
    staleTime: 60_000,
  });

  const profile = React.useMemo(
    () => getClientProfile(workspaceId),
    [workspaceId]
  );

  const [niches, setNiches] = React.useState<string[]>(profile.niches);
  const [clientTypes, setClientTypes] = React.useState<LeadType[]>(
    profile.clientTypes
  );
  const [sourceMode, setSourceMode] =
    React.useState<SourcePresetMode>("recommended");
  const [customPlatforms, setCustomPlatforms] = React.useState<LeadPlatform[]>([
    "exa",
    "linkedin",
    "youtube",
    "instagram",
    "reddit",
  ]);
  const [countries, setCountries] = React.useState<string[]>(profile.countries);
  const [prevCountriesUndo, setPrevCountriesUndo] = React.useState<
    string[] | null
  >(null);
  const [excludedCountries, setExcludedCountries] = React.useState<string[]>(
    profile.excludedCountries
  );
  const [showExcludes, setShowExcludes] = React.useState(false);
  const [city, setCity] = React.useState<string>("");
  const [count, setCount] = React.useState<10 | 25 | 50 | 100>(50);

  const [countriesOpen, setCountriesOpen] = React.useState(false);
  const [excludedOpen, setExcludedOpen] = React.useState(false);

  const [saveSearchOpen, setSaveSearchOpen] = React.useState(false);
  const [saveName, setSaveName] = React.useState("");
  const [saveSchedule, setSaveSchedule] = React.useState<
    "off" | "daily" | "weekly"
  >("daily");
  const [saveHour, setSaveHour] = React.useState("7");
  const [saveMinScore, setSaveMinScore] = React.useState("75");
  const [saveDigestEmail, setSaveDigestEmail] = React.useState("");
  const [savingSearch, setSavingSearch] = React.useState(false);

  const [lastSavedSearch, setLastSavedSearch] =
    React.useState<SavedSearchState | null>(null);

  const [isSearching, setIsSearching] = React.useState(false);
  const [progressRows, setProgressRows] = React.useState<SourceProgressRow[]>([]);
  const [lastResult, setLastResult] = React.useState<SearchResponse | null>(
    null
  );
  const [resultsModalOpen, setResultsModalOpen] = React.useState(false);
  const [previewLeads, setPreviewLeads] = React.useState<Lead[]>([]);
  const [addedIds, setAddedIds] = React.useState<Set<string>>(new Set());
  const [savingId, setSavingId] = React.useState<string | null>(null);
  const [savingAll, setSavingAll] = React.useState(false);
  const [searchError, setSearchError] = React.useState<string | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(LAST_SEARCH_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as SavedSearchState;
        if (Array.isArray(parsed.niches)) setLastSavedSearch(parsed);
      }
      const presetRaw = localStorage.getItem(SAVED_PRESET_KEY);
      if (presetRaw) {
        const preset = JSON.parse(presetRaw) as SavedSearchState;
        if (Array.isArray(preset.niches) && preset.niches.length > 0) {
          setNiches(preset.niches);
          if (Array.isArray(preset.clientTypes)) setClientTypes(preset.clientTypes);
          if (preset.sourceMode) setSourceMode(preset.sourceMode);
          if (Array.isArray(preset.customPlatforms))
            setCustomPlatforms(preset.customPlatforms);
          if (Array.isArray(preset.countries)) setCountries(preset.countries);
          if (Array.isArray(preset.excludedCountries))
            setExcludedCountries(preset.excludedCountries);
          if (typeof preset.city === "string") setCity(preset.city);
          if (preset.count) setCount(preset.count);
        }
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  const isSourceConfigured = React.useCallback(
    (platform: LeadPlatform): boolean => {
      if (!health?.connectors) return true;
      const val = health.connectors[platform];
      return val === undefined ? true : Boolean(val);
    },
    [health]
  );

  const readyPlatforms = React.useMemo(
    () =>
      PLATFORM_OPTIONS.filter((p) => isSourceConfigured(p.value)).map(
        (p) => p.value
      ),
    [isSourceConfigured]
  );

  const unavailablePlatforms = React.useMemo(
    () => PLATFORM_OPTIONS.filter((p) => !isSourceConfigured(p.value)),
    [isSourceConfigured]
  );

  const activePlatforms = React.useMemo<LeadPlatform[]>(() => {
    if (sourceMode === "recommended") {
      return readyPlatforms;
    }
    if (sourceMode === "hiring") {
      return HIRING_PLATFORMS.filter((p) => isSourceConfigured(p));
    }
    return customPlatforms.filter((p) => isSourceConfigured(p));
  }, [customPlatforms, isSourceConfigured, readyPlatforms, sourceMode]);

  const activePlatformLabels = React.useMemo(
    () =>
      activePlatforms
        .map(
          (p) => PLATFORM_OPTIONS.find((opt) => opt.value === p)?.label || p
        )
        .join(", "),
    [activePlatforms]
  );

  const applyCountryPreset = (next: string[]) => {
    setPrevCountriesUndo(countries);
    const excludedSet = new Set(excludedCountries.map((c) => c.toLowerCase()));
    setCountries(next.filter((c) => !excludedSet.has(c.toLowerCase())));
  };

  const handleUndoCountries = () => {
    if (prevCountriesUndo !== null) {
      setCountries(prevCountriesUndo);
      setPrevCountriesUndo(null);
    }
  };

  const scrollToStep = (stepId: string) => {
    const el = document.getElementById(stepId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const buildCurrentState = (): SavedSearchState => ({
    niches,
    clientTypes,
    sourceMode,
    customPlatforms,
    countries,
    excludedCountries,
    city,
    count,
  });

  const applySavedState = (s: SavedSearchState) => {
    setNiches(s.niches);
    setClientTypes(s.clientTypes);
    setSourceMode(s.sourceMode);
    setCustomPlatforms(s.customPlatforms);
    setCountries(s.countries);
    setExcludedCountries(s.excludedCountries);
    setCity(s.city);
    setCount(s.count);
    setPrevCountriesUndo(null);
  };

  const handleReset = () => {
    setNiches(profile.niches);
    setClientTypes(profile.clientTypes);
    setSourceMode("recommended");
    setCustomPlatforms(["exa", "linkedin", "youtube", "instagram", "reddit"]);
    setCountries(profile.countries);
    setExcludedCountries(profile.excludedCountries);
    setCity("");
    setCount(50);
    setPrevCountriesUndo(null);
    setLastResult(null);
    setSearchError(null);
    notify("Search form reset");
  };

  const handleSaveAsPreset = () => {
    try {
      const snapshot = buildCurrentState();
      localStorage.setItem(SAVED_PRESET_KEY, JSON.stringify(snapshot));
      notify("Saved as default preset");
    } catch {
      notify("Could not save preset", "error");
    }
  };

  const disabledReason = React.useMemo(() => {
    if (niches.length === 0) return "Add at least one niche";
    if (clientTypes.length === 0) return "Select at least one client type";
    if (activePlatforms.length === 0) return "Select at least one source";
    return null;
  }, [activePlatforms.length, clientTypes.length, niches.length]);

  const runSearch = async (override?: Partial<SavedSearchState>) => {
    const useNiches = override?.niches ?? niches;
    const useClientTypes = override?.clientTypes ?? clientTypes;
    const useCountries = override?.countries ?? countries;
    const useExcluded = override?.excludedCountries ?? excludedCountries;
    const useCity = override?.city ?? city;
    const useCount = override?.count ?? count;

    if (
      useNiches.length === 0 ||
      useClientTypes.length === 0 ||
      activePlatforms.length === 0
    ) {
      return;
    }

    const snapshot: SavedSearchState = {
      niches: useNiches,
      clientTypes: useClientTypes,
      sourceMode,
      customPlatforms,
      countries: useCountries,
      excludedCountries: useExcluded,
      city: useCity,
      count: useCount,
    };

    try {
      localStorage.setItem(LAST_SEARCH_KEY, JSON.stringify(snapshot));
      setLastSavedSearch(snapshot);
    } catch {
      // ignore storage error
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsSearching(true);
    setLastResult(null);
    setSearchError(null);

    const initialRows: SourceProgressRow[] = [
      ...activePlatforms.map((p, idx) => ({
        platform: p,
        label: PLATFORM_OPTIONS.find((opt) => opt.value === p)?.label || p,
        state: (idx === 0 ? "searching" : "waiting") as SourceProgressState,
      })),
      ...unavailablePlatforms.map((p) => ({
        platform: p.value,
        label: p.label,
        state: "warning" as SourceProgressState,
        message: "skipped, key missing",
      })),
    ];
    setProgressRows(initialRows);

    const timer = window.setInterval(() => {
      setProgressRows((prev) => {
        const nextWaitingIdx = prev.findIndex((r) => r.state === "waiting");
        if (nextWaitingIdx === -1) return prev;
        return prev.map((r, i) =>
          i === nextWaitingIdx ? { ...r, state: "searching" } : r
        );
      });
    }, 900);

    try {
      const res = await searchLeads(
        {
          workspaceId,
          offer: profile.offer,
          niche: useNiches.join(", "),
          clientTypes: useClientTypes,
          platforms: activePlatforms,
          country: useCountries[0] || "all",
          countries: useCountries,
          excludedCountries: useExcluded,
          city: useCity.trim(),
          count: useCount,
          saveToCrm: true,
        },
        controller.signal
      );

      window.clearInterval(timer);

      const statsMap = new Map(
        (res.sourceStats ?? []).map((s) => [s.platform, s])
      );

      setProgressRows((prev) =>
        prev.map((row) => {
          if (row.state === "warning") return row;
          const stat = statsMap.get(row.platform);
          if (stat?.warning) {
            return {
              ...row,
              state: "warning",
              message: stat.warning,
            };
          }
          return {
            ...row,
            state: "done",
            count: stat?.kept ?? 0,
          };
        })
      );

      setLastResult(res);
      setPreviewLeads(res.leads);
      setAddedIds(new Set());
      if (FEATURE_REVIEW_BEFORE_SAVE && res.reviewRequired) {
        queryClient.invalidateQueries({ queryKey: ["pending-leads"] });
        if (res.leads.length > 0) {
          const runId = res.searchRunId || "";
          notifyNewSearchResults(runId);
          notify(`${res.leads.length} leads found. Review`, "success", {
            label: "Review",
            onClick: () => openReviewModal(runId || null),
          });
          try {
            if (
              localStorage.getItem("nicheleads:browser-notify") === "true" &&
              typeof Notification !== "undefined" &&
              Notification.permission === "granted"
            ) {
              new Notification("NicheLeads", {
                body: `${res.leads.length} leads found. Review before saving.`,
              });
            }
          } catch {
            // ignore notification errors
          }
        }
      } else {
        resetFilters();
        queryClient.invalidateQueries({ queryKey: ["leads"] });
        queryClient.invalidateQueries({ queryKey: ["overview"] });
      }
    } catch (err) {
      window.clearInterval(timer);
      if ((err as Error)?.name === "AbortError") {
        setSearchError("Search cancelled.");
        setProgressRows([]);
      } else {
        setSearchError(
          err instanceof Error ? err.message : "Search failed. Please retry."
        );
      }
    } finally {
      setIsSearching(false);
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
  };

  const handleBroadenSearch = () => {
    const broadenedNiches = niches.slice(0, 2);
    setNiches(broadenedNiches);
    setCountries([]);
    setCity("");
    runSearch({
      niches: broadenedNiches,
      countries: [],
      city: "",
    });
  };

  const handleAddOne = async (lead: Lead) => {
    setSavingId(lead.id);
    try {
      await saveLeadsToCrm([lead], workspaceId);
      setAddedIds((prev) => new Set(prev).add(lead.id));
      resetFilters();
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
      notify(`Added "${lead.name}" to Leads CRM`);
    } catch (err) {
      notify(
        err instanceof Error ? err.message : "Failed to add lead to Leads CRM",
        "error"
      );
    } finally {
      setSavingId(null);
    }
  };

  const handleSkipOne = (id: string) => {
    setPreviewLeads((prev) => prev.filter((l) => l.id !== id));
  };

  const handleAddAll = async () => {
    const remaining = previewLeads.filter((l) => !addedIds.has(l.id));
    if (remaining.length === 0) return;

    setSavingAll(true);
    try {
      const res = await saveLeadsToCrm(remaining, workspaceId);
      setAddedIds((prev) => {
        const next = new Set(prev);
        for (const l of remaining) next.add(l.id);
        return next;
      });
      resetFilters();
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
      notify(
        `Added ${res.insertedCount} leads to Leads CRM (${res.updatedCount} updated)`
      );
    } catch (err) {
      notify(
        err instanceof Error ? err.message : "Failed to save leads to Leads CRM",
        "error"
      );
    } finally {
      setSavingAll(false);
    }
  };

  const unaddedCount = previewLeads.filter((l) => !addedIds.has(l.id)).length;

  const summaryRows = React.useMemo(
    () => [
      {
        label: "Niches",
        value: niches.length > 0 ? niches.join(", ") : "None selected",
        stepId: "step-niches",
      },
      {
        label: "Client types",
        value:
          clientTypes.length > 0
            ? clientTypes.map((t) => LEAD_TYPE_LABELS[t]).join(", ")
            : "None selected",
        stepId: "step-client-types",
      },
      {
        label: "Countries",
        value:
          countries.length === 0
            ? `All countries${
                excludedCountries.length > 0
                  ? ` (excluding ${excludedCountries.length})`
                  : ""
              }`
            : `${countries.length} ${
                countries.length === 1 ? "country" : "countries"
              }${
                excludedCountries.length > 0
                  ? ` (excluding ${excludedCountries.length})`
                  : ""
              }${city.trim() ? ` · ${city.trim()}` : ""}`,
        stepId: "step-where",
      },
      {
        label: "Sources",
        value: activePlatformLabels || "None selected",
        stepId: "step-sources",
      },
      {
        label: "Leads",
        value: `${count} leads`,
        stepId: "step-count",
      },
    ],
    [
      activePlatformLabels,
      city,
      clientTypes,
      count,
      countries.length,
      excludedCountries.length,
      niches,
    ]
  );

  const estimatedTime = React.useMemo(
    () => estimateSeconds(activePlatforms.length, count),
    [activePlatforms.length, count]
  );

  return (
    <div className="space-y-6">
      {lastSavedSearch && !isSearching && !lastResult && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-gray-200 bg-white px-4 py-2.5 text-xs dark:border-neutral-800 dark:bg-neutral-900">
          <span className="text-gray-600 dark:text-gray-300">
            Last search: {lastSavedSearch.niches.slice(0, 3).join(", ")}
            {lastSavedSearch.niches.length > 3 ? "…" : ""} ·{" "}
            {lastSavedSearch.count} leads
          </span>
          <button
            type="button"
            onClick={() => applySavedState(lastSavedSearch)}
            className="min-h-[44px] sm:min-h-0 font-medium text-indigo-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 rounded px-1 dark:text-indigo-400 cursor-pointer"
          >
            Use last search
          </button>
        </div>
      )}

      {/* Progress / Result panel */}
      {(isSearching || progressRows.length > 0 || lastResult || searchError) && (
        <section
          aria-live="polite"
          className="max-w-[720px] space-y-4 rounded-[8px] border border-gray-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900"
        >
          {isSearching && (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                <Loader2 className="h-4 w-4 animate-spin text-indigo-600" aria-hidden="true" />
                <span>Searching sources...</span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCancel}
                className="min-h-[44px] sm:min-h-[32px]"
              >
                Cancel
              </Button>
            </div>
          )}

          {searchError && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {searchError}
            </p>
          )}

          {progressRows.length > 0 && (
            <ul className="divide-y divide-gray-100 text-xs dark:divide-neutral-800">
              {progressRows.map((row) => (
                <li
                  key={row.platform}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <span className="font-medium text-gray-800 dark:text-gray-200">
                    {row.label}
                  </span>
                  <span className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                    {row.state === "waiting" && (
                      <>
                        <Clock className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
                        <span>waiting</span>
                      </>
                    )}
                    {row.state === "searching" && (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-600" aria-hidden="true" />
                        <span>searching</span>
                      </>
                    )}
                    {row.state === "done" && (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-600" aria-hidden="true" />
                        <span className="text-gray-900 dark:text-gray-100">
                          {row.count ?? 0} found
                        </span>
                      </>
                    )}
                    {row.state === "warning" && (
                      <>
                        <XCircle className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
                        <span>{row.message || "skipped"}</span>
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {lastResult && !isSearching && (
            <div className="space-y-3 border-t border-gray-200 pt-3 dark:border-neutral-800">
              {lastResult.leads.length === 0 ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    No leads found. Try more countries or fewer niches.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleBroadenSearch}
                    className="min-h-[44px] sm:min-h-[32px]"
                  >
                    Broaden search
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {FEATURE_REVIEW_BEFORE_SAVE && lastResult.reviewRequired
                      ? `Found ${lastResult.pendingCount ?? previewLeads.length} leads ready for review`
                      : `Added ${lastResult.insertedCount} new leads, ${lastResult.updatedCount} duplicates skipped`}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {FEATURE_REVIEW_BEFORE_SAVE && lastResult.reviewRequired ? (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() =>
                          openReviewModal(lastResult.searchRunId || null)
                        }
                        className="min-h-[44px] sm:min-h-[32px]"
                      >
                        Review leads
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => router.push("/leads")}
                        className="min-h-[44px] sm:min-h-[32px]"
                      >
                        View leads
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setLastResult(null);
                        setPreviewLeads([]);
                        setProgressRows([]);
                      }}
                      className="min-h-[44px] sm:min-h-[32px]"
                    >
                      New search
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Main layout: 720px steps column + 320px sticky summary */}
      <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            runSearch();
          }}
          noValidate
          className="min-w-0 flex-1 max-w-[720px] space-y-8"
        >
          {/* Step 1: What do you do? */}
          <section
            id="step-niches"
            className="scroll-mt-16 space-y-3 rounded-[8px] border border-gray-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Step 1: What do you do?
              </h2>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                Add up to 8 niches or content styles you edit for.
              </p>
            </div>

            <TagInput
              id="search-niche"
              values={niches}
              onChange={setNiches}
              suggestions={NICHE_SUGGESTIONS}
              maxTags={8}
              disabled={isSearching}
              ariaLabel="Niches"
            />
          </section>

          {/* Step 2: Who do you want as clients? */}
          <section
            id="step-client-types"
            className="scroll-mt-16 space-y-3 rounded-[8px] border border-gray-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Step 2: Who do you want as clients?
                </h2>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  Choose the buyer profiles to target.
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <button
                  type="button"
                  disabled={isSearching}
                  onClick={() =>
                    setClientTypes(CLIENT_TYPE_OPTIONS.map((o) => o.value))
                  }
                  className="font-medium text-indigo-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 rounded px-1 dark:text-indigo-400 cursor-pointer"
                >
                  Select all
                </button>
                <button
                  type="button"
                  disabled={isSearching}
                  onClick={() => setClientTypes([])}
                  className="font-medium text-gray-500 hover:text-gray-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 rounded px-1 dark:text-gray-400 dark:hover:text-gray-200 cursor-pointer"
                >
                  Clear
                </button>
              </div>
            </div>

            <div
              role="group"
              aria-label="Client types"
              className="grid grid-cols-1 gap-2 sm:grid-cols-2"
            >
              {CLIENT_TYPE_OPTIONS.map((opt) => {
                const selected = clientTypes.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={selected}
                    disabled={isSearching}
                    onClick={() =>
                      setClientTypes((prev) =>
                        prev.includes(opt.value)
                          ? prev.filter((x) => x !== opt.value)
                          : [...prev, opt.value]
                      )
                    }
                    className={cn(
                      "flex min-h-[44px] flex-col items-start rounded-[8px] border p-3 text-left transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600",
                      selected
                        ? "border-indigo-600 bg-indigo-50/40 dark:border-indigo-500 dark:bg-indigo-950/20"
                        : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/60 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700",
                      isSearching ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                    )}
                  >
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {opt.label}
                    </span>
                    <span className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                      {opt.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Step 3: Where? */}
          <section
            id="step-where"
            className="scroll-mt-16 space-y-4 rounded-[8px] border border-gray-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Step 3: Where?
              </h2>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                Pick target countries or leave empty to search worldwide.
              </p>
            </div>

            {/* Quick presets */}
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                {
                  label: "Europe & USA",
                  items: profile.countries,
                },
                {
                  label: "Gulf & Middle East",
                  items: GULF_MIDDLE_EAST,
                },
                {
                  label: "USA only",
                  items: ["United States"],
                },
                {
                  label: "Worldwide",
                  items: [],
                },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  disabled={isSearching}
                  onClick={() => applyCountryPreset(preset.items)}
                  className="inline-flex min-h-[44px] sm:min-h-[28px] items-center rounded-[6px] border border-gray-200 bg-gray-50 px-2.5 text-xs font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 dark:border-neutral-800 dark:bg-neutral-950 dark:text-gray-300 dark:hover:bg-neutral-800 cursor-pointer"
                >
                  {preset.label}
                </button>
              ))}
              {prevCountriesUndo !== null && (
                <button
                  type="button"
                  onClick={handleUndoCountries}
                  className="min-h-[44px] sm:min-h-[28px] px-2 text-xs font-medium text-indigo-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 rounded dark:text-indigo-400 cursor-pointer"
                >
                  Undo
                </button>
              )}
            </div>

            <div className="space-y-2">
              <MultiSelectPopover
                id="search-countries"
                items={SELECTABLE_COUNTRIES}
                selected={countries}
                onChange={(next) => {
                  setPrevCountriesUndo(null);
                  setCountries(next);
                }}
                placeholder="All countries"
                itemNoun="selected"
                regions={COUNTRY_REGIONS}
                blockedItems={excludedCountries}
                blockedMessage="This country is in your exclude list."
                open={countriesOpen}
                onOpenChange={setCountriesOpen}
                disabled={isSearching}
                ariaLabel="Countries"
              />

              <p className="text-xs text-gray-500 dark:text-gray-400">
                {countries.length === 0
                  ? "All countries selected"
                  : `${countries.length} ${
                      countries.length === 1 ? "country" : "countries"
                    } selected`}
              </p>

              <TagList
                items={countries}
                maxVisible={6}
                onRemove={(country) =>
                  setCountries((prev) => prev.filter((c) => c !== country))
                }
                onOverflowClick={() => setCountriesOpen(true)}
                disabled={isSearching}
              />
            </div>

            {/* Collapsible Exclude countries */}
            <div className="border-t border-gray-100 pt-3 dark:border-neutral-800">
              <button
                type="button"
                aria-expanded={showExcludes}
                onClick={() => setShowExcludes((v) => !v)}
                className="inline-flex min-h-[44px] sm:min-h-0 items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 rounded px-1 dark:text-gray-400 dark:hover:text-gray-200 cursor-pointer"
              >
                {showExcludes ? (
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>Exclude countries ({excludedCountries.length})</span>
              </button>

              {showExcludes && (
                <div className="mt-2.5 space-y-2">
                  <MultiSelectPopover
                    id="search-exclude-countries"
                    items={SELECTABLE_COUNTRIES}
                    selected={excludedCountries}
                    onChange={setExcludedCountries}
                    placeholder="None excluded"
                    itemNoun="excluded"
                    regions={COUNTRY_REGIONS}
                    blockedItems={countries}
                    blockedMessage="This country is already in your target list."
                    open={excludedOpen}
                    onOpenChange={setExcludedOpen}
                    disabled={isSearching}
                    ariaLabel="Exclude countries"
                  />
                  <TagList
                    items={excludedCountries}
                    maxVisible={6}
                    variant="exclude"
                    onRemove={(country) =>
                      setExcludedCountries((prev) =>
                        prev.filter((c) => c !== country)
                      )
                    }
                    onOverflowClick={() => setExcludedOpen(true)}
                    disabled={isSearching}
                  />
                </div>
              )}
            </div>

            {/* City */}
            <div className="space-y-1.5 border-t border-gray-100 pt-3 dark:border-neutral-800">
              <label
                htmlFor="search-city"
                className="block text-xs font-medium text-gray-600 dark:text-gray-400"
              >
                City
              </label>
              <Input
                id="search-city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. London, Dubai, New York"
                disabled={isSearching}
                className="h-9 rounded-[8px] border-gray-200 text-sm focus-visible:ring-indigo-600"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Optional. Narrows results to one city.
              </p>
            </div>
          </section>

          {/* Sources */}
          <section
            id="step-sources"
            className="scroll-mt-16 space-y-3 rounded-[8px] border border-gray-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Sources
              </h2>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                Choose a preset or pick sources manually.
              </p>
            </div>

            <PresetCards
              options={SOURCE_PRESET_OPTIONS}
              value={sourceMode}
              onChange={setSourceMode}
              disabled={isSearching}
              ariaLabel="Source presets"
            />

            {sourceMode === "custom" && (
              <div
                role="group"
                aria-label="Custom sources"
                className="flex flex-wrap gap-2 pt-1"
              >
                {PLATFORM_OPTIONS.map((opt) => {
                  const configured = isSourceConfigured(opt.value);
                  return (
                    <OptionChip
                      key={opt.value}
                      label={opt.label}
                      selected={configured && customPlatforms.includes(opt.value)}
                      disabled={isSearching || !configured}
                      onToggle={() => {
                        if (!configured) return;
                        setCustomPlatforms((prev) =>
                          prev.includes(opt.value)
                            ? prev.filter((x) => x !== opt.value)
                            : [...prev, opt.value]
                        );
                      }}
                    />
                  );
                })}
              </div>
            )}

            <p className="text-xs text-gray-600 dark:text-gray-300">
              Searching: {activePlatformLabels || "No sources selected"}
            </p>

            {unavailablePlatforms.length > 0 && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {unavailablePlatforms
                  .map((p) => `${p.label} is off: API key missing`)
                  .join(" · ")}{" "}
                <Link
                  href="/settings"
                  className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  Fix in Settings
                </Link>
              </p>
            )}
          </section>

          {/* Step 4: How many leads? */}
          <section
            id="step-count"
            className="scroll-mt-16 space-y-3 rounded-[8px] border border-gray-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Step 4: How many leads?
              </h2>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                More leads take longer. 50 usually takes 30 to 60 seconds.
              </p>
            </div>

            <SegmentedControl
              ariaLabel="Number of leads"
              options={LEAD_COUNT_OPTIONS}
              value={count}
              onChange={(val) => setCount(val)}
              disabled={isSearching}
            />
          </section>
        </form>

        {/* Right sticky summary card + Mobile bottom bar */}
        <SearchSummary
          rows={summaryRows}
          estimatedTime={estimatedTime}
          disabledReason={disabledReason}
          isSubmitting={isSearching}
          onEditStep={scrollToStep}
          onReset={handleReset}
          onSavePreset={handleSaveAsPreset}
          onSaveSearch={
            FEATURE_AUTOPILOT
              ? () => {
                  setSaveName(niches.slice(0, 2).join(", ") || "Saved search");
                  setSaveSearchOpen(true);
                }
              : undefined
          }
          onSubmit={() => runSearch()}
        />
      </div>

      {FEATURE_AUTOPILOT && saveSearchOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Save this search"
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4"
        >
          <div className="w-full max-w-md rounded-[8px] border border-gray-200 bg-white p-5 space-y-4 dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Save this search
              </h3>
              <button
                type="button"
                onClick={() => setSaveSearchOpen(false)}
                className="text-xs text-gray-500 hover:text-gray-900 dark:text-gray-400 cursor-pointer"
              >
                Close
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!saveName.trim()) return;
                setSavingSearch(true);
                try {
                  await createSavedSearch({
                    workspaceId,
                    name: saveName.trim(),
                    params: {
                      niche: niches.join(", "),
                      clientTypes,
                      platforms: activePlatforms,
                      country: countries[0] || "all",
                      countries,
                      excludedCountries,
                      city: city.trim(),
                      count,
                      offer: profile.offer,
                    },
                    schedule: saveSchedule,
                    runAtHour: Math.max(
                      0,
                      Math.min(23, Number(saveHour) || 7)
                    ),
                    timezone:
                      Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
                    minScore: Math.max(
                      0,
                      Math.min(100, Number(saveMinScore) || 75)
                    ),
                    maxLeadsPerRun: 25,
                    digestEmail: saveDigestEmail.trim() || undefined,
                  });
                  queryClient.invalidateQueries({
                    queryKey: ["saved-searches"],
                  });
                  queryClient.invalidateQueries({ queryKey: ["overview"] });
                  setSaveSearchOpen(false);
                  notify("Search saved to Autopilot");
                } catch (err) {
                  notify(
                    err instanceof Error
                      ? err.message
                      : "Failed to save search",
                    "error"
                  );
                } finally {
                  setSavingSearch(false);
                }
              }}
              className="space-y-3 text-xs"
            >
              <div>
                <label className="block text-gray-500 mb-1">Name</label>
                <Input
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="e.g. Daily Fashion & Creators"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-500 mb-1">Schedule</label>
                  <select
                    value={saveSchedule}
                    onChange={(e) =>
                      setSaveSchedule(
                        e.target.value as "off" | "daily" | "weekly"
                      )
                    }
                    className="h-9 w-full rounded-[8px] border border-gray-200 bg-white px-2.5 text-sm dark:border-neutral-800 dark:bg-neutral-950"
                  >
                    <option value="off">Off</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </div>
                <div>
                  <label className="block text-gray-500 mb-1">
                    Run hour (0–23 UTC)
                  </label>
                  <Input
                    type="number"
                    min={0}
                    max={23}
                    value={saveHour}
                    onChange={(e) => setSaveHour(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-500 mb-1">
                    Minimum score
                  </label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={saveMinScore}
                    onChange={(e) => setSaveMinScore(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-gray-500 mb-1">
                    Digest email (optional)
                  </label>
                  <Input
                    type="email"
                    value={saveDigestEmail}
                    onChange={(e) => setSaveDigestEmail(e.target.value)}
                    placeholder="you@domain.com"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSaveSearchOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={savingSearch}>
                  {savingSearch ? "Saving..." : "Save search"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Fetched leads popup modal (flat list, no grouping, add to Leads CRM) */}
      {resultsModalOpen && lastResult && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Fetched leads"
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4"
        >
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-[8px] border border-gray-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-5 py-3.5 dark:border-neutral-800">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Fetched leads ({previewLeads.length})
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Select leads to add to Leads CRM.
                  {addedIds.size > 0 && ` ${addedIds.size} added so far.`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {unaddedCount > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleAddAll}
                    disabled={savingAll}
                    className="min-h-[44px] sm:min-h-[32px]"
                  >
                    {savingAll ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Plus className="h-3.5 w-3.5" />
                    )}
                    Add all to Leads CRM ({unaddedCount})
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setResultsModalOpen(false);
                    router.push("/leads");
                  }}
                  className="min-h-[44px] sm:min-h-[32px]"
                >
                  Open Leads CRM
                </Button>
                <button
                  type="button"
                  aria-label="Close fetched leads"
                  onClick={() => setResultsModalOpen(false)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-neutral-800 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="hover-thin-scrollbar flex-1 overflow-y-auto divide-y divide-gray-200 dark:divide-neutral-800">
              {previewLeads.length === 0 ? (
                <p className="p-6 text-center text-xs text-gray-500 dark:text-gray-400">
                  No leads remaining in this list.
                </p>
              ) : (
                previewLeads.map((lead) => {
                  const isAdded = addedIds.has(lead.id);
                  const isSaving = savingId === lead.id;

                  return (
                    <div
                      key={lead.id}
                      className={cn(
                        "flex flex-wrap items-start justify-between gap-3 px-5 py-3.5 text-xs transition-colors",
                        isAdded && "bg-green-50/40 dark:bg-green-950/10"
                      )}
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                            {lead.name}
                          </span>
                          <ScoreBadge score={lead.score} />
                          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-700 dark:bg-neutral-800 dark:text-gray-300">
                            {lead.sourcePlatform
                              ? PLATFORM_LABELS[lead.sourcePlatform] ||
                                lead.sourcePlatform
                              : "Web"}
                          </span>
                          <span className="text-[11px] text-gray-500 dark:text-gray-400">
                            {LEAD_TYPE_LABELS[lead.type] || lead.type} ·{" "}
                            {[lead.city, lead.country]
                              .filter((v) => v && v !== "Unknown")
                              .join(", ") || "Global"}
                          </span>
                        </div>

                        {lead.whyThisLead && (
                          <p className="text-gray-600 dark:text-gray-300">
                            {lead.whyThisLead}
                          </p>
                        )}

                        {lead.sourceSnippet && (
                          <p className="line-clamp-2 text-[11px] text-gray-500 dark:text-gray-400">
                            {lead.sourceSnippet}
                          </p>
                        )}

                        <div className="flex flex-wrap items-center gap-3 pt-0.5 text-[11px] text-gray-600 dark:text-gray-300">
                          {lead.email && <span>Email: {lead.email}</span>}
                          {lead.whatsapp && (
                            <span>WhatsApp: {lead.whatsapp}</span>
                          )}
                          {lead.instagram && <span>IG: {lead.instagram}</span>}
                          {lead.sourceUrl && (
                            <a
                              href={lead.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-indigo-600 hover:underline dark:text-indigo-400"
                            >
                              View source
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5">
                        {isAdded ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled
                            className="border-green-300 text-green-700 dark:border-green-800 dark:text-green-400"
                          >
                            <Check className="h-3.5 w-3.5" />
                            Added
                          </Button>
                        ) : (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => handleAddOne(lead)}
                              disabled={isSaving || savingAll}
                              className="min-h-[44px] sm:min-h-[32px]"
                            >
                              {isSaving ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Plus className="h-3.5 w-3.5" />
                              )}
                              Add to Leads CRM
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => handleSkipOne(lead.id)}
                              disabled={isSaving || savingAll}
                              aria-label={`Skip ${lead.name}`}
                              className="min-h-[44px] min-w-[44px] sm:min-h-[32px] sm:min-w-0"
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
