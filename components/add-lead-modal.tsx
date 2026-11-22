"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { createManualLead } from "@/lib/api";
import { useLeadsStore } from "@/lib/store";
import { cn, LEAD_TYPE_LABELS } from "@/lib/utils";
import type { LeadType } from "@/types/lead";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/providers";

export function AddLeadModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const dialogRef = React.useRef<HTMLDialogElement>(null);
  const queryClient = useQueryClient();
  const { workspaceId } = useLeadsStore();
  const { notify } = useToast();

  const [mode, setMode] = React.useState<"manual" | "paste">("manual");
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<LeadType>("creator");
  const [country, setCountry] = React.useState("");
  const [city, setCity] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [whatsapp, setWhatsapp] = React.useState("");
  const [instagram, setInstagram] = React.useState("");
  const [website, setWebsite] = React.useState("");
  const [sourceUrl, setSourceUrl] = React.useState("");
  const [budgetSignal, setBudgetSignal] = React.useState("");
  const [pastedText, setPastedText] = React.useState("");

  React.useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const mutation = useMutation({
    mutationFn: () =>
      mode === "paste"
        ? createManualLead({
            name: name.trim() || undefined,
            text: pastedText.trim(),
            sourceUrl: sourceUrl.trim() || undefined,
            country: country.trim() || undefined,
            type,
            workspaceId,
          })
        : createManualLead({
            name: name.trim(),
            type,
            country: country.trim() || "Unknown",
            city: city.trim(),
            email: email.trim() || undefined,
            whatsapp: whatsapp.trim() || undefined,
            instagram: instagram.trim() || undefined,
            website: website.trim() || undefined,
            sourceUrl: sourceUrl.trim() || website.trim() || undefined,
            budgetSignal: budgetSignal.trim() || undefined,
            workspaceId,
          }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      notify("Lead added");
      setName("");
      setPastedText("");
      setEmail("");
      setWhatsapp("");
      setInstagram("");
      setWebsite("");
      setSourceUrl("");
      setBudgetSignal("");
      onClose();
    },
    onError: (err) => {
      notify(err instanceof Error ? err.message : "Failed to add lead", "error");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "manual" && !name.trim()) {
      notify("Name is required", "error");
      return;
    }
    if (mode === "paste" && !pastedText.trim()) {
      notify("Paste some text to extract from", "error");
      return;
    }
    mutation.mutate();
  };

  return (
    <dialog
      ref={dialogRef}
      closedby="any"
      onClose={onClose}
      aria-labelledby="add-lead-title"
      className="m-auto w-full max-w-lg rounded-lg border border-gray-200 bg-white p-0 text-gray-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-gray-100"
    >
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-neutral-800">
        <h2 id="add-lead-title" className="text-sm font-semibold">
          Add lead
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close modal"
          className="rounded-md p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-neutral-800"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-4 space-y-4">
        <div className="flex gap-1 rounded-lg border border-gray-200 bg-gray-50 p-0.5 dark:border-neutral-800 dark:bg-neutral-950">
          <button
            type="button"
            onClick={() => setMode("manual")}
            className={cn(
              "flex-1 rounded-md py-1.5 text-xs font-medium cursor-pointer",
              mode === "manual"
                ? "bg-white text-gray-900 border border-gray-200 dark:bg-neutral-800 dark:text-gray-100 dark:border-neutral-700"
                : "text-gray-500"
            )}
          >
            Manual entry
          </button>
          <button
            type="button"
            onClick={() => setMode("paste")}
            className={cn(
              "flex-1 rounded-md py-1.5 text-xs font-medium cursor-pointer",
              mode === "paste"
                ? "bg-white text-gray-900 border border-gray-200 dark:bg-neutral-800 dark:text-gray-100 dark:border-neutral-700"
                : "text-gray-500"
            )}
          >
            Add from pasted text
          </button>
        </div>

        {mode === "paste" ? (
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">
                Name (optional)
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Creator or brand name"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">
                Source URL (optional)
              </label>
              <Input
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">
                Pasted post, bio, or job listing
              </label>
              <Textarea
                rows={5}
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder="Paste text containing email, WhatsApp, Instagram, or budget..."
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Name *</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Studio / Creator name"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Type</label>
              <Select
                value={type}
                onChange={(e) => setType(e.target.value as LeadType)}
              >
                {Object.entries(LEAD_TYPE_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Country</label>
              <Input
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="United States"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">City</label>
              <Input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="New York"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Email</label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@domain.com"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">WhatsApp</label>
              <Input
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="+1..."
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Instagram</label>
              <Input
                value={instagram}
                onChange={(e) => setInstagram(e.target.value)}
                placeholder="@handle"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Source URL</label>
              <Input
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-gray-200 dark:border-neutral-800">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={mutation.isPending}>
            {mutation.isPending ? "Saving..." : "Add lead"}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
