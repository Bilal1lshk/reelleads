import type { Lead } from "@/types/lead";

/**
 * Canonical country list with aliases and major cities.
 * - `aliases` are matched case-insensitively on word boundaries.
 * - `codes` are short uppercase codes matched CASE-SENSITIVELY only (so "us" the word never matches).
 * - `cities` are matched case-insensitively on word boundaries and imply the country.
 */
type CountryDef = {
  name: string;
  iso2: string;
  aliases: string[];
  codes: string[];
  cities: string[];
  demonyms?: string[];
  /** Default city used when a connector needs a location keyword (e.g. Instagram search) */
  hubCity?: string;
};

export const COUNTRY_DEFS: CountryDef[] = [
  { name: "United States", iso2: "US", aliases: ["united states", "usa", "u.s.a"], codes: ["US", "USA"], cities: ["new york", "nyc", "los angeles", "miami", "chicago", "houston", "san francisco", "atlanta", "seattle", "boston", "las vegas", "san diego", "denver", "brooklyn", "manhattan"], demonyms: ["american"], hubCity: "new york" },
  { name: "United Kingdom", iso2: "GB", aliases: ["united kingdom", "great britain", "england", "scotland", "wales"], codes: ["UK", "GB"], cities: ["london", "manchester", "birmingham", "liverpool", "leeds", "glasgow", "edinburgh", "bristol"], demonyms: ["british"], hubCity: "london" },
  { name: "Germany", iso2: "DE", aliases: ["germany", "deutschland"], codes: ["DE"], cities: ["berlin", "munich", "mÃ¼nchen", "hamburg", "frankfurt", "cologne", "kÃ¶ln", "dÃ¼sseldorf", "stuttgart"], demonyms: ["german"], hubCity: "berlin" },
  { name: "France", iso2: "FR", aliases: ["france"], codes: ["FR"], cities: ["paris", "lyon", "marseille"], demonyms: ["french"], hubCity: "paris" },
  { name: "Italy", iso2: "IT", aliases: ["italy", "italia"], codes: [], cities: ["milan", "milano", "rome", "roma", "florence", "naples"], demonyms: ["italian"], hubCity: "milan" },
  { name: "Spain", iso2: "ES", aliases: ["spain", "espaÃ±a"], codes: [], cities: ["madrid", "barcelona", "valencia", "seville", "marbella"], demonyms: ["spanish"], hubCity: "madrid" },
  { name: "Netherlands", iso2: "NL", aliases: ["netherlands", "holland"], codes: ["NL"], cities: ["amsterdam", "rotterdam", "the hague", "utrecht"], demonyms: ["dutch"], hubCity: "amsterdam" },
  { name: "Ireland", iso2: "IE", aliases: ["ireland"], codes: [], cities: ["dublin"], demonyms: ["irish"], hubCity: "dublin" },
  { name: "Belgium", iso2: "BE", aliases: ["belgium"], codes: [], cities: ["brussels", "antwerp"], hubCity: "brussels" },
  { name: "Switzerland", iso2: "CH", aliases: ["switzerland"], codes: [], cities: ["zurich", "zÃ¼rich", "geneva"], demonyms: ["swiss"], hubCity: "zurich" },
  { name: "Austria", iso2: "AT", aliases: ["austria"], codes: [], cities: ["vienna", "wien"], hubCity: "vienna" },
  { name: "Portugal", iso2: "PT", aliases: ["portugal"], codes: [], cities: ["lisbon", "porto"], demonyms: ["portuguese"], hubCity: "lisbon" },
  { name: "Sweden", iso2: "SE", aliases: ["sweden"], codes: [], cities: ["stockholm", "gothenburg"], demonyms: ["swedish"], hubCity: "stockholm" },
  { name: "Denmark", iso2: "DK", aliases: ["denmark"], codes: [], cities: ["copenhagen"], demonyms: ["danish"], hubCity: "copenhagen" },
  { name: "Norway", iso2: "NO", aliases: ["norway"], codes: [], cities: ["oslo"], demonyms: ["norwegian"], hubCity: "oslo" },
  { name: "Poland", iso2: "PL", aliases: ["poland"], codes: [], cities: ["warsaw", "krakow"], demonyms: ["polish"], hubCity: "warsaw" },
  { name: "Canada", iso2: "CA", aliases: ["canada"], codes: [], cities: ["toronto", "vancouver", "montreal", "calgary"], demonyms: ["canadian"], hubCity: "toronto" },
  { name: "Australia", iso2: "AU", aliases: ["australia"], codes: ["AU"], cities: ["sydney", "melbourne", "brisbane", "perth"], demonyms: ["australian", "aussie"], hubCity: "sydney" },
  { name: "Lebanon", iso2: "LB", aliases: ["lebanon", "liban", "Ù„Ø¨Ù†Ø§Ù†"], codes: [], cities: ["beirut", "Ø¨ÙŠØ±ÙˆØª", "jounieh", "byblos", "jbeil", "tripoli lebanon", "achrafieh", "hamra", "zalka", "dbayeh", "batroun"], demonyms: ["lebanese"], hubCity: "beirut" },
  { name: "United Arab Emirates", iso2: "AE", aliases: ["united arab emirates", "emirates", "Ø§Ù„Ø¥Ù…Ø§Ø±Ø§Øª"], codes: ["UAE"], cities: ["dubai", "Ø¯Ø¨ÙŠ", "abu dhabi", "sharjah", "ajman"], demonyms: ["emirati"], hubCity: "dubai" },
  { name: "Saudi Arabia", iso2: "SA", aliases: ["saudi arabia", "saudi", "Ø§Ù„Ø³Ø¹ÙˆØ¯ÙŠØ©"], codes: ["KSA"], cities: ["riyadh", "Ø§Ù„Ø±ÙŠØ§Ø¶", "jeddah", "Ø¬Ø¯Ø©", "dammam", "khobar", "mecca"], demonyms: ["saudi"], hubCity: "riyadh" },
  { name: "Qatar", iso2: "QA", aliases: ["qatar", "Ù‚Ø·Ø±"], codes: [], cities: ["doha", "Ø§Ù„Ø¯ÙˆØ­Ø©", "lusail"], demonyms: ["qatari"], hubCity: "doha" },
  { name: "Kuwait", iso2: "KW", aliases: ["kuwait", "Ø§Ù„ÙƒÙˆÙŠØª"], codes: [], cities: [], demonyms: ["kuwaiti"], hubCity: "kuwait" },
  { name: "Bahrain", iso2: "BH", aliases: ["bahrain", "Ø§Ù„Ø¨Ø­Ø±ÙŠÙ†"], codes: [], cities: ["manama"], hubCity: "manama" },
  { name: "Oman", iso2: "OM", aliases: ["oman", "Ø¹Ù…Ø§Ù†"], codes: [], cities: ["muscat"], hubCity: "muscat" },
  { name: "Egypt", iso2: "EG", aliases: ["egypt", "Ù…ØµØ±"], codes: [], cities: ["cairo", "alexandria", "Ø§Ù„Ù‚Ø§Ù‡Ø±Ø©"], demonyms: ["egyptian"], hubCity: "cairo" },
  { name: "Turkey", iso2: "TR", aliases: ["turkey", "tÃ¼rkiye", "turkiye"], codes: [], cities: ["istanbul", "ankara", "izmir"], demonyms: ["turkish"], hubCity: "istanbul" },
  { name: "India", iso2: "IN", aliases: ["india", "bharat"], codes: [], cities: ["mumbai", "delhi", "new delhi", "bangalore", "bengaluru", "hyderabad", "chennai", "kolkata", "pune", "ahmedabad", "jaipur", "noida", "gurgaon", "gurugram", "kerala", "punjab india"], demonyms: ["indian"], hubCity: "mumbai" },
  { name: "Pakistan", iso2: "PK", aliases: ["pakistan"], codes: ["PK"], cities: ["karachi", "lahore", "islamabad", "rawalpindi", "faisalabad", "peshawar", "multan"], demonyms: ["pakistani"], hubCity: "karachi" },
  { name: "Bangladesh", iso2: "BD", aliases: ["bangladesh"], codes: ["BD"], cities: ["dhaka", "chittagong", "chattogram", "sylhet"], demonyms: ["bangladeshi"], hubCity: "dhaka" },
  { name: "Philippines", iso2: "PH", aliases: ["philippines"], codes: [], cities: ["manila", "cebu"], demonyms: ["filipino"], hubCity: "manila" },
  { name: "Nigeria", iso2: "NG", aliases: ["nigeria"], codes: [], cities: ["lagos", "abuja"], demonyms: ["nigerian"], hubCity: "lagos" },
];

/** Countries offered in the UI multi-select (subset, ordered for the demo clients). */
export const SELECTABLE_COUNTRIES = [
  "United States", "United Kingdom", "Germany", "France", "Italy", "Spain", "Netherlands",
  "Ireland", "Belgium", "Switzerland", "Austria", "Portugal", "Sweden", "Denmark", "Norway",
  "Poland", "Canada", "Australia", "Lebanon", "United Arab Emirates", "Saudi Arabia", "Qatar",
  "Kuwait", "Bahrain", "Oman", "Egypt", "Turkey", "India", "Pakistan", "Bangladesh",
];

export const EUROPE_COUNTRIES = [
  "United Kingdom", "Germany", "France", "Italy", "Spain", "Netherlands", "Ireland", "Belgium",
  "Switzerland", "Austria", "Portugal", "Sweden", "Denmark", "Norway", "Poland",
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Unicode-aware "word boundary": not preceded/followed by a letter or digit.
function phraseRegex(phrase: string, flags: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(phrase)}(?![\\p{L}\\p{N}])`, flags);
}

// Demonyms are intentionally NOT used for detection: "Indian restaurant in London" or
// "Lebanese food in Dubai" are legitimate leads in the city's country, not the cuisine's.
const COMPILED = COUNTRY_DEFS.map((def) => ({
  def,
  ci: [...def.aliases, ...def.cities].map((p) => phraseRegex(p, "iu")),
  cs: def.codes.map((c) => phraseRegex(c, "u")),
}));

/** Resolve any alias / ISO code / name to a canonical country def. */
export function findCountry(input?: string | null): CountryDef | undefined {
  if (!input) return undefined;
  const key = input.trim().toLowerCase();
  if (!key || key === "unknown" || key === "global" || key === "remote" || key === "all") return undefined;
  return COUNTRY_DEFS.find(
    (d) =>
      d.name.toLowerCase() === key ||
      d.iso2.toLowerCase() === key ||
      d.aliases.includes(key) ||
      d.codes.some((c) => c.toLowerCase() === key)
  );
}

export function normalizeCountry(input?: string | null): string | undefined {
  return findCountry(input)?.name;
}

/** Every country mentioned in free text (aliases, cities, demonyms, uppercase codes). */
export function detectCountriesInText(text?: string | null): string[] {
  if (!text) return [];
  const found: string[] = [];
  for (const { def, ci, cs } of COMPILED) {
    if (ci.some((re) => re.test(text)) || cs.some((re) => re.test(text))) {
      found.push(def.name);
    }
  }
  return found;
}

/** Detect a city name from text, returning the matched city (title-cased) and its country. */
export function detectCityInText(text?: string | null): { city: string; country: string } | undefined {
  if (!text) return undefined;
  for (const def of COUNTRY_DEFS) {
    for (const city of def.cities) {
      if (phraseRegex(city, "iu").test(text)) {
        return { city: city.replace(/\b\p{L}/gu, (c) => c.toUpperCase()), country: def.name };
      }
    }
  }
  return undefined;
}

/**
 * Pick a location for a lead from the source text only. Never stamps the user's search country.
 * Returns country "Unknown" when the text does not clearly name exactly one country.
 */
export function inferLocationFromText(text: string): { city: string; country: string; verified: boolean } {
  const countries = detectCountriesInText(text);
  if (countries.length === 1) {
    const city = detectCityInText(text);
    return { city: city && city.country === countries[0] ? city.city : "", country: countries[0], verified: true };
  }
  return { city: "", country: "Unknown", verified: false };
}

export function getHubCity(country: string): string | undefined {
  return findCountry(country)?.hubCity;
}

export function getIso2(country: string): string | undefined {
  return findCountry(country)?.iso2;
}

export type CountryCheck = {
  allowed: boolean;
  /** true when the lead's country is known AND in the allowed list */
  verified: boolean;
  reason?: string;
};

/**
 * Strict country filter.
 * - Excluded countries are rejected if they are the lead's country OR are mentioned anywhere
 *   in the lead's text/location (name, snippet, why, notes, city).
 * - With an allow-list: a known country outside the list is rejected; an unknown country is
 *   kept but flagged unverified (ranked lower by the orchestrator).
 */
export function isAllowedCountry(
  lead: Pick<Lead, "country" | "city" | "name"> & Partial<Lead>,
  allowedCountries: string[] = [],
  excludedCountries: string[] = []
): CountryCheck {
  const allowed = allowedCountries.map(normalizeCountry).filter((c): c is string => Boolean(c));
  const excluded = excludedCountries.map(normalizeCountry).filter((c): c is string => Boolean(c));
  const leadCountry = normalizeCountry(lead.country);

  if (excluded.length > 0) {
    if (leadCountry && excluded.includes(leadCountry)) {
      return { allowed: false, verified: false, reason: `country is ${leadCountry}` };
    }
    const haystack = [lead.name, lead.city, lead.sourceSnippet, lead.whyThisLead, lead.notes]
      .filter(Boolean)
      .join("\n");
    const mentioned = detectCountriesInText(haystack).filter((c) => excluded.includes(c));
    if (mentioned.length > 0) {
      return { allowed: false, verified: false, reason: `text mentions ${mentioned.join(", ")}` };
    }
    // WhatsApp country codes for excluded countries (+91 India, +92 Pakistan, +880 Bangladesh)
    const wa = (lead.whatsapp || "").replace(/[^\d+]/g, "");
    // Only explicit international format (+CC) is trusted; bare "91..." collides with US area codes.
    const dialCodes: Record<string, string[]> = { India: ["+91"], Pakistan: ["+92"], Bangladesh: ["+880"] };
    for (const ex of excluded) {
      const codes = dialCodes[ex];
      if (codes && wa.length >= 11 && codes.some((c) => wa.startsWith(c))) {
        return { allowed: false, verified: false, reason: `phone number is from ${ex}` };
      }
    }
  }

  if (allowed.length === 0) {
    return { allowed: true, verified: Boolean(leadCountry) };
  }
  if (!leadCountry) {
    return { allowed: true, verified: false, reason: "country unknown" };
  }
  if (allowed.includes(leadCountry)) {
    return { allowed: true, verified: true };
  }
  return { allowed: false, verified: false, reason: `country ${leadCountry} not in target list` };
}

/** Resolve target + excluded lists from params (supports the legacy single `country` field). */
export function resolveCountryFilters(params: {
  country?: string;
  countries?: string[];
  excludedCountries?: string[];
}): { allowed: string[]; excluded: string[] } {
  const allowedRaw =
    params.countries && params.countries.length > 0
      ? params.countries
      : params.country && params.country !== "all"
        ? [params.country]
        : [];
  const allowed = Array.from(new Set(allowedRaw.map((c) => normalizeCountry(c) || c.trim()).filter(Boolean)));
  const excluded = Array.from(
    new Set((params.excludedCountries ?? []).map((c) => normalizeCountry(c) || c.trim()).filter(Boolean))
  ).filter((c) => !allowed.includes(c));
  return { allowed, excluded };
}
