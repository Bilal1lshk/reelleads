export type LeadType =
  | "local_brand"
  | "creator"
  | "coach"
  | "youtuber"
  | "agency";

export type LeadStatus =
  | "new"
  | "contacted"
  | "replied"
  | "meeting_booked"
  | "won"
  | "lost"
  | "not_fit";

export type LeadPlatform =
  | "youtube"
  | "reddit"
  | "facebook"
  | "instagram"
  | "tiktok"
  | "x"
  | "linkedin"
  | "ytjobs"
  | "contra"
  | "upwork"
  | "behance"
  | "google_places"
  | "google_cse"
  | "exa"
  | "tavily"
  | "csv_import"
  | "manual";

export type LeadNoteEntry = {
  id: string;
  text: string;
  createdAt: string;
};

export type LeadActivityEntry = {
  id: string;
  type: "status_change" | "field_edit" | "note_added" | "contact_logged" | "message_regenerated" | "created";
  actor?: string;
  field?: string;
  from?: string;
  to?: string;
  detail?: string;
  at: string;
};

export interface LeadHookContext {
  sourceType:
    | "hiring_post"
    | "youtube"
    | "instagram"
    | "linkedin"
    | "web"
    | "generic";
  basedOn: string;
  requirements?: string[];
  latestTitle?: string;
  capturedAt: string;
}

export interface LeadMessages {
  shortDm?: string;
  email?: { subject: string; body: string };
  loomScript?: string;
  followUp?: string;
  generatedAt: string;
  tone?: string;
}

export type Lead = {
  id: string;
  name: string;
  type: LeadType;
  city: string;
  country: string;
  /** true = country came from the source data itself; false = unknown/unverified */
  countryVerified?: boolean;
  score: number;
  whyThisLead: string;
  instagram?: string;
  whatsapp?: string;
  email?: string;
  website?: string;
  postsPerWeek?: number;
  followers?: number;
  aiMessage: string;
  status: LeadStatus;
  notes?: string;
  noteEntries?: LeadNoteEntry[];
  activity?: LeadActivityEntry[];
  tags?: string[];
  nextFollowUpAt?: string;
  lastContactedAt?: string;
  notFitReason?: string;
  rawText?: string;
  workspaceId?: string;
  createdAt: string;
  lastSeenAt?: string;
  sourcePlatform?: LeadPlatform;
  sourceUrl?: string;
  /** Verbatim excerpt from the source (post title, bio, snippet) so the lead can be verified */
  sourceSnippet?: string;
  /** The exact hiring phrase matched in the source text, e.g. "[Hiring]" or "looking for" */
  hiringSignal?: string;
  budgetSignal?: string;
  niche?: string;
  dedupeKey?: string;
  hookContext?: LeadHookContext;
  messages?: LeadMessages;
  freshAt?: string;
  autopilotRunId?: string;
};

export type LeadFilters = {
  workspaceId?: string;
  search?: string;
  type?: LeadType | "all";
  platform?: LeadPlatform | "all";
  country?: string;
  tag?: string;
  minScore?: number;
  maxScore?: number;
  hasWhatsApp?: boolean;
  hasEmail?: boolean;
  hasContact?: boolean;
  missingFollowUp?: boolean;
  freshToday?: boolean;
  dateFrom?: string;
  dateTo?: string;
  status?: LeadStatus | "all";
  qualityOnly?: boolean;
  showLowScore?: boolean;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  savedOnly?: boolean;
  page?: number;
  pageSize?: number;
};

export type SavedView = {
  id: string;
  workspaceId: string;
  name: string;
  filters: LeadFilters;
  createdAt: string;
};

export type SearchLeadsParams = {
  /** Comma-separated niches are supported, e.g. "fashion, food, real estate" */
  niche: string;
  clientTypes: LeadType[];
  platforms?: LeadPlatform[];
  /** Legacy single-country field. Prefer `countries`. */
  country: string;
  /** Target countries (multi-select). Empty = no country filter. */
  countries?: string[];
  /** Countries that must never appear in results. */
  excludedCountries?: string[];
  city: string;
  count: 10 | 25 | 50 | 100;
  /** Name of the editor the outreach is written for (e.g. "Vanessa") */
  clientName?: string;
  workspaceId?: string;
  /** Short description of the editor's offer, used in outreach copy */
  offer?: string;
  /** When false, returns leads for preview without auto-saving to MongoDB. Defaults to true. */
  saveToCrm?: boolean;
  /** When true (default), filters out leads already in CRM or pending/discarded review before slicing to count. */
  excludeExisting?: boolean;
  /** Zero-based run/page counter used by connectors to paginate and rotate query angles across runs. */
  runIndex?: number;
  /** ISO timestamp; connectors that support freshness filters restrict results to items after this time. */
  sinceIso?: string;
};

export type SourceStat = {
  platform: LeadPlatform;
  label: string;
  /** Raw leads returned by the connector */
  returned: number;
  /** Leads kept after country + quality filtering (before final count cap) */
  kept: number;
  warning?: string;
  timedOut?: boolean;
};

export type SearchRun = {
  id: string;
  niche: string;
  clientTypes: LeadType[];
  platforms: LeadPlatform[];
  country: string;
  countries?: string[];
  excludedCountries?: string[];
  city: string;
  requestedCount: number;
  insertedCount: number;
  updatedCount: number;
  duplicatesSkipped?: number;
  warnings: string[];
  sourceStats?: SourceStat[];
  createdAt: string;
  pendingCount?: number;
  savedCount?: number;
  discardedCount?: number;
  reviewedAt?: string;
};

export interface PendingLead {
  id: string;
  workspaceId: string;
  searchRunId: string;
  lead: Lead;
  reviewStatus: "pending";
  duplicateOfId?: string;
  createdAt: string;
  expiresAt: Date;
}

export type AutopilotSchedule = "off" | "daily" | "weekly";

export interface SavedSearch {
  id: string;
  workspaceId: string;
  name: string;
  params: SearchLeadsParams;
  schedule: AutopilotSchedule;
  runAtHour: number;
  timezone: string;
  minScore: number;
  maxLeadsPerRun: number;
  digestEmail?: string;
  active: boolean;
  runningLockAt?: string | null;
  lastRunAt?: string;
  nextRunAt?: string;
  runCount?: number;
  createdAt: string;
}

export interface AutopilotRunSourceStat {
  source: LeadPlatform;
  label: string;
  found: number;
  error?: string;
}

export interface AutopilotRun {
  id: string;
  savedSearchId: string;
  workspaceId: string;
  startedAt: string;
  finishedAt: string;
  perSource: AutopilotRunSourceStat[];
  newLeadIds: string[];
  duplicatesSkipped: number;
  status: "ok" | "partial" | "failed";
  digestStatus?: "sent" | "skipped_zero" | "skipped_no_smtp" | "failed";
  digestError?: string;
  error?: string;
}

export interface WorkspaceSmtpSettings {
  workspaceId: string;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromEmail: string;
  fromName?: string;
  reviewAutopilotLeads?: boolean;
  updatedAt: string;
}
