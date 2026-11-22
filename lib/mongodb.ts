import { Collection, Db, MongoClient } from "mongodb";
import type {
  AutopilotRun,
  Lead,
  PendingLead,
  SavedSearch,
  SavedView,
  SearchRun,
  WorkspaceSmtpSettings,
} from "@/types/lead";

declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
  var _mongoIndexesEnsured: boolean | undefined;
}

const DB_NAME = process.env.MONGODB_DB_NAME || "nicheleads";

export function isMongoConfigured(): boolean {
  return Boolean(process.env.MONGODB_URI && process.env.MONGODB_URI.trim().length > 0);
}

export async function getMongoClient(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      "MONGODB_URI is not set. Add it to .env.local to connect to MongoDB."
    );
  }

  if (!globalThis._mongoClientPromise) {
    const client = new MongoClient(uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
    });
    globalThis._mongoClientPromise = client.connect();
  }

  return globalThis._mongoClientPromise;
}

export async function getDb(): Promise<Db> {
  const client = await getMongoClient();
  const db = client.db(DB_NAME);

  if (!globalThis._mongoIndexesEnsured) {
    globalThis._mongoIndexesEnsured = true;
    await ensureIndexes(db).catch((err) => {
      globalThis._mongoIndexesEnsured = false;
      console.error("Failed to ensure MongoDB indexes:", err);
    });
  }

  return db;
}

async function ensureIndexes(db: Db): Promise<void> {
  const leads = db.collection<Lead>("leads");
  await Promise.all([
    leads.createIndex({ id: 1 }, { unique: true }),
    leads.createIndex({ dedupeKey: 1 }, { unique: true, sparse: true }),
    leads.createIndex({ score: -1 }),
    leads.createIndex({ status: 1 }),
    leads.createIndex({ type: 1 }),
    leads.createIndex({ sourcePlatform: 1 }),
    leads.createIndex({ workspaceId: 1 }),
    leads.createIndex({ nextFollowUpAt: 1 }),
    leads.createIndex({ tags: 1 }),
    leads.createIndex({ createdAt: -1 }),
    leads.createIndex({
      name: "text",
      city: "text",
      whyThisLead: "text",
      niche: "text",
    }),
  ]);

  const runs = db.collection<SearchRun>("search_runs");
  await runs.createIndex({ createdAt: -1 });

  const views = db.collection<SavedView>("saved_views");
  await Promise.all([
    views.createIndex({ id: 1 }, { unique: true }),
    views.createIndex({ workspaceId: 1, createdAt: -1 }),
  ]);

  const savedSearches = db.collection<SavedSearch>("saved_searches");
  await Promise.all([
    savedSearches.createIndex({ id: 1 }, { unique: true }),
    savedSearches.createIndex({ workspaceId: 1, active: 1, nextRunAt: 1 }),
  ]);

  const autopilotRuns = db.collection<AutopilotRun>("autopilot_runs");
  await Promise.all([
    autopilotRuns.createIndex({ id: 1 }, { unique: true }),
    autopilotRuns.createIndex({ savedSearchId: 1, startedAt: -1 }),
  ]);

  const workspaceSettings = db.collection<WorkspaceSmtpSettings>("workspace_settings");
  await workspaceSettings.createIndex({ workspaceId: 1 }, { unique: true });

  const pendingLeads = db.collection<PendingLead>("pending_leads");
  await Promise.all([
    pendingLeads.createIndex({ id: 1 }, { unique: true }),
    pendingLeads.createIndex({ workspaceId: 1, reviewStatus: 1, createdAt: -1 }),
    pendingLeads.createIndex({ searchRunId: 1 }),
    pendingLeads.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);

  await leads.createIndex({ freshAt: -1 });
}

export async function getLeadsCollection(): Promise<Collection<Lead>> {
  const db = await getDb();
  return db.collection<Lead>("leads");
}

export async function getSearchRunsCollection(): Promise<Collection<SearchRun>> {
  const db = await getDb();
  return db.collection<SearchRun>("search_runs");
}

export async function getSavedViewsCollection(): Promise<Collection<SavedView>> {
  const db = await getDb();
  return db.collection<SavedView>("saved_views");
}

export async function getSavedSearchesCollection(): Promise<Collection<SavedSearch>> {
  const db = await getDb();
  return db.collection<SavedSearch>("saved_searches");
}

export async function getAutopilotRunsCollection(): Promise<Collection<AutopilotRun>> {
  const db = await getDb();
  return db.collection<AutopilotRun>("autopilot_runs");
}

export async function getWorkspaceSettingsCollection(): Promise<Collection<WorkspaceSmtpSettings>> {
  const db = await getDb();
  return db.collection<WorkspaceSmtpSettings>("workspace_settings");
}

export async function getPendingLeadsCollection(): Promise<Collection<PendingLead>> {
  const db = await getDb();
  return db.collection<PendingLead>("pending_leads");
}

export function buildDedupeKey(lead: Partial<Lead>): string {
  if (lead.email?.trim()) {
    return `email:${lead.email.trim().toLowerCase()}`;
  }
  if (lead.instagram?.trim()) {
    const handle = lead.instagram
      .trim()
      .toLowerCase()
      .replace(/^@/, "")
      .replace(/^https?:\/\/(www\.)?instagram\.com\//, "")
      .replace(/\/+$/, "");
    return `ig:${handle}`;
  }
  if (lead.sourceUrl?.trim()) {
    return `url:${lead.sourceUrl.trim().toLowerCase()}`;
  }
  if (lead.website?.trim()) {
    const domain = lead.website
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\/(www\.)?/, "")
      .replace(/\/+$/, "");
    return `web:${domain}`;
  }
  return `name:${(lead.name || "unknown").trim().toLowerCase()}:${(
    lead.city || ""
  )
    .trim()
    .toLowerCase()}`;
}
