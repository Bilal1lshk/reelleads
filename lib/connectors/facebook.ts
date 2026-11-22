import {
  buildPersonalizedPitch,
  computeLeadScore,
  extractContactsFromText,
} from "@/lib/connectors/scoring";
import { buildDedupeKey } from "@/lib/mongodb";
import type { Lead, LeadType, SearchLeadsParams } from "@/types/lead";

interface GraphPage {
  id: string;
  name?: string;
  link?: string;
  about?: string;
  description?: string;
  category?: string;
  website?: string;
  fan_count?: number;
  followers_count?: number;
  emails?: string[];
  phone?: string;
  location?: {
    city?: string;
    country?: string;
  };
}

interface GraphPost {
  created_time?: string;
  message?: string;
  attachments?: {
    data?: Array<{
      type?: string;
      media_type?: string;
    }>;
  };
}

async function analyzePagePosts(
  pageId: string,
  accessToken: string
): Promise<{ postsPerWeek?: number; videoPostsCount: number }> {
  try {
    const url = new URL(`https://graph.facebook.com/v21.0/${pageId}/posts`);
    url.searchParams.set("fields", "created_time,message,attachments{type,media_type}");
    url.searchParams.set("limit", "15");
    url.searchParams.set("access_token", accessToken);

    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { videoPostsCount: 0 };

    const data = (await res.json()) as { data?: GraphPost[] };
    const posts = data.data ?? [];
    if (posts.length === 0) return { videoPostsCount: 0 };

    const videoPostsCount = posts.filter((p) =>
      (p.attachments?.data ?? []).some(
        (a) =>
          a.type?.includes("video") ||
          a.media_type?.toLowerCase() === "video"
      )
    ).length;

    const dates = posts
      .map((p) => (p.created_time ? new Date(p.created_time).getTime() : 0))
      .filter((t) => t > 0)
      .sort((a, b) => b - a);

    let postsPerWeek: number | undefined;
    if (dates.length >= 2) {
      const spanDays = Math.max(
        1,
        (dates[0] - dates[dates.length - 1]) / (1000 * 60 * 60 * 24)
      );
      postsPerWeek = Math.max(
        1,
        Math.round((posts.length / spanDays) * 7)
      );
    }

    return { postsPerWeek, videoPostsCount };
  } catch {
    return { videoPostsCount: 0 };
  }
}

function inferTypeFromCategory(
  category?: string,
  fallback: LeadType = "local_brand"
): LeadType {
  const c = (category || "").toLowerCase();
  if (c.includes("agency") || c.includes("marketing")) return "agency";
  if (c.includes("coach") || c.includes("fitness") || c.includes("consultant"))
    return "coach";
  if (c.includes("creator") || c.includes("blogger") || c.includes("artist"))
    return "creator";
  return fallback;
}

export async function fetchFacebookLeads(
  params: SearchLeadsParams
): Promise<{ leads: Lead[]; warning?: string }> {
  const accessToken = process.env.FACEBOOK_ACCESS_TOKEN;
  if (!accessToken) {
    return {
      leads: [],
      warning:
        "Facebook: Set FACEBOOK_ACCESS_TOKEN in .env (requires Meta PPCA/PPMA approval) or Quick-Add Facebook Pages in Lead Database.",
    };
  }

  try {
    const query = [params.niche, params.city, params.country]
      .filter(Boolean)
      .join(" ");

    const searchUrl = new URL("https://graph.facebook.com/v21.0/pages/search");
    searchUrl.searchParams.set("q", query);
    searchUrl.searchParams.set(
      "fields",
      "id,name,link,about,description,category,location,website,fan_count,followers_count,emails,phone"
    );
    searchUrl.searchParams.set("limit", String(Math.min(params.count, 15)));
    searchUrl.searchParams.set("access_token", accessToken);

    const res = await fetch(searchUrl.toString(), {
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const msg =
        (errBody as { error?: { message?: string } })?.error?.message ||
        `HTTP ${res.status}`;
      return {
        leads: [],
        warning: `Facebook Graph API: ${msg}`,
      };
    }

    const json = (await res.json()) as { data?: GraphPage[] };
    const pages = json.data ?? [];

    const leads: Lead[] = [];
    for (const page of pages) {
      const name = page.name || "Facebook Page";
      const aboutText = page.about || page.description || "";
      const extracted = extractContactsFromText(aboutText);
      const { postsPerWeek, videoPostsCount } = await analyzePagePosts(
        page.id,
        accessToken
      );

      const followers = page.followers_count ?? page.fan_count;
      const email = page.emails?.[0] || extracted.email;
      const whatsapp = page.phone || extracted.whatsapp;
      const type = inferTypeFromCategory(
        page.category,
        params.clientTypes[0] || "local_brand"
      );

      const partial: Partial<Lead> = {
        name,
        type,
        city: page.location?.city || params.city || "",
        country: page.location?.country || params.country || "Global",
        followers,
        postsPerWeek,
        email,
        whatsapp,
        instagram: extracted.instagram,
        website: page.website || extracted.website,
        sourcePlatform: "facebook",
        sourceUrl: page.link || `https://facebook.com/${page.id}`,
        niche: params.niche,
      };

      const whyParts = [
        `Facebook Page (${page.category || "Business"})`,
        postsPerWeek ? `posts ~${postsPerWeek}x/week` : null,
        videoPostsCount > 0 ? `${videoPostsCount} recent video posts` : null,
        followers ? `${followers.toLocaleString()} followers` : null,
      ].filter(Boolean);

      const lead: Lead = {
        id: `fb-${page.id}`,
        name,
        type,
        city: partial.city!,
        country: partial.country!,
        score: computeLeadScore(partial),
        whyThisLead: whyParts.join(" · "),
        email,
        whatsapp,
        instagram: extracted.instagram,
        website: partial.website,
        followers,
        postsPerWeek,
        aiMessage: buildPersonalizedPitch({
          name,
          type,
          niche: params.niche,
          platform: "facebook",
        }),
        status: "new",
        notes: aboutText.slice(0, 280) || undefined,
        createdAt: new Date().toISOString(),
        sourcePlatform: "facebook",
        sourceUrl: partial.sourceUrl,
        niche: params.niche,
      };
      lead.dedupeKey = buildDedupeKey(lead);
      leads.push(lead);
    }

    return { leads };
  } catch (err) {
    return {
      leads: [],
      warning: `Facebook: ${
        err instanceof Error ? err.message : "unknown error"
      }`,
    };
  }
}
