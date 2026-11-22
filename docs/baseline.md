# NicheLeads Safety Baseline

Recorded before implementing Feature A (Context-Aware Pitch Hooks) and Feature B (Autopilot Recurring Searches).

## Build & Typecheck
- `npx tsc --noEmit`: Passed (exit code `0`)
- `npm run build`: Passed (exit code `0`, 21 static/dynamic routes built)

## Baseline Real Search (`POST /api/search`)
Parameters:
- `niche`: `"fashion, food"`
- `clientTypes`: `["local_brand", "creator"]`
- `platforms`: `["exa", "reddit", "youtube"]`
- `countries`: `["United States", "United Kingdom"]`
- `excludedCountries`: `["India", "Pakistan", "Bangladesh"]`
- `count`: `10`
- `saveToCrm`: `false`

### Leads Returned Per Source
| Platform | Label | Returned | Kept | Warning / Notes |
| --- | --- | ---: | ---: | --- |
| `exa` | AI Agents | 20 | 20 | None |
| `reddit` | Reddit | 0 | 0 | `Reddit: r/forhire HTTP 403; r/hiring HTTP 403; r/DoneDirect HTTP 403` |
| `youtube` | YouTube | 50 | 47 | None |

Total leads returned after count cap: `10`.

## Stored Shape of 3 Existing Leads (`GET /api/leads?pageSize=3`)
1. `exa-0f4a526f42ea` (`sourcePlatform: "exa"`, `status: "contacted"`, `score: 88`)
   - Keys: `activity`, `aiMessage`, `budgetSignal`, `city`, `country`, `countryVerified`, `createdAt`, `dedupeKey`, `email`, `followers`, `hiringSignal`, `id`, `instagram`, `lastContactedAt`, `lastSeenAt`, `name`, `niche`, `notes`, `postsPerWeek`, `rawText`, `score`, `sourcePlatform`, `sourceSnippet`, `sourceUrl`, `status`, `tags`, `type`, `website`, `whatsapp`, `whyThisLead`, `workspaceId`
2. `exa-7ffaa389f770` (`sourcePlatform: "exa"`, `status: "contacted"`, `score: 88`)
   - Keys: `activity`, `aiMessage`, `budgetSignal`, `city`, `country`, `countryVerified`, `createdAt`, `dedupeKey`, `email`, `followers`, `hiringSignal`, `id`, `instagram`, `lastSeenAt`, `name`, `niche`, `notes`, `postsPerWeek`, `rawText`, `score`, `sourcePlatform`, `sourceSnippet`, `sourceUrl`, `status`, `tags`, `type`, `website`, `whatsapp`, `whyThisLead`, `workspaceId`
3. `exa-7ffbfe083601` (`sourcePlatform: "exa"`, `status: "new"`, `score: 88`)
   - Keys: `activity`, `aiMessage`, `budgetSignal`, `city`, `country`, `countryVerified`, `createdAt`, `dedupeKey`, `email`, `followers`, `hiringSignal`, `id`, `instagram`, `lastSeenAt`, `name`, `niche`, `notes`, `postsPerWeek`, `rawText`, `score`, `sourcePlatform`, `sourceSnippet`, `sourceUrl`, `status`, `tags`, `type`, `website`, `whatsapp`, `whyThisLead`, `workspaceId`
