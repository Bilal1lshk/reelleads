import type {
  AutopilotRun,
  Lead,
  LeadFilters,
  LeadHookContext,
  LeadMessages,
  LeadPlatform,
  LeadStatus,
  LeadType,
  PendingLead,
  SavedSearch,
  SavedView,
  SearchLeadsParams,
  SourceStat,
} from "@/types/lead";

export interface PlatformRunStat {
  platform: LeadPlatform;
  validCount: number;
  warning?: string;
}

export interface SearchResponse {
  leads: Lead[];
  warnings: string[];
  sourceStats?: SourceStat[];
  platformStats?: PlatformRunStat[];
  insertedCount: number;
  updatedCount: number;
  storage: "mongodb" | "memory_fallback";
  reviewRequired?: boolean;
  searchRunId?: string;
  pendingCount?: number;
  duplicateCount?: number;
  perSource?: Array<{ platform: string; label: string; kept: number }>;
}

export interface LeadsPageResponse {
  leads: Lead[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface HealthResponse {
  mongodb: {
    configured: boolean;
    connected: boolean;
    error?: string;
  };
  defaultPlatforms?: LeadPlatform[];
  connectors: Record<string, boolean>;
}

export async function getHealthStatus(): Promise<HealthResponse> {
  const res = await fetch("/api/health", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to check system health");
  return res.json();
}

export async function searchLeads(
  params: SearchLeadsParams,
  signal?: AbortSignal
): Promise<SearchResponse> {
  const res = await fetch("/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
    signal,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Search failed");
  }
  return res.json();
}

function buildLeadsQueryString(filters?: LeadFilters): string {
  const sp = new URLSearchParams();
  if (filters?.workspaceId) sp.set("workspaceId", filters.workspaceId);
  if (filters?.search) sp.set("search", filters.search);
  if (filters?.type && filters.type !== "all") sp.set("type", filters.type);
  if (filters?.platform && filters.platform !== "all")
    sp.set("platform", filters.platform);
  if (filters?.country && filters.country !== "all")
    sp.set("country", filters.country);
  if (filters?.tag) sp.set("tag", filters.tag);
  if (filters?.minScore) sp.set("minScore", String(filters.minScore));
  if (filters?.maxScore) sp.set("maxScore", String(filters.maxScore));
  if (filters?.hasWhatsApp) sp.set("hasWhatsApp", "true");
  if (filters?.hasEmail) sp.set("hasEmail", "true");
  if (filters?.hasContact) sp.set("hasContact", "true");
  if (filters?.missingFollowUp) sp.set("missingFollowUp", "true");
  if (filters?.freshToday) sp.set("freshToday", "true");
  if (filters?.dateFrom) sp.set("dateFrom", filters.dateFrom);
  if (filters?.dateTo) sp.set("dateTo", filters.dateTo);
  if (filters?.status && filters.status !== "all")
    sp.set("status", filters.status);
  if (filters?.qualityOnly) sp.set("qualityOnly", "true");
  if (filters?.showLowScore !== undefined)
    sp.set("showLowScore", String(filters.showLowScore));
  if (filters?.sortBy) sp.set("sortBy", filters.sortBy);
  if (filters?.sortDir) sp.set("sortDir", filters.sortDir);
  if (filters?.savedOnly) sp.set("savedOnly", "true");
  if (filters?.page) sp.set("page", String(filters.page));
  if (filters?.pageSize) sp.set("pageSize", String(filters.pageSize));
  return sp.toString();
}

export async function getLeadsPage(
  filters?: LeadFilters
): Promise<LeadsPageResponse> {
  const qs = buildLeadsQueryString(filters);
  const res = await fetch(`/api/leads?${qs}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch leads");
  return res.json();
}

export async function getLeads(filters?: LeadFilters): Promise<Lead[]> {
  const data = await getLeadsPage({ pageSize: 200, ...filters });
  return data.leads;
}

export async function getLead(id: string): Promise<Lead | null> {
  const res = await fetch(`/api/leads/${encodeURIComponent(id)}`, {
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to fetch lead");
  const data = (await res.json()) as { lead: Lead | null };
  return data.lead;
}

export class DuplicateLeadError extends Error {
  duplicate: Pick<Lead, "id" | "name" | "email" | "instagram" | "sourceUrl">;
  constructor(
    message: string,
    duplicate: Pick<Lead, "id" | "name" | "email" | "instagram" | "sourceUrl">
  ) {
    super(message);
    this.duplicate = duplicate;
  }
}

export async function updateLead(
  id: string,
  patch: Record<string, unknown>
): Promise<Lead> {
  const res = await fetch(`/api/leads/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (res.status === 409) {
    const body = await res.json();
    throw new DuplicateLeadError(
      body.error || "Duplicate lead detected",
      body.duplicate
    );
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to update lead");
  }
  const data = (await res.json()) as { lead: Lead };
  return data.lead;
}

export async function deleteLead(id: string): Promise<void> {
  const res = await fetch(`/api/leads/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete lead");
}

export async function regenerateLeadAiMessage(
  id: string,
  clientName?: string
): Promise<Lead> {
  const res = await fetch(
    `/api/leads/${encodeURIComponent(id)}/regenerate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientName }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to regenerate message");
  }
  const data = (await res.json()) as { lead: Lead };
  return data.lead;
}

export async function bulkLeadsAction(payload: {
  ids: string[];
  action: "status" | "add_tag" | "follow_up" | "delete";
  status?: LeadStatus;
  tag?: string;
  nextFollowUpAt?: string | null;
}): Promise<{ affected: number }> {
  const res = await fetch("/api/leads/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Bulk update failed");
  }
  return res.json();
}

export async function saveLeadsToCrm(
  leads: Lead[],
  workspaceId?: string
): Promise<{ insertedCount: number; updatedCount: number }> {
  const res = await fetch("/api/leads/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ leads, workspaceId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to save leads to CRM");
  }
  return res.json();
}

export async function createManualLead(input: {
  name?: string;
  text?: string;
  platform?: LeadPlatform;
  type?: LeadType;
  sourceUrl?: string;
  city?: string;
  country?: string;
  niche?: string;
  email?: string;
  whatsapp?: string;
  instagram?: string;
  website?: string;
  budgetSignal?: string;
  followers?: number;
  tags?: string[];
  workspaceId?: string;
}): Promise<Lead> {
  const res = await fetch("/api/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to add lead");
  }
  const data = (await res.json()) as { lead: Lead };
  return data.lead;
}

export async function importLeadsCsv(
  csvText: string,
  platform: LeadPlatform = "csv_import"
): Promise<{
  leads: Lead[];
  totalParsed: number;
  insertedCount: number;
  updatedCount: number;
}> {
  const res = await fetch("/api/leads/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ csvText, platform }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to import CSV");
  }
  return res.json();
}

export async function exportLeadsCsv(ids: string[]): Promise<string> {
  const qs = ids.length > 0 ? `?ids=${encodeURIComponent(ids.join(","))}` : "";
  const res = await fetch(`/api/leads/export${qs}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to export CSV");
  return res.text();
}

export async function getSavedViews(workspaceId: string): Promise<SavedView[]> {
  const res = await fetch(
    `/api/views?workspaceId=${encodeURIComponent(workspaceId)}`,
    { cache: "no-store" }
  );
  if (!res.ok) throw new Error("Failed to load views");
  const data = (await res.json()) as { views: SavedView[] };
  return data.views;
}

export async function createSavedView(input: {
  workspaceId: string;
  name: string;
  filters: LeadFilters;
}): Promise<SavedView> {
  const res = await fetch("/api/views", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to save view");
  }
  const data = (await res.json()) as { view: SavedView };
  return data.view;
}

export async function deleteSavedView(id: string): Promise<void> {
  const res = await fetch(`/api/views?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete view");
}

export interface OverviewStats {
  total: number;
  newThisWeek: number;
  contacted: number;
  replied: number;
  won: number;
  withContactInfo: number;
  replyRate: number | null;
}

export interface OverviewDeltas {
  total: number | null;
  newThisWeek: number | null;
  contacted: number | null;
  replied: number | null;
  won: number | null;
  withContactInfo: number | null;
  replyRate: number | null;
}

export interface OverviewPipelineItem {
  status: "new" | "contacted" | "replied" | "meeting_booked" | "won" | "lost";
  count: number;
}

export interface OverviewFollowUpItem {
  id: string;
  name: string;
  sourcePlatform?: LeadPlatform;
  lastContactedAt?: string;
  nextFollowUpAt?: string;
  status: LeadStatus;
  isOverdue: boolean;
}

export interface OverviewTopLead {
  id: string;
  name: string;
  whyThisLead: string;
  sourcePlatform?: LeadPlatform;
  sourceUrl?: string;
  sourceSnippet?: string;
  country: string;
  score: number;
  email?: string;
  whatsapp?: string;
  instagram?: string;
  website?: string;
  aiMessage: string;
  createdAt: string;
}

export interface OverviewSourceItem {
  platform: LeadPlatform;
  label: string;
  count: number;
}

export interface OverviewActivityItem {
  id: string;
  type:
    | "status_change"
    | "note_added"
    | "contact_logged"
    | "search_run"
    | "import"
    | "created";
  title: string;
  detail?: string;
  at: string;
  leadId?: string;
}

export interface OverviewData {
  stats: OverviewStats;
  deltas: OverviewDeltas;
  pipeline: OverviewPipelineItem[];
  followUpsDueToday: OverviewFollowUpItem[];
  topNewLeads: OverviewTopLead[];
  sources: OverviewSourceItem[];
  recentActivity: OverviewActivityItem[];
  lastSearch: {
    createdAt: string;
    insertedCount: number;
  } | null;
  autopilot?: {
    activeCount: number;
    freshTodayCount: number;
  } | null;
}

export async function getOverview(
  workspaceId?: string,
  fresh = false
): Promise<OverviewData> {
  const sp = new URLSearchParams();
  if (workspaceId) sp.set("workspaceId", workspaceId);
  if (fresh) sp.set("fresh", "1");
  const qs = sp.toString();
  const res = await fetch(`/api/overview${qs ? `?${qs}` : ""}`, {
    cache: fresh ? "no-store" : "default",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to load overview data");
  }
  return res.json();
}

export async function generateLeadMessages(
  id: string,
  options?: { tone?: string; regenerate?: boolean }
): Promise<{ hookContext: LeadHookContext; messages: LeadMessages }> {
  const res = await fetch(`/api/leads/${encodeURIComponent(id)}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options ?? {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to generate hook messages");
  }
  return res.json();
}

export async function saveLeadMessages(
  id: string,
  patch: Partial<LeadMessages>
): Promise<{ messages: LeadMessages }> {
  const res = await fetch(`/api/leads/${encodeURIComponent(id)}/messages`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to save message edits");
  }
  return res.json();
}

export interface SmtpStatusResponse {
  configured: boolean;
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  fromEmail?: string;
  fromName?: string;
  source: "database" | "env" | "none";
}

export async function getSmtpStatus(
  workspaceId = "default"
): Promise<SmtpStatusResponse> {
  const res = await fetch(
    `/api/settings/smtp?workspaceId=${encodeURIComponent(workspaceId)}`,
    { cache: "no-store" }
  );
  if (!res.ok) throw new Error("Failed to load SMTP status");
  return res.json();
}

export async function saveSmtpSettings(payload: {
  workspaceId?: string;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromEmail: string;
  fromName?: string;
}): Promise<SmtpStatusResponse> {
  const res = await fetch("/api/settings/smtp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to save SMTP settings");
  }
  return res.json();
}

export async function sendTestSmtpEmail(
  to: string,
  workspaceId = "default"
): Promise<{ ok: boolean }> {
  const res = await fetch("/api/settings/smtp", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to, workspaceId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to send test email");
  }
  return res.json();
}

export async function getSavedSearches(workspaceId = "default"): Promise<{
  savedSearches: SavedSearch[];
  runs: AutopilotRun[];
}> {
  const res = await fetch(
    `/api/saved-searches?workspaceId=${encodeURIComponent(workspaceId)}`,
    { cache: "no-store" }
  );
  if (!res.ok) throw new Error("Failed to load saved searches");
  return res.json();
}

export async function createSavedSearch(payload: {
  workspaceId?: string;
  name: string;
  params: SearchLeadsParams;
  schedule: "off" | "daily" | "weekly";
  runAtHour: number;
  timezone: string;
  minScore: number;
  maxLeadsPerRun?: number;
  digestEmail?: string;
}): Promise<SavedSearch> {
  const res = await fetch("/api/saved-searches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to save search");
  }
  const data = (await res.json()) as { savedSearch: SavedSearch };
  return data.savedSearch;
}

export async function updateSavedSearch(
  id: string,
  patch: Partial<{
    name: string;
    schedule: "off" | "daily" | "weekly";
    runAtHour: number;
    timezone: string;
    minScore: number;
    maxLeadsPerRun: number;
    digestEmail: string;
    active: boolean;
  }>
): Promise<SavedSearch> {
  const res = await fetch(`/api/saved-searches/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to update saved search");
  }
  const data = (await res.json()) as { savedSearch: SavedSearch };
  return data.savedSearch;
}

export async function deleteSavedSearch(id: string): Promise<void> {
  const res = await fetch(`/api/saved-searches/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete saved search");
}

export async function runSavedSearchNow(id: string): Promise<AutopilotRun> {
  const res = await fetch(
    `/api/saved-searches/${encodeURIComponent(id)}/run`,
    { method: "POST" }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to run saved search");
  }
  const data = (await res.json()) as { run: AutopilotRun };
  return data.run;
}

export interface PendingLeadsResponse {
  pendingLeads: PendingLead[];
  total: number;
  newCount: number;
  duplicateCount: number;
  perSource: Array<{ platform: string; label: string; kept: number }>;
}

export async function getPendingLeads(
  workspaceId = "default",
  searchRunId?: string | null
): Promise<PendingLeadsResponse> {
  const sp = new URLSearchParams({ workspaceId });
  if (searchRunId) sp.set("searchRunId", searchRunId);
  const res = await fetch(`/api/pending?${sp.toString()}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Failed to load pending leads");
  return res.json();
}

export async function savePendingLeads(payload: {
  ids: string[] | "all";
  searchRunId?: string | null;
  workspaceId?: string;
}): Promise<{
  ok: boolean;
  savedCount: number;
  insertedCount: number;
  updatedCount: number;
}> {
  const res = await fetch("/api/pending/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ids: payload.ids,
      searchRunId: payload.searchRunId || undefined,
      workspaceId: payload.workspaceId || "default",
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to save pending leads");
  }
  return res.json();
}

export async function discardPendingLeads(payload: {
  ids: string[] | "all";
  searchRunId?: string | null;
  workspaceId?: string;
}): Promise<{ ok: boolean; discardedCount: number }> {
  const res = await fetch("/api/pending/discard", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ids: payload.ids,
      searchRunId: payload.searchRunId || undefined,
      workspaceId: payload.workspaceId || "default",
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to discard pending leads");
  }
  return res.json();
}

export async function getWorkspacePreferences(
  workspaceId = "default"
): Promise<{ reviewAutopilotLeads: boolean }> {
  const res = await fetch(
    `/api/settings/preferences?workspaceId=${encodeURIComponent(workspaceId)}`,
    { cache: "no-store" }
  );
  if (!res.ok) return { reviewAutopilotLeads: false };
  return res.json();
}

export async function saveWorkspacePreferences(payload: {
  workspaceId?: string;
  reviewAutopilotLeads: boolean;
}): Promise<{ reviewAutopilotLeads: boolean }> {
  const res = await fetch("/api/settings/preferences", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to save preferences");
  }
  return res.json();
}
