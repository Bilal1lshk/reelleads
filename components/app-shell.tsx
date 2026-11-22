"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Bookmark,
  Columns3,
  FileSpreadsheet,
  Inbox,
  LayoutGrid,
  Mail,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Repeat,
  Search,
  Settings,
  Users,
  X,
} from "lucide-react";
import { getPendingLeads } from "@/lib/api";
import { FEATURE_AUTOPILOT, FEATURE_REVIEW_BEFORE_SAVE } from "@/lib/config";
import { useLeadsStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { PendingReviewModal } from "@/components/pending-review-modal";
import { useToast } from "@/components/providers";

const NAV_ITEMS = [
  { href: "/", label: "Overview", icon: LayoutGrid },
  { href: "/leads", label: "Leads", icon: Users },
  ...(FEATURE_REVIEW_BEFORE_SAVE
    ? [{ href: "/review", label: "Review", icon: Inbox }]
    : []),
  { href: "/pipeline", label: "Pipeline", icon: Columns3 },
  { href: "/search", label: "Search", icon: Search },
  ...(FEATURE_AUTOPILOT
    ? [{ href: "/autopilot", label: "Autopilot", icon: Repeat }]
    : []),
  { href: "/campaigns", label: "Campaigns", icon: Mail },
  { href: "/saved", label: "Saved lists", icon: Bookmark },
  { href: "/database", label: "Import/Export", icon: FileSpreadsheet },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    workspaceId,
    sidebarCollapsed,
    toggleSidebar,
    filters,
    setSearch,
    openReviewModal,
  } = useLeadsStore();
  const { notify } = useToast();

  const { data: pendingData } = useQuery({
    queryKey: ["pending-leads", workspaceId, "all"],
    queryFn: () => getPendingLeads(workspaceId),
    enabled: FEATURE_REVIEW_BEFORE_SAVE,
    staleTime: 15_000,
  });

  const pendingCount = pendingData?.total ?? 0;
  const initialToastShownRef = React.useRef(false);

  React.useEffect(() => {
    if (!FEATURE_REVIEW_BEFORE_SAVE) return;
    if (initialToastShownRef.current) return;
    if (pendingCount > 0) {
      initialToastShownRef.current = true;
      notify(`${pendingCount} leads found. Review`, "success", {
        label: "Review",
        onClick: () => openReviewModal(null),
      });
    }
  }, [notify, openReviewModal, pendingCount]);

  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleGlobalSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pathname.startsWith("/leads")) {
      router.push("/leads");
    }
  };

  return (
    <div className="min-h-dvh flex bg-gray-50 text-gray-900 dark:bg-neutral-950 dark:text-gray-100">
      {/* Desktop Left Sidebar */}
      <aside
        aria-label="Sidebar navigation"
        className={cn(
          "hidden md:flex flex-col shrink-0 border-r border-gray-200 bg-white dark:border-neutral-800 dark:bg-neutral-900 transition-[width] duration-150",
          sidebarCollapsed ? "w-14" : "w-[220px]"
        )}
      >
        <div className="flex h-12 items-center justify-between border-b border-gray-200 px-3 dark:border-neutral-800">
          {!sidebarCollapsed && (
            <span className="truncate text-sm font-semibold tracking-tight text-gray-900 dark:text-gray-100">
              NicheLeads
            </span>
          )}
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 dark:text-gray-400 dark:hover:bg-neutral-800 dark:hover:text-gray-200 cursor-pointer"
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        </div>

        <nav className="flex-1 space-y-1 p-2">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={sidebarCollapsed ? item.label : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600",
                  active
                    ? "bg-gray-100 text-gray-900 dark:bg-neutral-800 dark:text-gray-100"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-neutral-800/60 dark:hover:text-gray-100",
                  sidebarCollapsed && "justify-center px-0"
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0",
                    active
                      ? "text-indigo-600 dark:text-indigo-400"
                      : "text-gray-500 dark:text-gray-400"
                  )}
                />
                {!sidebarCollapsed && (
                  <span className="flex flex-1 items-center justify-between gap-2">
                    <span>{item.label}</span>
                    {item.href === "/review" && pendingCount > 0 && (
                      <span className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-indigo-600 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white">
                        {pendingCount}
                      </span>
                    )}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {!sidebarCollapsed && (
          <div className="border-t border-gray-200 px-3 py-2.5 text-xs text-gray-500 dark:border-neutral-800 dark:text-gray-400">
            NicheLeads CRM
          </div>
        )}
      </aside>

      {/* Mobile Drawer Nav */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div
            className="fixed inset-0 bg-gray-900/30"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="relative z-50 flex w-[220px] flex-col border-r border-gray-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex h-12 items-center justify-between border-b border-gray-200 px-3 dark:border-neutral-800">
              <span className="truncate text-sm font-semibold tracking-tight text-gray-900 dark:text-gray-100">
                NicheLeads
              </span>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                aria-label="Close navigation"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <nav className="flex-1 space-y-1 p-2">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileNavOpen(false)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium",
                      active
                        ? "bg-gray-100 text-gray-900 dark:bg-neutral-800 dark:text-gray-100"
                        : "text-gray-600 hover:bg-gray-50 dark:text-gray-400"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-gray-500" />
                    <span className="flex flex-1 items-center justify-between gap-2">
                      <span>{item.label}</span>
                      {item.href === "/review" && pendingCount > 0 && (
                        <span className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-indigo-600 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white">
                          {pendingCount}
                        </span>
                      )}
                    </span>
                  </Link>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation"
              className="inline-flex md:hidden h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-neutral-800 dark:text-gray-300"
            >
              <Menu className="h-4 w-4" />
            </button>
            <form onSubmit={handleGlobalSearchSubmit} className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                ref={searchInputRef}
                type="search"
                aria-label="Global lead search"
                placeholder="Search leads... (Cmd+K)"
                value={filters.search ?? ""}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 w-full rounded-lg border border-gray-200 bg-gray-50 pl-8 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus-visible:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 dark:border-neutral-800 dark:bg-neutral-950 dark:text-gray-100 dark:placeholder:text-gray-500"
              />
            </form>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1400px] flex-1 p-4 sm:p-6">
          {children}
        </main>
      </div>
      <PendingReviewModal />
    </div>
  );
}
