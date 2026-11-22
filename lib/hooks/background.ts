import { FEATURE_HOOKS } from "@/lib/config";
import { generateHookMessagesForLead } from "@/lib/hooks/generate-messages";
import { getLeadsCollection, isMongoConfigured } from "@/lib/mongodb";
import type { Lead } from "@/types/lead";

/**
 * Generates context-aware hook messages for the top 15 leads of a search run
 * in the background after results are saved, without blocking the search response.
 */
export async function generateHooksForTopLeadsInBackground(
  leads: Lead[]
): Promise<void> {
  if (!FEATURE_HOOKS || !isMongoConfigured() || leads.length === 0) return;

  const top = [...leads]
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 15);

  try {
    const col = await getLeadsCollection();
    for (const lead of top) {
      if (lead.messages?.shortDm) continue;
      try {
        const { hookContext, messages } = await generateHookMessagesForLead(
          lead,
          { workspaceId: lead.workspaceId }
        );
        await col.updateOne(
          { id: lead.id },
          { $set: { hookContext, messages } }
        );
      } catch {
        // Never throw from background hook enrichment
      }
    }
  } catch {
    // Ignore DB errors in background job
  }
}
