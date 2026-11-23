"use client";

import * as React from "react";
import Link from "next/link";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnOrderState,
  type VisibilityState,
} from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  Columns3,
  Download,
  ExternalLink,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import {
  bulkLeadsAction,
  createSavedView,
  deleteSavedView,
  DuplicateLeadError,
  exportLeadsCsv,
  getLeadsPage,
  getSavedViews,
  updateLead,
} from "@/lib/api";
import { FEATURE_AUTOPILOT, FEATURE_HOOKS } from "@/lib/config";
import { useLeadsStore } from "@/lib/store";
import {
  ALL_LEAD_STATUSES,
  buildExternalUrl,
  buildInstagramUrl,
  cn,
  formatFollowers,
  LEAD_STATUS_LABELS,
  LEAD_TYPE_LABELS,
  PLATFORM_LABELS,
  STATUS_DOT_COLORS,
} from "@/lib/utils";
import type {
  Lead,
  LeadPlatform,
  LeadStatus,
  LeadType,
  SavedView,
} from "@/types/lead";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ScoreBadge } from "@/components/score-badge";
import { LeadDetailDrawer } from "@/components/lead-detail-drawer";
import { AddLeadModal } from "@/components/add-lead-modal";
import { useToast } from "@/components/providers";

const columnHelper = createColumnHelper<Lead>();

const DEFAULT_COLUMN_ORDER = [
  "select",
  "name",
  "sourcePlatform",
  "type",
  "country",
  "city",
  "score",
  "status",
  "email",
  "whatsapp",
  "instagram",
  "website",
  "sourceUrl",
  "followers",
  "postsPerWeek",
  "budgetSignal",
  "lastContactedAt",
  "nextFollowUpAt",
  "notes",
  "tags",
  "hookContext",
  "createdAt",
];

const DEFAULT_VISIBILITY: VisibilityState = {
  city: false,
  website: false,
  followers: false,
  postsPerWeek: false,
  budgetSignal: false,
  lastContactedAt: false,
  nextFollowUpAt: false,
  notes: false,
  tags: false,
  hookContext: false,
  createdAt: false,
};

const COLUMN_LABELS: Record<string, string> = {
  name: "Name",
  sourcePlatform: "Source",
  type: "Type",
  country: "Country",
  city: "City",
  score: "Score",
  status: "Status",
  email: "Email",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  website: "Website",
  sourceUrl: "Source link",
  followers: "Followers",
  postsPerWeek: "Posts/week",
  budgetSignal: "Budget",
  lastContactedAt: "Last contacted",
  nextFollowUpAt: "Next follow-up",
  notes: "Owner notes",
  tags: "Tags",
  hookContext: "Hook",
  createdAt: "Added",
};

function InlineTextCell({
  value,
  placeholder,
  type = "text",
  scrollable = false,
  onSave,
}: {
  value: string;
  placeholder?: string;
  type?: "text" | "date" | "number";
  scrollable?: boolean;
  onSave: (next: string) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);

  React.useEffect(() => {
    setDraft(value);
  }, [value]);

  if (!editing) {
    return (
      <div
        className={cn(
          "w-full min-w-0",
          scrollable ? "cell-auto-scroll pb-0.5" : "overflow-hidden"
        )}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
          className={cn(
            "min-h-[24px] text-left text-xs text-gray-800 hover:bg-gray-100 rounded px-1 -mx-1 dark:text-gray-200 dark:hover:bg-neutral-800 cursor-text",
            scrollable ? "inline-block whitespace-nowrap" : "block w-full truncate"
          )}
          title={value || placeholder || "Click to edit"}
        >
          {value || <span className="text-gray-400">—</span>}
        </button>
      </div>
    );
  }

  return (
    <input
      autoFocus
      type={type}
      value={draft}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setEditing(false);
        if (draft !== value) onSave(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          setEditing(false);
          if (draft !== value) onSave(draft);
        } else if (e.key === "Escape") {
          setDraft(value);
          setEditing(false);
        }
      }}
      className="h-7 w-full min-w-[90px] rounded border border-indigo-600 bg-white px-1.5 text-xs text-gray-900 focus:outline-none dark:bg-neutral-950 dark:text-gray-100"
    />
  );
}

function InlineTagsCell({
  tags,
  onSave,
}: {
  tags: string[];
  onSave: (next: string[]) => void;
}) {
  const [adding, setAdding] = React.useState(false);
  const [input, setInput] = React.useState("");

  const addTag = () => {
    const t = input.trim();
    if (t && !tags.includes(t)) {
      onSave([...tags, t]);
    }
    setInput("");
    setAdding(false);
  };

  return (
    <div
      className="flex flex-wrap items-center gap-1"
      onClick={(e) => e.stopPropagation()}
    >
      {tags.map((t) => (
        <span
          key={t}
          className="inline-flex items-center gap-1 rounded border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-gray-300"
        >
          {t}
          <button
            type="button"
            aria-label={`Remove tag ${t}`}
            onClick={() => onSave(tags.filter((x) => x !== t))}
            className="text-gray-400 hover:text-gray-700 cursor-pointer"
          >
            ×
          </button>
        </span>
      ))}
      {adding ? (
        <input
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onBlur={addTag}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag();
            } else if (e.key === "Escape") {
              setInput("");
              setAdding(false);
            }
          }}
          placeholder="tag..."
          className="h-6 w-16 rounded border border-indigo-600 bg-white px-1 text-[11px] focus:outline-none dark:bg-neutral-950"
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded px-1 text-[11px] text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-neutral-800 cursor-pointer"
        >
          +tag
        </button>
      )}
    </div>
  );
}

export function LeadsTableView({ savedOnly = false }: { savedOnly?: boolean }) {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const {
    workspaceId,
    selectedIds,
    toggleSelectId,
    setSelectedIds,
    clearSelectedIds,
    openDrawer,
    filters,
    setTypeFilter,
    setPlatformFilter,
    setCountryFilter,
    setTagFilter,
    setMinScore,
    setMaxScore,
    setHasWhatsApp,
    setHasEmail,
    setDateFrom,
    setDateTo,
    setStatusFilter,
    setQualityOnly,
    setShowLowScore,
    setSort,
    setPage,
    applyFilters,
    resetFilters,
  } = useLeadsStore();

  const [addModalOpen, setAddModalOpen] = React.useState(false);
  const [columnsMenuOpen, setColumnsMenuOpen] = React.useState(false);
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>(DEFAULT_VISIBILITY);
  const [columnOrder, setColumnOrder] =
    React.useState<ColumnOrderState>(DEFAULT_COLUMN_ORDER);
  const [bulkTagInput, setBulkTagInput] = React.useState("");
  const [bulkFollowUp, setBulkFollowUp] = React.useState("");
  const [saveViewName, setSaveViewName] = React.useState("");
  const [showSaveView, setShowSaveView] = React.useState(false);
  const [duplicateConflict, setDuplicateConflict] = React.useState<{
    leadId: string;
    duplicateId: string;
    duplicateName: string;
    patch: Record<string, unknown>;
  } | null>(null);

  const queryFilters = React.useMemo(
    () => ({ ...filters, workspaceId, savedOnly }),
    [filters, workspaceId, savedOnly]
  );

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["leads", queryFilters],
    queryFn: () => getLeadsPage(queryFilters),
  });

  const { data: savedViews = [] } = useQuery({
    queryKey: ["views", workspaceId],
    queryFn: () => getSavedViews(workspaceId),
  });

  const leads = React.useMemo(() => data?.leads ?? [], [data?.leads]);
  const total = data?.total ?? 0;
  const page = data?.page ?? 1;
  const totalPages = data?.totalPages ?? 1;

  // Automatically hide any optional column where every lead in the current list has an empty/null value
  const effectiveColumnVisibility = React.useMemo<VisibilityState>(() => {
    if (leads.length === 0) return columnVisibility;

    const hasAnyValue = (check: (l: Lead) => boolean) => leads.some(check);

    const autoHidden: VisibilityState = {};
    const fieldChecks: Record<string, (l: Lead) => boolean> = {
      city: (l) => Boolean(l.city?.trim() && l.city !== "Unknown"),
      country: (l) => Boolean(l.country?.trim() && l.country !== "Unknown"),
      email: (l) => Boolean(l.email?.trim()),
      whatsapp: (l) => Boolean(l.whatsapp?.trim()),
      instagram: (l) => Boolean(l.instagram?.trim()),
      website: (l) => Boolean(l.website?.trim()),
      sourceUrl: (l) => Boolean(l.sourceUrl?.trim()),
      followers: (l) => typeof l.followers === "number" && l.followers > 0,
      postsPerWeek: (l) => typeof l.postsPerWeek === "number" && l.postsPerWeek > 0,
      budgetSignal: (l) => Boolean(l.budgetSignal?.trim()),
      lastContactedAt: (l) => Boolean(l.lastContactedAt?.trim()),
      nextFollowUpAt: (l) => Boolean(l.nextFollowUpAt?.trim()),
      notes: (l) => Boolean(l.notes?.trim()),
      tags: (l) => Array.isArray(l.tags) && l.tags.length > 0,
    };

    for (const [colId, fn] of Object.entries(fieldChecks)) {
      if (!hasAnyValue(fn)) {
        autoHidden[colId] = false;
      }
    }

    return {
      ...columnVisibility,
      ...autoHidden,
    };
  }, [columnVisibility, leads]);

  const patchMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      updateLead(id, patch),
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: ["leads", queryFilters] });
      const prev = queryClient.getQueryData(["leads", queryFilters]);
      queryClient.setQueryData(
        ["leads", queryFilters],
        (old: typeof data | undefined) => {
          if (!old) return old;
          return {
            ...old,
            leads: old.leads.map((l) =>
              l.id === id ? { ...l, ...(patch as Partial<Lead>) } : l
            ),
          };
        }
      );
      return { prev };
    },
    onSuccess: () => {
      setDuplicateConflict(null);
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      notify("Saved");
    },
    onError: (err, vars, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(["leads", queryFilters], ctx.prev);
      }
      if (err instanceof DuplicateLeadError) {
        setDuplicateConflict({
          leadId: vars.id,
          duplicateId: err.duplicate.id,
          duplicateName: err.duplicate.name,
          patch: vars.patch,
        });
      } else {
        notify(err instanceof Error ? err.message : "Update failed", "error");
      }
    },
  });

  const bulkMutation = useMutation({
    mutationFn: bulkLeadsAction,
    onSuccess: (res, vars) => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      clearSelectedIds();
      notify(
        vars.action === "delete"
          ? `Deleted ${res.affected} leads`
          : `Updated ${res.affected} leads`
      );
    },
    onError: (err) => {
      notify(err instanceof Error ? err.message : "Bulk action failed", "error");
    },
  });

  const saveViewMutation = useMutation({
    mutationFn: () =>
      createSavedView({
        workspaceId,
        name: saveViewName.trim(),
        filters,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["views", workspaceId] });
      setSaveViewName("");
      setShowSaveView(false);
      notify("View saved");
    },
  });

  const deleteViewMutation = useMutation({
    mutationFn: deleteSavedView,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["views", workspaceId] });
      notify("View deleted");
    },
  });

  const inlineSave = React.useCallback(
    (id: string, patch: Record<string, unknown>) => {
      patchMutation.mutate({ id, patch });
    },
    [patchMutation]
  );

  const allVisibleSelected =
    leads.length > 0 && leads.every((l) => selectedIds.includes(l.id));

  const columns = React.useMemo(
    () => [
      columnHelper.display({
        id: "select",
        size: 36,
        header: () => (
          <input
            type="checkbox"
            aria-label="Select all rows"
            checked={allVisibleSelected}
            onChange={() =>
              allVisibleSelected
                ? clearSelectedIds()
                : setSelectedIds(leads.map((l) => l.id))
            }
            className="h-3.5 w-3.5 rounded border-gray-300 accent-indigo-600 cursor-pointer"
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            aria-label={`Select ${row.original.name}`}
            checked={selectedIds.includes(row.original.id)}
            onClick={(e) => e.stopPropagation()}
            onChange={() => toggleSelectId(row.original.id)}
            className="h-3.5 w-3.5 rounded border-gray-300 accent-indigo-600 cursor-pointer"
          />
        ),
      }),
      columnHelper.accessor("name", {
        header: "Name",
        size: 230,
        cell: ({ row }) => {
          const l = row.original;
          return (
            <div className="flex w-[210px] max-w-[210px] items-center gap-1.5 overflow-hidden">
              {l.sourceUrl && l.hiringSignal && (
                <span title="Verified source with hiring signal">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600" />
                </span>
              )}
              <InlineTextCell
                value={l.name}
                onSave={(v) => v.trim() && inlineSave(l.id, { name: v.trim() })}
              />
            </div>
          );
        },
      }),
      columnHelper.accessor("sourcePlatform", {
        header: "Source",
        size: 95,
        cell: ({ getValue }) => {
          const p = getValue();
          return (
            <span className="text-xs text-gray-600 dark:text-gray-400">
              {p ? PLATFORM_LABELS[p] || p : "Manual"}
            </span>
          );
        },
      }),
      columnHelper.accessor("type", {
        header: "Type",
        size: 120,
        cell: ({ row }) => (
          <select
            aria-label="Lead type"
            value={row.original.type}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) =>
              inlineSave(row.original.id, { type: e.target.value as LeadType })
            }
            className="h-7 rounded border border-transparent bg-transparent text-xs text-gray-700 hover:border-gray-200 focus:border-indigo-600 focus:outline-none dark:text-gray-300 dark:hover:border-neutral-700"
          >
            {Object.entries(LEAD_TYPE_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        ),
      }),
      columnHelper.accessor("country", {
        header: "Country",
        size: 120,
        cell: ({ row }) => (
          <InlineTextCell
            value={row.original.country || ""}
            onSave={(v) => inlineSave(row.original.id, { country: v.trim() || "Unknown" })}
          />
        ),
      }),
      columnHelper.accessor("city", {
        header: "City",
        size: 110,
        cell: ({ row }) => (
          <InlineTextCell
            value={row.original.city || ""}
            onSave={(v) => inlineSave(row.original.id, { city: v.trim() })}
          />
        ),
      }),
      columnHelper.accessor("score", {
        header: "Score",
        size: 72,
        cell: ({ getValue }) => <ScoreBadge score={getValue()} />,
      }),
      columnHelper.accessor("status", {
        header: "Status",
        size: 145,
        cell: ({ row }) => {
          const st = row.original.status;
          const dot = STATUS_DOT_COLORS[st] || "bg-gray-400";
          return (
            <div
              className="inline-flex items-center gap-1.5"
              onClick={(e) => e.stopPropagation()}
            >
              <span className={cn("h-2 w-2 rounded-full shrink-0", dot)} />
              <select
                aria-label="Lead status"
                value={st}
                onChange={(e) =>
                  inlineSave(row.original.id, {
                    status: e.target.value as LeadStatus,
                  })
                }
                className="h-7 rounded border border-transparent bg-transparent text-xs font-medium text-gray-800 hover:border-gray-200 focus:border-indigo-600 focus:outline-none dark:text-gray-200 dark:hover:border-neutral-700"
              >
                {ALL_LEAD_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {LEAD_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
          );
        },
      }),
      columnHelper.accessor("email", {
        header: "Email",
        size: 180,
        cell: ({ row }) => (
          <InlineTextCell
            value={row.original.email || ""}
            placeholder="Add email"
            onSave={(v) => inlineSave(row.original.id, { email: v.trim() })}
          />
        ),
      }),
      columnHelper.accessor("whatsapp", {
        header: "WhatsApp",
        size: 130,
        cell: ({ row }) => (
          <InlineTextCell
            value={row.original.whatsapp || ""}
            placeholder="Add phone"
            onSave={(v) => inlineSave(row.original.id, { whatsapp: v.trim() })}
          />
        ),
      }),
      columnHelper.accessor("instagram", {
        header: "Instagram",
        size: 140,
        cell: ({ row }) => {
          const ig = row.original.instagram || "";
          return (
            <div className="flex items-center gap-1">
              <InlineTextCell
                value={ig.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "@")}
                placeholder="@handle"
                onSave={(v) =>
                  inlineSave(row.original.id, { instagram: v.trim() })
                }
              />
              {ig && (
                <a
                  href={buildInstagramUrl(ig)}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Open Instagram"
                  className="text-gray-400 hover:text-indigo-600"
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          );
        },
      }),
      columnHelper.accessor("website", {
        header: "Website",
        size: 150,
        cell: ({ row }) => (
          <InlineTextCell
            value={row.original.website || ""}
            placeholder="https://..."
            onSave={(v) => inlineSave(row.original.id, { website: v.trim() })}
          />
        ),
      }),
      columnHelper.accessor("sourceUrl", {
        header: "Source link",
        size: 95,
        cell: ({ getValue }) => {
          const url = getValue();
          if (!url) return <span className="text-xs text-gray-400">—</span>;
          return (
            <a
              href={buildExternalUrl(url)}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            >
              Source
              <ExternalLink className="h-3 w-3" />
            </a>
          );
        },
      }),
      columnHelper.accessor("followers", {
        header: "Followers",
        size: 90,
        cell: ({ getValue }) => (
          <span className="text-xs tabular-nums text-gray-600 dark:text-gray-400">
            {formatFollowers(getValue())}
          </span>
        ),
      }),
      columnHelper.accessor("postsPerWeek", {
        header: "Posts/week",
        size: 85,
        cell: ({ row }) => (
          <InlineTextCell
            type="number"
            value={
              row.original.postsPerWeek !== undefined
                ? String(row.original.postsPerWeek)
                : ""
            }
            onSave={(v) =>
              inlineSave(row.original.id, {
                postsPerWeek: v ? Number(v) : null,
              })
            }
          />
        ),
      }),
      columnHelper.accessor("budgetSignal", {
        header: "Budget",
        size: 100,
        cell: ({ row }) => (
          <InlineTextCell
            value={row.original.budgetSignal || ""}
            onSave={(v) =>
              inlineSave(row.original.id, { budgetSignal: v.trim() })
            }
          />
        ),
      }),
      columnHelper.accessor("lastContactedAt", {
        header: "Last contacted",
        size: 110,
        cell: ({ getValue }) => {
          const v = getValue();
          return (
            <span className="text-xs tabular-nums text-gray-500">
              {v ? v.slice(0, 10) : "—"}
            </span>
          );
        },
      }),
      columnHelper.accessor("nextFollowUpAt", {
        header: "Next follow-up",
        size: 125,
        cell: ({ row }) => (
          <InlineTextCell
            type="date"
            value={row.original.nextFollowUpAt?.slice(0, 10) || ""}
            onSave={(v) =>
              inlineSave(row.original.id, { nextFollowUpAt: v || null })
            }
          />
        ),
      }),
      columnHelper.accessor("notes", {
        header: "Owner notes",
        size: 180,
        cell: ({ row }) => (
          <InlineTextCell
            value={row.original.notes || ""}
            placeholder="Add note"
            onSave={(v) => inlineSave(row.original.id, { notes: v })}
          />
        ),
      }),
      columnHelper.accessor("tags", {
        header: "Tags",
        size: 160,
        cell: ({ row }) => (
          <InlineTagsCell
            tags={row.original.tags ?? []}
            onSave={(next) => inlineSave(row.original.id, { tags: next })}
          />
        ),
      }),
      ...(FEATURE_HOOKS
        ? [
            columnHelper.accessor("hookContext", {
              header: "Hook",
              size: 70,
              cell: ({ row }) => {
                const ctx = row.original.hookContext;
                const hasSpecific =
                  Boolean(ctx) &&
                  ctx!.sourceType !== "generic" &&
                  Boolean(ctx!.basedOn);
                return (
                  <span
                    title={
                      hasSpecific
                        ? `Hook: ${ctx!.basedOn}`
                        : "No specific hook context"
                    }
                    className="inline-flex items-center justify-center"
                  >
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full",
                        hasSpecific
                          ? "bg-green-600"
                          : "bg-gray-300 dark:bg-neutral-700"
                      )}
                    />
                  </span>
                );
              },
            }),
          ]
        : []),
      columnHelper.accessor("createdAt", {
        header: "Added",
        size: 95,
        cell: ({ getValue }) => (
          <span className="text-xs tabular-nums text-gray-500">
            {getValue().slice(0, 10)}
          </span>
        ),
      }),
    ],
    [allVisibleSelected, clearSelectedIds, inlineSave, leads, selectedIds, setSelectedIds, toggleSelectId]
  );

  const table = useReactTable({
    data: leads,
    columns,
    state: {
      columnVisibility: effectiveColumnVisibility,
      columnOrder,
    },
    columnResizeMode: "onChange",
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: setColumnOrder,
    getCoreRowModel: getCoreRowModel(),
  });

  const handleExportCsv = async () => {
    try {
      const targetIds =
        selectedIds.length > 0 ? selectedIds : leads.map((l) => l.id);
      const csv = await exportLeadsCsv(targetIds);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "nicheleads-export.csv";
      a.click();
      URL.revokeObjectURL(url);
      notify(`Exported ${targetIds.length} leads`);
    } catch {
      notify("Export failed", "error");
    }
  };

  const moveColumn = (colId: string, dir: -1 | 1) => {
    setColumnOrder((prev) => {
      const idx = prev.indexOf(colId);
      if (idx === -1) return prev;
      const target = idx + dir;
      if (target < 1 || target >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[target]] = [copy[target], copy[idx]];
      return copy;
    });
  };

  const handleRowKeyDown = (
    e: React.KeyboardEvent<HTMLTableRowElement>,
    id: string
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      openDrawer(id);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      (e.currentTarget.nextElementSibling as HTMLElement | null)?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      (e.currentTarget.previousElementSibling as HTMLElement | null)?.focus();
    }
  };

  return (
    <div className="space-y-3">
      {/* Saved Filter Views */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-gray-500">Views:</span>
        <button
          type="button"
          onClick={resetFilters}
          className="rounded-md border border-gray-200 bg-white px-2.5 py-1 font-medium text-gray-700 hover:bg-gray-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-gray-300 cursor-pointer"
        >
          Default
        </button>
        {savedViews.map((v: SavedView) => (
          <span
            key={v.id}
            className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1 dark:border-neutral-800 dark:bg-neutral-900"
          >
            <button
              type="button"
              onClick={() => applyFilters(v.filters)}
              className="font-medium text-gray-700 hover:text-indigo-600 dark:text-gray-300 cursor-pointer"
            >
              {v.name}
            </button>
            <button
              type="button"
              aria-label={`Delete view ${v.name}`}
              onClick={() => deleteViewMutation.mutate(v.id)}
              className="text-gray-400 hover:text-red-600 cursor-pointer"
            >
              ×
            </button>
          </span>
        ))}
        {showSaveView ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (saveViewName.trim()) saveViewMutation.mutate();
            }}
            className="inline-flex items-center gap-1"
          >
            <Input
              value={saveViewName}
              onChange={(e) => setSaveViewName(e.target.value)}
              placeholder="View name..."
              className="h-7 w-36 text-xs"
              autoFocus
            />
            <Button type="submit" size="sm">
              Save
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setShowSaveView(false)}
            >
              Cancel
            </Button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setShowSaveView(true)}
            className="text-indigo-600 hover:underline dark:text-indigo-400 cursor-pointer"
          >
            + Save current view
          </button>
        )}
      </div>

      {/* Filters & Toolbar */}
      <div className="rounded-lg border border-gray-200 bg-white p-3 space-y-2.5 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Filter by status"
            value={filters.status ?? "all"}
            onChange={(e) =>
              setStatusFilter(e.target.value as LeadStatus | "all")
            }
            className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs dark:border-neutral-800 dark:bg-neutral-950"
          >
            <option value="all">All statuses</option>
            {ALL_LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {LEAD_STATUS_LABELS[s]}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by source"
            value={filters.platform ?? "all"}
            onChange={(e) =>
              setPlatformFilter(e.target.value as LeadPlatform | "all")
            }
            className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs dark:border-neutral-800 dark:bg-neutral-950"
          >
            <option value="all">All sources</option>
            {(
              ["linkedin", "youtube", "reddit", "google_cse", "exa", "instagram", "google_places", "manual", "csv_import"] as LeadPlatform[]
            ).map((p) => (
              <option key={p} value={p}>
                {PLATFORM_LABELS[p]}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by type"
            value={filters.type ?? "all"}
            onChange={(e) => setTypeFilter(e.target.value as LeadType | "all")}
            className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs dark:border-neutral-800 dark:bg-neutral-950"
          >
            <option value="all">All types</option>
            {Object.entries(LEAD_TYPE_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>

          <Input
            aria-label="Filter by country"
            value={filters.country === "all" ? "" : filters.country ?? ""}
            onChange={(e) =>
              setCountryFilter(e.target.value.trim() || "all")
            }
            placeholder="Country..."
            className="h-8 w-28 text-xs"
          />

          <Input
            aria-label="Filter by tag"
            value={filters.tag ?? ""}
            onChange={(e) => setTagFilter(e.target.value)}
            placeholder="Tag..."
            className="h-8 w-24 text-xs"
          />

          <div className="flex items-center gap-1 text-xs">
            <span className="text-gray-500">Score</span>
            <Input
              type="number"
              aria-label="Min score"
              value={filters.minScore || ""}
              onChange={(e) => setMinScore(Number(e.target.value) || 0)}
              placeholder="Min"
              className="h-8 w-14 text-xs"
            />
            <span className="text-gray-400">–</span>
            <Input
              type="number"
              aria-label="Max score"
              value={filters.maxScore || ""}
              onChange={(e) => setMaxScore(Number(e.target.value) || 0)}
              placeholder="Max"
              className="h-8 w-14 text-xs"
            />
          </div>

          <Input
            type="date"
            aria-label="Date added from"
            value={filters.dateFrom ?? ""}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-8 w-32 text-xs"
          />
          <Input
            type="date"
            aria-label="Date added to"
            value={filters.dateTo ?? ""}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-8 w-32 text-xs"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-gray-100 dark:border-neutral-800">
          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-700 dark:text-gray-300">
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(filters.hasEmail)}
                onChange={(e) => setHasEmail(e.target.checked)}
                className="h-3.5 w-3.5 accent-indigo-600"
              />
              Has email
            </label>
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(filters.hasWhatsApp)}
                onChange={(e) => setHasWhatsApp(e.target.checked)}
                className="h-3.5 w-3.5 accent-indigo-600"
              />
              Has WhatsApp
            </label>
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(filters.qualityOnly)}
                onChange={(e) => setQualityOnly(e.target.checked)}
                className="h-3.5 w-3.5 accent-indigo-600"
              />
              Contact + source required
            </label>
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(filters.showLowScore)}
                onChange={(e) => setShowLowScore(e.target.checked)}
                className="h-3.5 w-3.5 accent-indigo-600"
              />
              Show low-score (&lt;50)
            </label>
            {FEATURE_AUTOPILOT && (
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(filters.freshToday)}
                  onChange={(e) =>
                    applyFilters({ ...filters, freshToday: e.target.checked })
                  }
                  className="h-3.5 w-3.5 accent-indigo-600"
                />
                Fresh today
              </label>
            )}
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-900 cursor-pointer"
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 relative">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setColumnsMenuOpen((o) => !o)}
            >
              <Columns3 className="h-3.5 w-3.5" />
              Columns
            </Button>

            {columnsMenuOpen && (
              <div className="absolute right-0 top-10 z-30 w-64 rounded-[10px] border border-gray-200 bg-white p-2.5 shadow-md space-y-1 dark:border-neutral-800 dark:bg-neutral-900">
                <div className="flex items-center justify-between px-1 pb-1 border-b border-gray-100 text-xs font-medium dark:border-neutral-800">
                  <span>Columns</span>
                  <button
                    type="button"
                    onClick={() => setColumnsMenuOpen(false)}
                    className="text-gray-400 hover:text-gray-700"
                  >
                    Done
                  </button>
                </div>
                <div className="max-h-64 overflow-y-auto space-y-1">
                  {columnOrder
                    .filter((id) => id !== "select")
                    .map((colId) => {
                      const col = table.getColumn(colId);
                      if (!col) return null;
                      return (
                        <div
                          key={colId}
                          className="flex items-center justify-between gap-2 px-1 py-0.5 text-xs"
                        >
                          <label className="flex items-center gap-2 cursor-pointer flex-1">
                            <input
                              type="checkbox"
                              checked={col.getIsVisible()}
                              onChange={col.getToggleVisibilityHandler()}
                              className="h-3.5 w-3.5 accent-indigo-600"
                            />
                            <span>{COLUMN_LABELS[colId] || colId}</span>
                          </label>
                          <div className="flex gap-1">
                            <button
                              type="button"
                              aria-label={`Move ${colId} up`}
                              onClick={() => moveColumn(colId, -1)}
                              className="p-0.5 text-gray-400 hover:text-gray-700"
                            >
                              <ArrowUp className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              aria-label={`Move ${colId} down`}
                              onClick={() => moveColumn(colId, 1)}
                              className="p-0.5 text-gray-400 hover:text-gray-700"
                            >
                              <ArrowDown className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              disabled={leads.length === 0}
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </Button>

            <Button size="sm" onClick={() => setAddModalOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              Add lead
            </Button>
          </div>
        </div>
      </div>

      {/* Duplicate conflict banner from inline edit */}
      {duplicateConflict && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs dark:border-amber-900 dark:bg-neutral-900">
          <span>
            Duplicate match: <strong>{duplicateConflict.duplicateName}</strong>
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() =>
                patchMutation.mutate({
                  id: duplicateConflict.leadId,
                  patch: {
                    ...duplicateConflict.patch,
                    mergeIntoId: duplicateConflict.duplicateId,
                  },
                })
              }
            >
              Merge
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                patchMutation.mutate({
                  id: duplicateConflict.leadId,
                  patch: { ...duplicateConflict.patch, force: true },
                })
              }
            >
              Keep separate
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDuplicateConflict(null)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Bulk Action Bar */}
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs dark:border-indigo-900 dark:bg-neutral-900">
          <span className="font-medium text-gray-900 dark:text-gray-100">
            {selectedIds.length} selected
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Bulk status change"
              defaultValue=""
              onChange={(e) => {
                if (!e.target.value) return;
                bulkMutation.mutate({
                  ids: selectedIds,
                  action: "status",
                  status: e.target.value as LeadStatus,
                });
                e.target.value = "";
              }}
              className="h-7 rounded border border-gray-200 bg-white px-2 text-xs dark:border-neutral-800 dark:bg-neutral-950"
            >
              <option value="" disabled>
                Set status...
              </option>
              {ALL_LEAD_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {LEAD_STATUS_LABELS[s]}
                </option>
              ))}
            </select>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!bulkTagInput.trim()) return;
                bulkMutation.mutate({
                  ids: selectedIds,
                  action: "add_tag",
                  tag: bulkTagInput.trim(),
                });
                setBulkTagInput("");
              }}
              className="inline-flex items-center gap-1"
            >
              <Input
                value={bulkTagInput}
                onChange={(e) => setBulkTagInput(e.target.value)}
                placeholder="Add tag..."
                className="h-7 w-24 text-xs"
              />
              <Button type="submit" size="sm" variant="outline">
                Tag
              </Button>
            </form>

            <div className="inline-flex items-center gap-1">
              <Input
                type="date"
                value={bulkFollowUp}
                onChange={(e) => setBulkFollowUp(e.target.value)}
                className="h-7 w-32 text-xs"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={!bulkFollowUp}
                onClick={() =>
                  bulkMutation.mutate({
                    ids: selectedIds,
                    action: "follow_up",
                    nextFollowUpAt: bulkFollowUp,
                  })
                }
              >
                Set follow-up
              </Button>
            </div>

            <Button size="sm" variant="outline" onClick={handleExportCsv}>
              Export
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() =>
                bulkMutation.mutate({ ids: selectedIds, action: "delete" })
              }
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-2 dark:border-neutral-800 dark:bg-neutral-900">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-sm text-red-600 space-y-2 dark:border-neutral-800 dark:bg-neutral-900">
          <p>Could not load leads.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      ) : leads.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-10 text-center space-y-3 dark:border-neutral-800 dark:bg-neutral-900">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
            No leads yet. Run a search.
          </p>
          <div className="flex items-center justify-center gap-2">
            <Link href="/search">
              <Button size="sm">Run a search</Button>
            </Link>
            <Button variant="outline" size="sm" onClick={resetFilters}>
              Reset filters
            </Button>
          </div>
        </div>
      ) : (
        <div className="leads-table-wrapper rounded-[10px] border border-gray-200 bg-white dark:border-neutral-800 dark:bg-neutral-900 max-h-[68vh]">
          <table className="leads-responsive-table w-full table-fixed border-collapse text-left text-xs">
            <thead className="sticky top-0 z-20 border-b border-gray-200 bg-gray-50 text-xs font-medium text-gray-500 dark:border-neutral-800 dark:bg-neutral-950 dark:text-gray-400">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((header) => {
                    const colId = header.column.id;
                    const canSort = colId !== "select";
                    const isSorted = filters.sortBy === colId;
                    const colSize = header.getSize();
                    return (
                      <th
                        key={colId}
                        style={{ width: colSize, maxWidth: colSize }}
                        className="relative px-3 py-2.5 select-none whitespace-nowrap overflow-hidden"
                      >
                        {header.isPlaceholder ? null : canSort ? (
                          <button
                            type="button"
                            onClick={() => setSort(colId)}
                            className="inline-flex items-center gap-1 hover:text-gray-900 dark:hover:text-gray-100 cursor-pointer"
                          >
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                            {isSorted ? (
                              filters.sortDir === "asc" ? (
                                <ArrowUp className="h-3 w-3" />
                              ) : (
                                <ArrowDown className="h-3 w-3" />
                              )
                            ) : (
                              <ArrowUpDown className="h-3 w-3 opacity-40" />
                            )}
                          </button>
                        ) : (
                          flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )
                        )}
                        <div
                          onMouseDown={header.getResizeHandler()}
                          onTouchStart={header.getResizeHandler()}
                          className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-indigo-600/40"
                        />
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-neutral-800/80">
              {table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  tabIndex={0}
                  onClick={() => openDrawer(row.original.id)}
                  onKeyDown={(e) => handleRowKeyDown(e, row.original.id)}
                  className={cn(
                    "h-11 hover:bg-gray-50 focus-visible:bg-gray-100 focus-visible:outline-none dark:hover:bg-neutral-800/40 cursor-pointer transition-colors",
                    row.getIsSelected() && "bg-indigo-50/60 dark:bg-indigo-950/30"
                  )}
                >
                  {row.getVisibleCells().map((cell) => {
                    const colSize = cell.column.getSize();
                    const isNumeric =
                      cell.column.id === "score" ||
                      cell.column.id === "followers" ||
                      cell.column.id === "postsPerWeek";
                    return (
                      <td
                        key={cell.id}
                        data-label={COLUMN_LABELS[cell.column.id]}
                        style={{ width: colSize, maxWidth: colSize }}
                        className={cn(
                          "px-3 py-2 align-middle overflow-hidden",
                          isNumeric && "text-right tabular-nums"
                        )}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>
            Showing {(page - 1) * (filters.pageSize ?? 50) + 1}–
            {Math.min(page * (filters.pageSize ?? 50), total)} of {total}
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <span className="px-2 tabular-nums">
              Page {page} of {totalPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <LeadDetailDrawer />
      <AddLeadModal open={addModalOpen} onClose={() => setAddModalOpen(false)} />
    </div>
  );
}
