"use client";

import * as React from "react";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getLeads, updateLead } from "@/lib/api";
import { useLeadsStore } from "@/lib/store";
import {
  cn,
  LEAD_STATUS_LABELS,
  PIPELINE_STATUSES,
  PLATFORM_LABELS,
  STATUS_DOT_COLORS,
} from "@/lib/utils";
import type { Lead, LeadStatus } from "@/types/lead";
import { ScoreBadge } from "@/components/score-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { LeadDetailDrawer } from "@/components/lead-detail-drawer";
import { useToast } from "@/components/providers";

function PipelineCard({
  lead,
  onOpen,
}: {
  lead: Lead;
  onOpen: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: lead.id,
      data: { status: lead.status },
    });

  const style: React.CSSProperties = transform
    ? { transform: CSS.Translate.toString(transform) }
    : {};

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(lead.id)}
      className={cn(
        "rounded-[8px] border border-gray-200 bg-white p-3 text-xs space-y-1.5 cursor-grab active:cursor-grabbing hover:border-gray-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700",
        isDragging && "opacity-60 ring-2 ring-indigo-600/50"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-gray-900 dark:text-gray-100 line-clamp-1">
          {lead.name}
        </p>
        <ScoreBadge score={lead.score} />
      </div>
      <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
        <span>
          {lead.sourcePlatform
            ? PLATFORM_LABELS[lead.sourcePlatform] || lead.sourcePlatform
            : "Manual"}
        </span>
        {lead.nextFollowUpAt && (
          <span className="tabular-nums">
            Due {lead.nextFollowUpAt.slice(0, 10)}
          </span>
        )}
      </div>
    </div>
  );
}

function PipelineColumn({
  status,
  leads,
  onOpen,
}: {
  status: LeadStatus;
  leads: Lead[];
  onOpen: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-w-[240px] flex-1 flex-col rounded-[10px] border border-gray-200 bg-gray-50 dark:border-neutral-800 dark:bg-neutral-950",
        isOver && "ring-2 ring-indigo-600/40"
      )}
    >
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2.5 dark:border-neutral-800">
        <div className="flex items-center gap-2 text-xs font-semibold text-gray-800 dark:text-gray-200">
          <span
            className={cn("h-2 w-2 rounded-full", STATUS_DOT_COLORS[status])}
          />
          <span>{LEAD_STATUS_LABELS[status]}</span>
        </div>
        <span className="text-xs text-gray-500 tabular-nums">
          {leads.length}
        </span>
      </div>

      <div className="flex-1 space-y-2 p-2 min-h-[220px]">
        {leads.map((lead) => (
          <PipelineCard key={lead.id} lead={lead} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}

export default function PipelinePage() {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const { workspaceId, openDrawer } = useLeadsStore();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const queryKey = ["leads", "pipeline", workspaceId];
  const { data: leads = [], isLoading } = useQuery({
    queryKey,
    queryFn: () =>
      getLeads({
        workspaceId,
        sortBy: "score",
        sortDir: "desc",
        showLowScore: true,
        pageSize: 200,
      }),
  });

  const moveMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: LeadStatus }) =>
      updateLead(id, { status }),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData<Lead[]>(queryKey);
      queryClient.setQueryData<Lead[]>(queryKey, (old) =>
        (old ?? []).map((l) => (l.id === id ? { ...l, status } : l))
      );
      return { prev };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      notify("Saved");
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKey, ctx.prev);
      notify("Failed to move lead", "error");
    },
  });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const nextStatus = over.id as LeadStatus;
    if (!PIPELINE_STATUSES.includes(nextStatus)) return;
    const lead = leads.find((l) => l.id === active.id);
    if (!lead || lead.status === nextStatus) return;
    moveMutation.mutate({ id: lead.id, status: nextStatus });
  };

  return (
    <div className="mx-auto max-w-[1280px] space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">
          Pipeline
        </h1>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          Drag cards between columns to update status
        </span>
      </div>

      {isLoading ? (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-6">
          {PIPELINE_STATUSES.map((s) => (
            <Skeleton key={s} className="h-64 w-full" />
          ))}
        </div>
      ) : leads.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 dark:border-neutral-800 dark:bg-neutral-900">
          No leads yet. Run a search.
        </div>
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {PIPELINE_STATUSES.map((status) => (
              <PipelineColumn
                key={status}
                status={status}
                leads={leads.filter((l) => l.status === status)}
                onOpen={openDrawer}
              />
            ))}
          </div>
        </DndContext>
      )}

      <LeadDetailDrawer />
    </div>
  );
}
