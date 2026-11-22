import { create } from "zustand";
import type {
  LeadFilters,
  LeadPlatform,
  LeadStatus,
  LeadType,
} from "@/types/lead";

export type WorkspaceId = "default";

interface LeadsUIState {
  workspaceId: WorkspaceId;
  sidebarCollapsed: boolean;
  selectedIds: string[];
  activeLeadId: string | null;
  reviewModalOpen: boolean;
  reviewSearchRunId: string | null;
  newSearchBannerRunId: string | null;
  filters: LeadFilters;
  setWorkspaceId: (id: WorkspaceId) => void;
  toggleSidebar: () => void;
  toggleSelectId: (id: string) => void;
  setSelectedIds: (ids: string[]) => void;
  clearSelectedIds: () => void;
  openDrawer: (id: string) => void;
  closeDrawer: () => void;
  openReviewModal: (searchRunId?: string | null) => void;
  closeReviewModal: () => void;
  notifyNewSearchResults: (searchRunId: string) => void;
  switchReviewToNewSearch: () => void;
  setSearch: (search: string) => void;
  setTypeFilter: (type: LeadType | "all") => void;
  setPlatformFilter: (platform: LeadPlatform | "all") => void;
  setCountryFilter: (country: string) => void;
  setTagFilter: (tag: string) => void;
  setMinScore: (minScore: number) => void;
  setMaxScore: (maxScore: number) => void;
  setHasWhatsApp: (hasWhatsApp: boolean) => void;
  setHasEmail: (hasEmail: boolean) => void;
  setDateFrom: (dateFrom: string) => void;
  setDateTo: (dateTo: string) => void;
  setStatusFilter: (status: LeadStatus | "all") => void;
  setQualityOnly: (qualityOnly: boolean) => void;
  setShowLowScore: (showLowScore: boolean) => void;
  setSort: (sortBy: string, sortDir?: "asc" | "desc") => void;
  setSortBy: (sortBy: string) => void;
  setPage: (page: number) => void;
  applyFilters: (partial: Partial<LeadFilters>) => void;
  resetFilters: () => void;
}

export const DEFAULT_FILTERS: LeadFilters = {
  search: "",
  type: "all",
  platform: "all",
  country: "all",
  tag: "",
  minScore: 0,
  maxScore: 0,
  hasWhatsApp: false,
  hasEmail: false,
  dateFrom: "",
  dateTo: "",
  status: "all",
  qualityOnly: true,
  showLowScore: false,
  sortBy: "score",
  sortDir: "desc",
  page: 1,
  pageSize: 50,
};

export const useLeadsStore = create<LeadsUIState>((set) => ({
  workspaceId: "default",
  sidebarCollapsed: false,
  selectedIds: [],
  activeLeadId: null,
  reviewModalOpen: false,
  reviewSearchRunId: null,
  newSearchBannerRunId: null,
  filters: { ...DEFAULT_FILTERS },
  setWorkspaceId: (workspaceId) =>
    set((state) => ({
      workspaceId,
      selectedIds: [],
      activeLeadId: null,
      filters: { ...state.filters, page: 1 },
    })),
  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  toggleSelectId: (id) =>
    set((state) => ({
      selectedIds: state.selectedIds.includes(id)
        ? state.selectedIds.filter((item) => item !== id)
        : [...state.selectedIds, id],
    })),
  setSelectedIds: (ids) => set({ selectedIds: ids }),
  clearSelectedIds: () => set({ selectedIds: [] }),
  openDrawer: (id) => set({ activeLeadId: id }),
  closeDrawer: () => set({ activeLeadId: null }),
  openReviewModal: (searchRunId = null) =>
    set({
      reviewModalOpen: true,
      reviewSearchRunId: searchRunId ?? null,
      newSearchBannerRunId: null,
    }),
  closeReviewModal: () =>
    set({
      reviewModalOpen: false,
      newSearchBannerRunId: null,
    }),
  notifyNewSearchResults: (searchRunId) =>
    set((state) =>
      state.reviewModalOpen
        ? { newSearchBannerRunId: searchRunId }
        : {
            reviewModalOpen: true,
            reviewSearchRunId: searchRunId,
            newSearchBannerRunId: null,
          }
    ),
  switchReviewToNewSearch: () =>
    set((state) => ({
      reviewSearchRunId: state.newSearchBannerRunId,
      newSearchBannerRunId: null,
    })),
  setSearch: (search) =>
    set((state) => ({ filters: { ...state.filters, search, page: 1 } })),
  setTypeFilter: (type) =>
    set((state) => ({ filters: { ...state.filters, type, page: 1 } })),
  setPlatformFilter: (platform) =>
    set((state) => ({ filters: { ...state.filters, platform, page: 1 } })),
  setCountryFilter: (country) =>
    set((state) => ({ filters: { ...state.filters, country, page: 1 } })),
  setTagFilter: (tag) =>
    set((state) => ({ filters: { ...state.filters, tag, page: 1 } })),
  setMinScore: (minScore) =>
    set((state) => ({ filters: { ...state.filters, minScore, page: 1 } })),
  setMaxScore: (maxScore) =>
    set((state) => ({ filters: { ...state.filters, maxScore, page: 1 } })),
  setHasWhatsApp: (hasWhatsApp) =>
    set((state) => ({ filters: { ...state.filters, hasWhatsApp, page: 1 } })),
  setHasEmail: (hasEmail) =>
    set((state) => ({ filters: { ...state.filters, hasEmail, page: 1 } })),
  setDateFrom: (dateFrom) =>
    set((state) => ({ filters: { ...state.filters, dateFrom, page: 1 } })),
  setDateTo: (dateTo) =>
    set((state) => ({ filters: { ...state.filters, dateTo, page: 1 } })),
  setStatusFilter: (status) =>
    set((state) => ({ filters: { ...state.filters, status, page: 1 } })),
  setQualityOnly: (qualityOnly) =>
    set((state) => ({ filters: { ...state.filters, qualityOnly, page: 1 } })),
  setShowLowScore: (showLowScore) =>
    set((state) => ({ filters: { ...state.filters, showLowScore, page: 1 } })),
  setSort: (sortBy, sortDir) =>
    set((state) => ({
      filters: {
        ...state.filters,
        sortBy,
        sortDir:
          sortDir ??
          (state.filters.sortBy === sortBy && state.filters.sortDir === "desc"
            ? "asc"
            : "desc"),
        page: 1,
      },
    })),
  setSortBy: (sortBy) =>
    set((state) => ({ filters: { ...state.filters, sortBy, page: 1 } })),
  setPage: (page) =>
    set((state) => ({ filters: { ...state.filters, page } })),
  applyFilters: (partial) =>
    set(() => ({ filters: { ...DEFAULT_FILTERS, ...partial, page: 1 } })),
  resetFilters: () => set({ filters: { ...DEFAULT_FILTERS } }),
}));
