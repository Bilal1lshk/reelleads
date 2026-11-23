import { NextResponse } from "next/server";
import { getDefaultPlatforms } from "@/lib/connectors/orchestrator";
import { getDb, isMongoConfigured } from "@/lib/mongodb";

export async function GET() {
  let mongoConnected = false;
  let mongoError: string | undefined;

  if (isMongoConfigured()) {
    try {
      const db = await getDb();
      await db.command({ ping: 1 });
      mongoConnected = true;
    } catch (err) {
      mongoError = err instanceof Error ? err.message : "Connection failed";
    }
  }

  return NextResponse.json({
    mongodb: {
      configured: isMongoConfigured(),
      connected: mongoConnected,
      error: mongoError,
    },
    defaultPlatforms: getDefaultPlatforms(),
    connectors: {
      reddit: true,
      youtube: Boolean(process.env.YOUTUBE_API_KEY),
      google_cse: false,
      linkedin: Boolean(
        (process.env.GOOGLE_CSE_API_KEY || process.env.Custom_Search_API_KEY) &&
          process.env.GOOGLE_CSE_CX
      ),
      exa: Boolean(process.env.EXA_API_KEY?.trim()),
      tavily: Boolean(process.env.TAVILY_API_KEY?.trim()),
      facebook: Boolean(process.env.FACEBOOK_ACCESS_TOKEN),
      google_places: false,
      instagram: Boolean(process.env.APIFY_API_TOKEN),
      tiktok: false,
      x: false,
      csv_import: true,
      manual: true,
      groq_ai: Boolean(process.env.Groq_API_KEY || process.env.GROQ_API_KEY),
      email_sending: Boolean(process.env.RESEND_API_KEY?.trim()),
    },
  });
}
