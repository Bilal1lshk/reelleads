import { getDb, isMongoConfigured } from "@/lib/mongodb";
import type { Lead, LeadPlatform, SearchLeadsParams } from "@/types/lead";

export const SOURCE_TIMEOUT_MS = 25_000;

export type SourceResult = { leads: Lead[]; warning?: string };

/**
 * Context handed to every connector.
 * - `signal` aborts when the per-source timeout fires; pass it to fetch().
 * - `partial` collects leads as they are produced so they survive a timeout.
 */
export type SourceContext = {
  signal: AbortSignal;
  partial: Lead[];
};

export type Connector = (params: SearchLeadsParams, ctx: SourceContext) => Promise<SourceResult>;

export const SOURCE_LABELS: Record<LeadPlatform, string> = {
  reddit: "Reddit",
  youtube: "YouTube",
  google_cse: "Google",
  google_places: "Google Maps",
  exa: "AI Agents",
  tavily: "Browser Search",
  instagram: "Instagram",
  tiktok: "TikTok",
  x: "X",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  ytjobs: "YTJobs",
  contra: "Contra",
  upwork: "Upwork",
  behance: "Behance",
  csv_import: "CSV import",
  manual: "Manual",
};

/**
 * Run a connector with a hard timeout. On timeout, returns whatever the connector
 * already pushed into ctx.partial plus a warning (never throws).
 */
export async function runSourceWithTimeout(
  label: string,
  connector: (ctx: SourceContext) => Promise<SourceResult>,
  timeoutMs = SOURCE_TIMEOUT_MS
): Promise<SourceResult & { timedOut: boolean }> {
  const controller = new AbortController();
  const ctx: SourceContext = { signal: controller.signal, partial: [] };
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), timeoutMs);
  });

  try {
    const outcome = await Promise.race([connector(ctx), timeout]);
    if (outcome === "timeout") {
      controller.abort();
      return {
        leads: [...ctx.partial],
        warning: `${label}: timed out after ${Math.round(timeoutMs / 1000)}s, returning ${ctx.partial.length} partial results`,
        timedOut: true,
      };
    }
    return { ...outcome, timedOut: false };
  } catch (err) {
    return {
      leads: [...ctx.partial],
      warning: `${label}: ${err instanceof Error ? err.message : "failed"}`,
      timedOut: false,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Map with bounded concurrency. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, idx: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Split the niche input ("fashion, food, real estate") into distinct niches. */
export function splitNiches(niche: string): string[] {
  const parts = niche
    .split(/[,;/|]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return Array.from(new Set(parts.length > 0 ? parts : [niche.trim()])).slice(0, 6);
}

// ---------------------------------------------------------------------------
// 24h search cache (MongoDB). Silently becomes a no-op when Mongo is not set.
// ---------------------------------------------------------------------------

type CacheDoc = { key: string; value: unknown; createdAt: Date };
let cacheIndexEnsured = false;

async function cacheCollection() {
  const db = await getDb();
  const col = db.collection<CacheDoc>("search_cache");
  if (!cacheIndexEnsured) {
    cacheIndexEnsured = true;
    await Promise.all([
      col.createIndex({ key: 1 }, { unique: true }),
      col.createIndex({ createdAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 }),
    ]).catch(() => {
      cacheIndexEnsured = false;
    });
  }
  return col;
}

export async function getCached<T>(key: string, maxAgeMs = 24 * 60 * 60 * 1000): Promise<T | undefined> {
  if (!isMongoConfigured()) return undefined;
  try {
    const col = await cacheCollection();
    const doc = await col.findOne({ key });
    if (!doc) return undefined;
    if (Date.now() - new Date(doc.createdAt).getTime() > maxAgeMs) return undefined;
    return doc.value as T;
  } catch {
    return undefined;
  }
}

export async function setCached(key: string, value: unknown): Promise<void> {
  if (!isMongoConfigured()) return;
  try {
    const col = await cacheCollection();
    await col.updateOne({ key }, { $set: { key, value, createdAt: new Date() } }, { upsert: true });
  } catch {
    // cache is best-effort
  }
}
