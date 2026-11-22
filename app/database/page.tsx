"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Database,
  Download,
  FileSpreadsheet,
  PlusCircle,
  Upload,
} from "lucide-react";
import {
  createManualLead,
  getHealthStatus,
  importLeadsCsv,
} from "@/lib/api";
import { PLATFORM_LABELS } from "@/lib/utils";
import type { Lead, LeadPlatform, LeadType } from "@/types/lead";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ScoreBadge } from "@/components/score-badge";
import { useToast } from "@/components/providers";

const IMPORT_PLATFORMS: { value: LeadPlatform; label: string }[] = [
  { value: "ytjobs", label: "YTJobs" },
  { value: "contra", label: "Contra" },
  { value: "upwork", label: "Upwork" },
  { value: "linkedin", label: "LinkedIn / Apollo" },
  { value: "behance", label: "Behance" },
  { value: "x", label: "X (Twitter)" },
  { value: "facebook", label: "Facebook Page" },
  { value: "instagram", label: "Instagram" },
  { value: "youtube", label: "YouTube" },
  { value: "csv_import", label: "CSV / Origami / Clay" },
  { value: "manual", label: "Other / Manual" },
];

type PreviewLeadRow = {
  id: string;
  name: string;
  email?: string;
  whatsapp?: string;
  instagram?: string;
  location: string;
  platform: string;
  budget?: string;
};

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function previewCsvRows(
  csvText: string,
  defaultPlatform: LeadPlatform
): PreviewLeadRow[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const rows: PreviewLeadRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = cols[idx] ?? "";
    });

    const name =
      row.name ||
      row["channel name"] ||
      row["company"] ||
      row["full name"] ||
      row["creator"] ||
      `Imported Lead #${i}`;

    const location = [row.city, row.country].filter(Boolean).join(", ") || "Global";
    const platformKey = (row.platform || row.source || defaultPlatform)
      .toLowerCase()
      .trim() as LeadPlatform;

    rows.push({
      id: `preview-${i}`,
      name,
      email: row.email || undefined,
      whatsapp: row.whatsapp || row.phone || undefined,
      instagram: row.instagram || undefined,
      location,
      platform: PLATFORM_LABELS[platformKey] || platformKey || "CSV Import",
      budget: row.budget || undefined,
    });
  }

  return rows;
}

export default function LeadDatabasePage() {
  const queryClient = useQueryClient();
  const { notify } = useToast();

  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: getHealthStatus,
  });

  // Quick-Add state
  const [name, setName] = React.useState("");
  const [platform, setPlatform] = React.useState<LeadPlatform>("ytjobs");
  const [type, setType] = React.useState<LeadType>("creator");
  const [sourceUrl, setSourceUrl] = React.useState("");
  const [rawText, setRawText] = React.useState("");

  // CSV Import state
  const [csvText, setCsvText] = React.useState("");
  const [csvPlatform, setCsvPlatform] =
    React.useState<LeadPlatform>("csv_import");

  // Session imported leads
  const [importedLeads, setImportedLeads] = React.useState<Lead[]>([]);

  const queuedLeads = React.useMemo(
    () => previewCsvRows(csvText, csvPlatform),
    [csvText, csvPlatform]
  );

  const addMutation = useMutation({
    mutationFn: () =>
      createManualLead({
        name: name.trim() || undefined,
        text: rawText.trim(),
        platform,
        type,
        sourceUrl: sourceUrl.trim() || undefined,
      }),
    onSuccess: (lead) => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      setImportedLeads((prev) => [lead, ...prev]);
      notify(`Saved "${lead.name}" (Score: ${lead.score})`);
      setName("");
      setSourceUrl("");
      setRawText("");
    },
    onError: (err: Error) => notify(err.message, "error"),
  });

  const importMutation = useMutation({
    mutationFn: () => importLeadsCsv(csvText, csvPlatform),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      setImportedLeads((prev) => [...res.leads, ...prev]);
      notify(
        `Imported ${res.insertedCount} new leads (${res.updatedCount} duplicates skipped)`
      );
      setCsvText("");
    },
    onError: (err: Error) => notify(err.message, "error"),
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setCsvText(reader.result);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-gray-900 dark:text-gray-100">
            Import / Export
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Add individual leads or bulk import from CSV, Apollo, Clay, or LinkedIn.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <a
            href="/api/leads/export"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-gray-200 dark:hover:bg-neutral-800"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </a>
          <div className="inline-flex h-8 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium dark:border-neutral-800 dark:bg-neutral-900">
            <Database className="h-3.5 w-3.5 text-gray-500" />
            {health?.mongodb.connected ? (
              <span className="flex items-center gap-1.5 text-gray-700 dark:text-gray-300">
                <span className="h-2 w-2 rounded-full bg-green-600" />
                Connected
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-gray-700 dark:text-gray-300">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                {health?.mongodb.configured ? "DB Error" : "Not configured"}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Quick-add */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <PlusCircle className="h-4 w-4 text-emerald-600" />
              Quick-Add Lead
            </CardTitle>
            <CardDescription className="text-xs">
              Paste a job post or bio — contacts and pitch are extracted automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2.5 sm:grid-cols-2">
              <Input
                placeholder="Creator / Brand Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Select
                value={platform}
                onChange={(e) => setPlatform(e.target.value as LeadPlatform)}
              >
                {IMPORT_PLATFORMS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </Select>
              <Select
                value={type}
                onChange={(e) => setType(e.target.value as LeadType)}
              >
                <option value="creator">Instagram Creator</option>
                <option value="youtuber">YouTuber</option>
                <option value="local_brand">Local Brand</option>
                <option value="coach">Coach</option>
                <option value="agency">Agency</option>
              </Select>
              <Input
                placeholder="Post / Profile URL (optional)"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
              />
            </div>
            <Textarea
              rows={3}
              placeholder="Paste job description, bio, email, WhatsApp, or budget details..."
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
            />
            <Button
              size="sm"
              disabled={!rawText.trim() || addMutation.isPending}
              onClick={() => addMutation.mutate()}
            >
              <PlusCircle className="h-4 w-4" />
              {addMutation.isPending ? "Saving..." : "Extract & Save Lead"}
            </Button>
          </CardContent>
        </Card>

        {/* Bulk CSV Import */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
              Bulk CSV Import
            </CardTitle>
            <CardDescription className="text-xs">
              Upload or paste a CSV (Name, Email, WhatsApp, Instagram, City, Budget).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <label className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-neutral-800 dark:bg-neutral-950 dark:text-gray-200">
                <Upload className="h-3.5 w-3.5" />
                Choose CSV
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </label>
              <Select
                value={csvPlatform}
                onChange={(e) => setCsvPlatform(e.target.value as LeadPlatform)}
                className="w-48"
              >
                {IMPORT_PLATFORMS.map((p) => (
                  <option key={p.value} value={p.value}>
                    Source: {p.label}
                  </option>
                ))}
              </Select>
            </div>
            <Textarea
              rows={3}
              placeholder={
                "Name,Email,Instagram,City,Budget\nAli Fitness,ali@example.com,@alifit,Lahore,1500 PKR/reel"
              }
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                disabled={queuedLeads.length === 0 || importMutation.isPending}
                onClick={() => importMutation.mutate()}
              >
                <Upload className="h-4 w-4" />
                {importMutation.isPending
                  ? "Importing..."
                  : queuedLeads.length > 0
                  ? `Import ${queuedLeads.length} Leads`
                  : "Import Leads"}
              </Button>
              {csvText.trim() && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setCsvText("")}
                >
                  Clear
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Preview of leads that will be imported */}
      {queuedLeads.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">
              Leads to be imported ({queuedLeads.length})
            </CardTitle>
            <CardDescription className="text-xs">
              Review the parsed rows below before clicking Import.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-y border-gray-200 bg-gray-50 text-[11px] font-medium text-gray-500 dark:border-neutral-800 dark:bg-neutral-950 dark:text-gray-400">
                  <tr>
                    <th className="px-4 py-2">Name</th>
                    <th className="px-4 py-2">Contact</th>
                    <th className="px-4 py-2">Location</th>
                    <th className="px-4 py-2">Source</th>
                    <th className="px-4 py-2">Budget</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-neutral-800">
                  {queuedLeads.slice(0, 50).map((row) => (
                    <tr key={row.id}>
                      <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-gray-100">
                        {row.name}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 dark:text-gray-300">
                        {[row.email, row.whatsapp, row.instagram]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400">
                        {row.location}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400">
                        {row.platform}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400">
                        {row.budget || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {queuedLeads.length > 50 && (
                <p className="border-t border-gray-100 px-4 py-2 text-[11px] text-gray-500 dark:border-neutral-800 dark:text-gray-400">
                  Showing first 50 of {queuedLeads.length} rows.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recently imported in this session */}
      {importedLeads.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                Imported ({importedLeads.length})
              </CardTitle>
              <CardDescription className="text-xs">
                Added to your CRM during this session.
              </CardDescription>
            </div>
            <Link href="/leads">
              <Button size="sm" variant="outline">
                View in Leads
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-gray-100 dark:divide-neutral-800">
              {importedLeads.slice(0, 30).map((lead) => (
                <div
                  key={lead.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {lead.name}
                      </span>
                      <ScoreBadge score={lead.score} />
                    </div>
                    <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">
                      {[lead.email, lead.whatsapp, lead.instagram, lead.city]
                        .filter(Boolean)
                        .join(" · ") || "Saved"}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] text-gray-500 dark:text-gray-400">
                    {lead.sourcePlatform
                      ? PLATFORM_LABELS[lead.sourcePlatform] || lead.sourcePlatform
                      : "Imported"}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {queuedLeads.length === 0 && importedLeads.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-200 bg-white p-6 text-center text-xs text-gray-500 dark:border-neutral-800 dark:bg-neutral-900 dark:text-gray-400">
          Paste or upload a CSV above to preview the leads that will be imported here.
        </div>
      )}
    </div>
  );
}
