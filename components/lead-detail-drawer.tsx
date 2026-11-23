"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Instagram,
  Mail,
  MessageCircle,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import {
  deleteLead,
  DuplicateLeadError,
  generateLeadMessages,
  getLead,
  regenerateLeadAiMessage,
  saveLeadMessages,
  updateLead,
} from "@/lib/api";
import { FEATURE_HOOKS } from "@/lib/config";
import { getScoreBreakdown } from "@/lib/connectors/scoring";
import { useLeadsStore } from "@/lib/store";
import {
  ALL_LEAD_STATUSES,
  buildExternalUrl,
  buildInstagramUrl,
  buildWhatsAppUrl,
  LEAD_STATUS_LABELS,
  LEAD_TYPE_LABELS,
  PLATFORM_LABELS,
} from "@/lib/utils";
import type { Lead, LeadMessages, LeadStatus, LeadType } from "@/types/lead";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ScoreBadge } from "@/components/score-badge";
import { useToast } from "@/components/providers";

export function LeadDetailDrawer() {
  const dialogRef = React.useRef<HTMLDialogElement>(null);
  const { activeLeadId, closeDrawer, workspaceId } = useLeadsStore();
  const queryClient = useQueryClient();
  const { notify } = useToast();

  const {
    data: lead,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["lead", activeLeadId],
    queryFn: () => getLead(activeLeadId!),
    enabled: Boolean(activeLeadId),
  });

  const [draft, setDraft] = React.useState<Partial<Lead>>({});
  const [newNote, setNewNote] = React.useState("");
  const [notFitOpen, setNotFitOpen] = React.useState(false);
  const [notFitReason, setNotFitReason] = React.useState("");
  const [copied, setCopied] = React.useState(false);
  const [messageTab, setMessageTab] = React.useState<
    "shortDm" | "email" | "loomScript" | "followUp"
  >("shortDm");
  const [messageTone, setMessageTone] = React.useState("Direct & helpful");
  const [messagesDraft, setMessagesDraft] = React.useState<
    Partial<LeadMessages>
  >({});
  const autoGenAttemptedRef = React.useRef<Set<string>>(new Set());
  const [duplicateConflict, setDuplicateConflict] = React.useState<{
    id: string;
    name: string;
    patch: Record<string, unknown>;
  } | null>(null);

  React.useEffect(() => {
    if (lead) {
      setDraft({
        name: lead.name,
        status: lead.status,
        type: lead.type,
        country: lead.country,
        city: lead.city,
        email: lead.email || "",
        whatsapp: lead.whatsapp || "",
        instagram: lead.instagram || "",
        website: lead.website || "",
        sourceUrl: lead.sourceUrl || "",
        budgetSignal: lead.budgetSignal || "",
        followers: lead.followers,
        aiMessage: lead.aiMessage,
        nextFollowUpAt: lead.nextFollowUpAt?.slice(0, 10) || "",
      });
      setNotFitOpen(false);
      setNotFitReason(lead.notFitReason || "");
      setDuplicateConflict(null);
      setMessagesDraft(lead.messages || {});
      if (lead.messages?.tone) setMessageTone(lead.messages.tone);
    }
  }, [lead]);

  React.useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (activeLeadId && !dialog.open) {
      dialog.showModal();
    } else if (!activeLeadId && dialog.open) {
      dialog.close();
    }
  }, [activeLeadId]);

  const mutation = useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      updateLead(activeLeadId!, patch),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: ["lead", activeLeadId] });
      const prev = queryClient.getQueryData<Lead>(["lead", activeLeadId]);
      if (prev) {
        queryClient.setQueryData<Lead>(["lead", activeLeadId], {
          ...prev,
          ...(patch as Partial<Lead>),
        });
      }
      return { prev };
    },
    onSuccess: (updated) => {
      setDuplicateConflict(null);
      queryClient.setQueryData(["lead", updated.id], updated);
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      notify("Saved");
    },
    onError: (err, patch, context) => {
      if (context?.prev) {
        queryClient.setQueryData(["lead", activeLeadId], context.prev);
      }
      if (err instanceof DuplicateLeadError) {
        setDuplicateConflict({
          id: err.duplicate.id,
          name: err.duplicate.name,
          patch,
        });
      } else {
        notify(
          err instanceof Error ? err.message : "Failed to save changes",
          "error"
        );
      }
    },
  });

  const regenMutation = useMutation({
    mutationFn: () => regenerateLeadAiMessage(activeLeadId!, workspaceId),
    onSuccess: (updated) => {
      queryClient.setQueryData(["lead", updated.id], updated);
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      setDraft((d) => ({ ...d, aiMessage: updated.aiMessage }));
      notify("Message regenerated");
    },
    onError: (err) => {
      notify(
        err instanceof Error ? err.message : "Regenerate failed",
        "error"
      );
    },
  });

  const hookGenMutation = useMutation({
    mutationFn: (opts?: { tone?: string; regenerate?: boolean }) =>
      generateLeadMessages(activeLeadId!, {
        tone: opts?.tone ?? messageTone,
        regenerate: opts?.regenerate ?? false,
      }),
    onSuccess: (res) => {
      setMessagesDraft(res.messages);
      queryClient.setQueryData<Lead>(["lead", activeLeadId], (prev) =>
        prev
          ? {
              ...prev,
              hookContext: res.hookContext,
              messages: res.messages,
            }
          : prev
      );
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (err) => {
      notify(
        err instanceof Error ? err.message : "Failed to generate hook messages",
        "error"
      );
    },
  });

  React.useEffect(() => {
    if (!FEATURE_HOOKS || !lead || !activeLeadId) return;
    if (lead.messages?.shortDm) return;
    if (autoGenAttemptedRef.current.has(lead.id)) return;
    autoGenAttemptedRef.current.add(lead.id);
    hookGenMutation.mutate({ tone: messageTone, regenerate: false });
  }, [activeLeadId, lead, messageTone, hookGenMutation]);

  const saveMessagesPatch = async (patch: Partial<LeadMessages>) => {
    if (!activeLeadId) return;
    try {
      const res = await saveLeadMessages(activeLeadId, patch);
      setMessagesDraft(res.messages);
      queryClient.setQueryData<Lead>(["lead", activeLeadId], (prev) =>
        prev ? { ...prev, messages: res.messages } : prev
      );
      notify("Saved");
    } catch (err) {
      notify(
        err instanceof Error ? err.message : "Failed to save message",
        "error"
      );
    }
  };

  const deleteMutation = useMutation({
    mutationFn: () => deleteLead(activeLeadId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      notify("Lead deleted");
      dialogRef.current?.close();
    },
    onError: () => notify("Failed to delete lead", "error"),
  });

  const saveField = (field: keyof Lead, value: unknown) => {
    if (!lead || !activeLeadId) return;
    if (lead[field] === value) return;
    mutation.mutate({ [field]: value });
  };

  const activeMessageText = React.useMemo(() => {
    if (!FEATURE_HOOKS) return draft.aiMessage || "";
    if (messageTab === "shortDm") {
      return messagesDraft.shortDm ?? draft.aiMessage ?? "";
    }
    if (messageTab === "email") {
      return messagesDraft.email?.body ?? draft.aiMessage ?? "";
    }
    if (messageTab === "loomScript") {
      return messagesDraft.loomScript ?? "";
    }
    return messagesDraft.followUp ?? "";
  }, [draft.aiMessage, messageTab, messagesDraft]);

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(activeMessageText);
      setCopied(true);
      notify("Copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      notify("Copy failed", "error");
    }
  };

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim() || !activeLeadId) return;
    mutation.mutate({ addNote: newNote.trim() });
    setNewNote("");
  };

  const handleNotFitSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeLeadId) return;
    mutation.mutate({
      status: "not_fit",
      notFitReason: notFitReason.trim() || "Not a fit",
    });
    setNotFitOpen(false);
  };

  const scoreBreakdown = React.useMemo(
    () => (lead ? getScoreBreakdown(lead) : []),
    [lead]
  );

  const mailtoHref = React.useMemo(() => {
    if (!draft.email) return "#";
    const subjectText =
      FEATURE_HOOKS && messagesDraft.email?.subject
        ? messagesDraft.email.subject
        : `Reels editing for ${draft.name || "your content"}`;
    const bodyText =
      FEATURE_HOOKS && messagesDraft.email?.body
        ? messagesDraft.email.body
        : activeMessageText;
    const subject = encodeURIComponent(subjectText);
    const body = encodeURIComponent(bodyText);
    return `mailto:${draft.email}?subject=${subject}&body=${body}`;
  }, [activeMessageText, draft.email, draft.name, messagesDraft.email]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="lead-drawer-title"
      closedby="any"
      onClose={closeDrawer}
      className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-dvh w-full max-w-[480px] border-l border-gray-200 bg-white p-0 text-gray-900 shadow-lg dark:border-neutral-800 dark:bg-neutral-900 dark:text-gray-100 open:flex open:flex-col"
    >
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-gray-200 bg-white px-5 py-4 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <input
              id="lead-drawer-title"
              aria-label="Lead name"
              value={draft.name ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              onBlur={() => {
                if (draft.name?.trim()) saveField("name", draft.name.trim());
              }}
              className="w-full truncate rounded-md border border-transparent bg-transparent px-1 -mx-1 text-base font-semibold text-gray-900 hover:border-gray-200 focus:border-indigo-600 focus:bg-white focus:outline-none dark:text-gray-100 dark:hover:border-neutral-700 dark:focus:bg-neutral-950"
            />
            {lead && <ScoreBadge score={lead.score} />}
          </div>

          {lead && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <Select
                aria-label="Lead status"
                value={(draft.status as LeadStatus) || lead.status}
                onChange={(e) => {
                  const next = e.target.value as LeadStatus;
                  setDraft((d) => ({ ...d, status: next }));
                  saveField("status", next);
                }}
                className="h-7 w-auto text-xs"
              >
                {ALL_LEAD_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {LEAD_STATUS_LABELS[s]}
                  </option>
                ))}
              </Select>
              <span className="truncate">
                {scoreBreakdown.map((r) => `+${r.points} ${r.label}`).join(", ")}
              </span>
            </div>
          )}
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => dialogRef.current?.close()}
          aria-label="Close lead details"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : isError || !lead ? (
          <div className="rounded-lg border border-gray-200 p-4 text-sm text-red-600 space-y-2 dark:border-neutral-800 dark:text-red-400">
            <p>Could not load lead details.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : (
          <>
            {duplicateConflict && (
              <div className="rounded-lg border border-amber-300 bg-amber-50/50 p-3 text-xs space-y-2 dark:border-amber-900 dark:bg-neutral-950">
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  Duplicate match found: {duplicateConflict.name}
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() =>
                      mutation.mutate({
                        ...duplicateConflict.patch,
                        mergeIntoId: duplicateConflict.id,
                      })
                    }
                  >
                    Merge into existing
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      mutation.mutate({ ...duplicateConflict.patch, force: true })
                    }
                  >
                    Keep separate
                  </Button>
                </div>
              </div>
            )}

            {/* Source Verification Section */}
            <section className="rounded-lg border border-gray-200 bg-gray-50 p-3.5 space-y-2 dark:border-neutral-800 dark:bg-neutral-950">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 font-medium text-gray-800 dark:text-gray-200">
                  <span>
                    Source:{" "}
                    {lead.sourcePlatform
                      ? PLATFORM_LABELS[lead.sourcePlatform]
                      : "Manual"}
                  </span>
                  {lead.sourceUrl && lead.hiringSignal && (
                    <span className="inline-flex items-center gap-1 text-gray-600 dark:text-gray-400">
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                      Verified source
                    </span>
                  )}
                </div>
                <span className="text-gray-500">
                  Found {lead.createdAt.slice(0, 10)}
                </span>
              </div>

              {(lead.rawText || lead.sourceSnippet) && (
                <p className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap break-words">
                  {lead.rawText || lead.sourceSnippet}
                </p>
              )}

              {lead.sourceUrl && (
                <a
                  href={buildExternalUrl(lead.sourceUrl)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  {lead.sourceUrl}
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              )}
            </section>

            {/* Editable Fields */}
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Details & Contacts
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">
                    Email
                  </label>
                  <Input
                    value={draft.email ?? ""}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, email: e.target.value }))
                    }
                    onBlur={() => saveField("email", draft.email?.trim() || "")}
                    placeholder="name@domain.com"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">
                    WhatsApp
                  </label>
                  <Input
                    value={draft.whatsapp ?? ""}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, whatsapp: e.target.value }))
                    }
                    onBlur={() =>
                      saveField("whatsapp", draft.whatsapp?.trim() || "")
                    }
                    placeholder="+1..."
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">
                    Instagram
                  </label>
                  <Input
                    value={draft.instagram ?? ""}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, instagram: e.target.value }))
                    }
                    onBlur={() =>
                      saveField("instagram", draft.instagram?.trim() || "")
                    }
                    placeholder="@handle or URL"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">
                    Website
                  </label>
                  <Input
                    value={draft.website ?? ""}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, website: e.target.value }))
                    }
                    onBlur={() =>
                      saveField("website", draft.website?.trim() || "")
                    }
                    placeholder="https://..."
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">
                    Country
                  </label>
                  <Input
                    value={draft.country ?? ""}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, country: e.target.value }))
                    }
                    onBlur={() =>
                      saveField("country", draft.country?.trim() || "Unknown")
                    }
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">
                    City
                  </label>
                  <Input
                    value={draft.city ?? ""}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, city: e.target.value }))
                    }
                    onBlur={() => saveField("city", draft.city?.trim() || "")}
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">
                    Type
                  </label>
                  <Select
                    value={(draft.type as LeadType) || lead.type}
                    onChange={(e) => {
                      const val = e.target.value as LeadType;
                      setDraft((d) => ({ ...d, type: val }));
                      saveField("type", val);
                    }}
                  >
                    {Object.entries(LEAD_TYPE_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">
                    Budget
                  </label>
                  <Input
                    value={draft.budgetSignal ?? ""}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, budgetSignal: e.target.value }))
                    }
                    onBlur={() =>
                      saveField("budgetSignal", draft.budgetSignal?.trim() || "")
                    }
                    placeholder="e.g. $500/mo"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">
                    Followers
                  </label>
                  <Input
                    type="number"
                    value={draft.followers ?? ""}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        followers: e.target.value
                          ? Number(e.target.value)
                          : undefined,
                      }))
                    }
                    onBlur={() =>
                      saveField("followers", draft.followers ?? null)
                    }
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">
                    Next follow-up
                  </label>
                  <div className="flex gap-1.5">
                    <Input
                      type="date"
                      value={draft.nextFollowUpAt ?? ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDraft((d) => ({ ...d, nextFollowUpAt: val }));
                        saveField("nextFollowUpAt", val || null);
                      }}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => mutation.mutate({ logContact: true })}
                    >
                      Log contact
                    </Button>
                  </div>
                </div>
              </div>
            </section>

            {/* AI Message */}
            {FEATURE_HOOKS ? (
              <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Outreach Message
                  </h3>
                  <div className="flex items-center gap-2">
                    <Select
                      aria-label="Message tone"
                      value={messageTone}
                      onChange={(e) => {
                        const nextTone = e.target.value;
                        setMessageTone(nextTone);
                        hookGenMutation.mutate({
                          tone: nextTone,
                          regenerate: true,
                        });
                      }}
                      className="h-7 w-auto text-xs"
                    >
                      <option value="Direct & helpful">Direct & helpful</option>
                      <option value="Casual">Casual</option>
                      <option value="Concise">Concise</option>
                    </Select>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={hookGenMutation.isPending}
                      onClick={() =>
                        hookGenMutation.mutate({
                          tone: messageTone,
                          regenerate: true,
                        })
                      }
                    >
                      <RefreshCw
                        className={
                          hookGenMutation.isPending
                            ? "h-3.5 w-3.5 animate-spin"
                            : "h-3.5 w-3.5"
                        }
                      />
                      Regenerate
                    </Button>
                  </div>
                </div>

                {/* Extracted requirement tags */}
                {lead.hookContext?.requirements &&
                  lead.hookContext.requirements.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {lead.hookContext.requirements.map((req) => (
                        <span
                          key={req}
                          className="inline-flex items-center rounded border border-gray-200 bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700 dark:border-neutral-800 dark:bg-neutral-800 dark:text-gray-300"
                        >
                          {req}
                        </span>
                      ))}
                    </div>
                  )}

                <SegmentedControl
                  ariaLabel="Message format"
                  options={[
                    { value: "shortDm", label: "Short DM" },
                    { value: "email", label: "Email" },
                    { value: "loomScript", label: "Loom script" },
                    { value: "followUp", label: "Follow-up" },
                  ]}
                  value={messageTab}
                  onChange={(val) =>
                    setMessageTab(
                      val as "shortDm" | "email" | "loomScript" | "followUp"
                    )
                  }
                />

                {messageTab === "email" && (
                  <Input
                    aria-label="Email subject"
                    placeholder="Email subject..."
                    value={
                      messagesDraft.email?.subject ??
                      `Video editing for ${draft.name || "your content"}`
                    }
                    onChange={(e) =>
                      setMessagesDraft((prev) => ({
                        ...prev,
                        email: {
                          subject: e.target.value,
                          body: prev.email?.body ?? draft.aiMessage ?? "",
                        },
                      }))
                    }
                    onBlur={() => {
                      if (messagesDraft.email) {
                        void saveMessagesPatch({ email: messagesDraft.email });
                      }
                    }}
                  />
                )}

                <Textarea
                  rows={messageTab === "loomScript" ? 6 : 4}
                  aria-label="Outreach message text"
                  value={activeMessageText}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (messageTab === "shortDm") {
                      setMessagesDraft((prev) => ({ ...prev, shortDm: val }));
                    } else if (messageTab === "email") {
                      setMessagesDraft((prev) => ({
                        ...prev,
                        email: {
                          subject:
                            prev.email?.subject ??
                            `Video editing for ${draft.name || "your content"}`,
                          body: val,
                        },
                      }));
                    } else if (messageTab === "loomScript") {
                      setMessagesDraft((prev) => ({
                        ...prev,
                        loomScript: val,
                      }));
                    } else {
                      setMessagesDraft((prev) => ({ ...prev, followUp: val }));
                    }
                  }}
                  onBlur={() => {
                    if (messageTab === "shortDm") {
                      void saveMessagesPatch({
                        shortDm: messagesDraft.shortDm ?? draft.aiMessage ?? "",
                      });
                    } else if (messageTab === "email") {
                      void saveMessagesPatch({
                        email: {
                          subject:
                            messagesDraft.email?.subject ??
                            `Video editing for ${draft.name || "your content"}`,
                          body:
                            messagesDraft.email?.body ?? draft.aiMessage ?? "",
                        },
                      });
                    } else if (messageTab === "loomScript") {
                      void saveMessagesPatch({
                        loomScript: messagesDraft.loomScript ?? "",
                      });
                    } else {
                      void saveMessagesPatch({
                        followUp: messagesDraft.followUp ?? "",
                      });
                    }
                  }}
                />

                {/* Grounding source line */}
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {lead.hookContext &&
                  lead.hookContext.sourceType !== "generic" &&
                  lead.hookContext.basedOn ? (
                    <>
                      Based on: {lead.hookContext.basedOn}
                      {lead.sourceUrl && (
                        <>
                          {" "}
                          <a
                            href={buildExternalUrl(lead.sourceUrl)}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                          >
                            View source
                          </a>
                        </>
                      )}
                    </>
                  ) : (
                    "Generic message (no specific post found)"
                  )}
                </p>

                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={handleCopyMessage}>
                    {copied ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                  {draft.whatsapp && (
                    <a
                      href={buildWhatsAppUrl(draft.whatsapp, activeMessageText)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-xs font-medium text-white hover:bg-indigo-700"
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      Open WhatsApp
                    </a>
                  )}
                  {draft.email && (
                    <a
                      href={mailtoHref}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-gray-800 hover:bg-gray-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-gray-200"
                    >
                      <Mail className="h-3.5 w-3.5" />
                      Open email
                    </a>
                  )}
                  {(draft.sourceUrl || draft.instagram) && (
                    <a
                      href={
                        draft.sourceUrl
                          ? buildExternalUrl(draft.sourceUrl)
                          : buildInstagramUrl(draft.instagram!)
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-gray-800 hover:bg-gray-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-gray-200"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Open profile
                    </a>
                  )}
                </div>
              </section>
            ) : (
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Outreach Message
                  </h3>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={regenMutation.isPending}
                    onClick={() => regenMutation.mutate()}
                  >
                    <RefreshCw
                      className={
                        regenMutation.isPending
                          ? "h-3.5 w-3.5 animate-spin"
                          : "h-3.5 w-3.5"
                      }
                    />
                    Regenerate
                  </Button>
                </div>
                <Textarea
                  rows={4}
                  value={draft.aiMessage ?? ""}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, aiMessage: e.target.value }))
                  }
                  onBlur={() => saveField("aiMessage", draft.aiMessage ?? "")}
                />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={handleCopyMessage}>
                    {copied ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                  {draft.whatsapp && (
                    <a
                      href={buildWhatsAppUrl(
                        draft.whatsapp,
                        draft.aiMessage || ""
                      )}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-xs font-medium text-white hover:bg-indigo-700"
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      Open WhatsApp
                    </a>
                  )}
                  {draft.email && (
                    <a
                      href={mailtoHref}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-gray-800 hover:bg-gray-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-gray-200"
                    >
                      <Mail className="h-3.5 w-3.5" />
                      Open email
                    </a>
                  )}
                  {draft.instagram && (
                    <a
                      href={buildInstagramUrl(draft.instagram)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-gray-800 hover:bg-gray-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-gray-200"
                    >
                      <Instagram className="h-3.5 w-3.5" />
                      Open Instagram
                    </a>
                  )}
                </div>
              </section>
            )}

            {/* Notes & Activity Timeline */}
            <section className="space-y-3 border-t border-gray-200 pt-4 dark:border-neutral-800">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Notes & Activity
              </h3>
              <form onSubmit={handleAddNote} className="flex gap-2">
                <Input
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Add a note..."
                />
                <Button type="submit" size="sm" variant="outline">
                  Add note
                </Button>
              </form>

              {(lead.noteEntries ?? []).length > 0 && (
                <ul className="space-y-1.5">
                  {lead.noteEntries!.map((n) => (
                    <li
                      key={n.id}
                      className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs dark:border-neutral-800 dark:bg-neutral-950"
                    >
                      <p className="text-gray-800 dark:text-gray-200">{n.text}</p>
                      <p className="mt-0.5 text-[11px] text-gray-400">
                        {new Date(n.createdAt).toLocaleString()}
                      </p>
                    </li>
                  ))}
                </ul>
              )}

              <ul className="space-y-1.5 text-xs text-gray-600 dark:text-gray-400">
                {[...(lead.activity ?? [])]
                  .reverse()
                  .slice(0, 15)
                  .map((act) => (
                    <li
                      key={act.id}
                      className="flex items-center justify-between gap-2 py-1 border-b border-gray-100 dark:border-neutral-800/60"
                    >
                      <span className="truncate">
                        {act.type === "status_change"
                          ? `Status: ${act.from || "—"} → ${act.to}${
                              act.detail ? ` (${act.detail})` : ""
                            }`
                          : act.type === "field_edit"
                            ? act.detail ||
                              `Updated ${act.field} → ${act.to || "cleared"}`
                            : act.detail || act.type}
                      </span>
                      <span className="shrink-0 text-[11px] text-gray-400">
                        {new Date(act.at).toLocaleDateString()}
                      </span>
                    </li>
                  ))}
              </ul>
            </section>
          </>
        )}
      </div>

      {/* Footer */}
      {lead && (
        <div className="sticky bottom-0 z-10 border-t border-gray-200 px-5 py-3 flex flex-wrap items-center justify-between gap-2 bg-gray-50 dark:border-neutral-800 dark:bg-neutral-950">
          {notFitOpen ? (
            <form
              onSubmit={handleNotFitSubmit}
              className="flex flex-1 items-center gap-2"
            >
              <Input
                value={notFitReason}
                onChange={(e) => setNotFitReason(e.target.value)}
                placeholder="Reason (e.g. wrong niche, low budget)"
                className="h-8 text-xs"
                autoFocus
              />
              <Button type="submit" size="sm">
                Confirm
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setNotFitOpen(false)}
              >
                Cancel
              </Button>
            </form>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setNotFitOpen(true)}
                >
                  Mark as not a fit
                </Button>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => dialogRef.current?.close()}
              >
                Close
              </Button>
            </>
          )}
        </div>
      )}
    </dialog>
  );
}
