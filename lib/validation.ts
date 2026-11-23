import { z } from "zod";

export const leadStatusEnum = z.enum([
  "new",
  "contacted",
  "replied",
  "meeting_booked",
  "won",
  "lost",
  "not_fit",
]);

export const leadTypeEnum = z.enum([
  "local_brand",
  "creator",
  "coach",
  "youtuber",
  "agency",
]);

export const leadPlatformEnum = z.enum([
  "youtube",
  "reddit",
  "facebook",
  "instagram",
  "tiktok",
  "x",
  "linkedin",
  "ytjobs",
  "contra",
  "upwork",
  "behance",
  "google_places",
  "google_cse",
  "exa",
  "tavily",
  "csv_import",
  "manual",
]);

export const createLeadSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  text: z.string().trim().max(5000).optional(),
  platform: leadPlatformEnum.optional(),
  type: leadTypeEnum.optional(),
  sourceUrl: z.string().trim().max(500).optional(),
  city: z.string().trim().max(120).optional(),
  country: z.string().trim().max(120).optional(),
  niche: z.string().trim().max(200).optional(),
  email: z.string().trim().max(200).optional(),
  whatsapp: z.string().trim().max(60).optional(),
  instagram: z.string().trim().max(200).optional(),
  website: z.string().trim().max(500).optional(),
  budgetSignal: z.string().trim().max(120).optional(),
  followers: z.number().int().nonnegative().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).optional(),
  workspaceId: z.string().trim().max(60).optional(),
});

export const patchLeadSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  type: leadTypeEnum.optional(),
  city: z.string().trim().max(120).optional(),
  country: z.string().trim().max(120).optional(),
  status: leadStatusEnum.optional(),
  notes: z.string().max(4000).optional(),
  addNote: z.string().trim().min(1).max(2000).optional(),
  aiMessage: z.string().max(4000).optional(),
  email: z.string().trim().max(200).optional(),
  whatsapp: z.string().trim().max(60).optional(),
  instagram: z.string().trim().max(200).optional(),
  website: z.string().trim().max(500).optional(),
  sourceUrl: z.string().trim().max(500).optional(),
  budgetSignal: z.string().trim().max(120).optional(),
  followers: z.number().int().nonnegative().nullable().optional(),
  postsPerWeek: z.number().nonnegative().nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).optional(),
  nextFollowUpAt: z.string().trim().max(60).nullable().optional(),
  lastContactedAt: z.string().trim().max(60).nullable().optional(),
  notFitReason: z.string().trim().max(400).optional(),
  logContact: z.boolean().optional(),
  /** If true, bypass duplicate warning; if mergeIntoId is set, merge into the existing lead */
  force: z.boolean().optional(),
  mergeIntoId: z.string().trim().optional(),
});

export const bulkLeadsSchema = z.object({
  ids: z.array(z.string().trim().min(1)).min(1, "Select at least one lead"),
  action: z.enum(["status", "add_tag", "follow_up", "delete"]),
  status: leadStatusEnum.optional(),
  tag: z.string().trim().min(1).max(40).optional(),
  nextFollowUpAt: z.string().trim().max(60).nullable().optional(),
});

export const savedViewSchema = z.object({
  workspaceId: z.string().trim().min(1).max(60),
  name: z.string().trim().min(1, "View name is required").max(80),
  filters: z.record(z.string(), z.unknown()),
});
