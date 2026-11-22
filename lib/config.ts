import { EUROPE_COUNTRIES } from "@/lib/countries";
import type { LeadType } from "@/types/lead";

export const FEATURE_HOOKS = true;
export const FEATURE_AUTOPILOT = true;
export const FEATURE_REVIEW_BEFORE_SAVE = true;

export const APP_CONFIG = {
  appName: "NicheLeads",
  clientName: "",
  niche: "Reels editing",
  targetClients: "Brands, creators and business owners",
  location: "Europe & USA",
} as const;

export type ClientProfile = {
  id: string;
  name: string;
  /** Short, factual description of the editor's offer (used in outreach copy). */
  offer: string;
  niches: string[];
  countries: string[];
  excludedCountries: string[];
  clientTypes: LeadType[];
};

export const DEFAULT_PROFILE: ClientProfile = {
  id: "default",
  name: "Workspace",
  offer: "reels editor for fashion, food, real estate, talking-head and faceless videos",
  niches: ["fashion", "food", "real estate", "talking head", "faceless videos"],
  countries: ["United States", ...EUROPE_COUNTRIES],
  excludedCountries: ["India", "Pakistan", "Bangladesh"],
  clientTypes: ["local_brand", "creator", "coach", "youtuber", "agency"],
};

export const CLIENT_PROFILES: ClientProfile[] = [DEFAULT_PROFILE];

export function getClientProfile(_name?: string): ClientProfile {
  return DEFAULT_PROFILE;
}
