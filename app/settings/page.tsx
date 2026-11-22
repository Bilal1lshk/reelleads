"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getHealthStatus,
  getSmtpStatus,
  getWorkspacePreferences,
  saveSmtpSettings,
  saveWorkspacePreferences,
  sendTestSmtpEmail,
} from "@/lib/api";
import { FEATURE_AUTOPILOT, FEATURE_REVIEW_BEFORE_SAVE } from "@/lib/config";
import { useLeadsStore } from "@/lib/store";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/providers";

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const { workspaceId } = useLeadsStore();

  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: getHealthStatus,
  });

  const { data: smtpStatus } = useQuery({
    queryKey: ["smtp-status", workspaceId],
    queryFn: () => getSmtpStatus(workspaceId),
    enabled: FEATURE_AUTOPILOT,
  });

  const { data: prefs } = useQuery({
    queryKey: ["workspace-prefs", workspaceId],
    queryFn: () => getWorkspacePreferences(workspaceId),
    enabled: FEATURE_REVIEW_BEFORE_SAVE,
  });

  const [browserNotify, setBrowserNotify] = React.useState(false);

  React.useEffect(() => {
    try {
      setBrowserNotify(
        localStorage.getItem("nicheleads:browser-notify") === "true" &&
          typeof Notification !== "undefined" &&
          Notification.permission === "granted"
      );
    } catch {
      setBrowserNotify(false);
    }
  }, []);

  const prefsMutation = useMutation({
    mutationFn: (reviewAutopilotLeads: boolean) =>
      saveWorkspacePreferences({ workspaceId, reviewAutopilotLeads }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace-prefs", workspaceId] });
      notify("Preferences saved");
    },
    onError: (err) => {
      notify(
        err instanceof Error ? err.message : "Failed to save preferences",
        "error"
      );
    },
  });

  const handleToggleBrowserNotify = async (checked: boolean) => {
    if (!checked) {
      try {
        localStorage.setItem("nicheleads:browser-notify", "false");
      } catch {}
      setBrowserNotify(false);
      return;
    }
    if (typeof Notification === "undefined") {
      notify("Browser notifications are not supported here; using in-app toast.");
      return;
    }
    if (Notification.permission === "granted") {
      try {
        localStorage.setItem("nicheleads:browser-notify", "true");
      } catch {}
      setBrowserNotify(true);
      return;
    }
    if (Notification.permission === "denied") {
      notify("Browser notifications are blocked; falling back to in-app toast.");
      setBrowserNotify(false);
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm === "granted") {
      try {
        localStorage.setItem("nicheleads:browser-notify", "true");
      } catch {}
      setBrowserNotify(true);
      notify("Browser notifications enabled");
    } else {
      notify("Permission not granted; using in-app toast.");
      setBrowserNotify(false);
    }
  };

  const [host, setHost] = React.useState("");
  const [port, setPort] = React.useState("587");
  const [secure, setSecure] = React.useState(false);
  const [user, setUser] = React.useState("");
  const [pass, setPass] = React.useState("");
  const [fromEmail, setFromEmail] = React.useState("");
  const [fromName, setFromName] = React.useState("NicheLeads");
  const [testEmail, setTestEmail] = React.useState("");

  React.useEffect(() => {
    if (smtpStatus?.configured) {
      setHost(smtpStatus.host || "");
      setPort(String(smtpStatus.port || 587));
      setSecure(Boolean(smtpStatus.secure));
      setUser(smtpStatus.user || "");
      setFromEmail(smtpStatus.fromEmail || "");
      setFromName(smtpStatus.fromName || "NicheLeads");
    }
  }, [smtpStatus]);

  const saveSmtpMutation = useMutation({
    mutationFn: () =>
      saveSmtpSettings({
        workspaceId,
        host: host.trim(),
        port: Number(port) || 587,
        secure,
        user: user.trim(),
        pass,
        fromEmail: fromEmail.trim(),
        fromName: fromName.trim() || undefined,
      }),
    onSuccess: () => {
      setPass("");
      queryClient.invalidateQueries({ queryKey: ["smtp-status", workspaceId] });
      notify("SMTP settings saved");
    },
    onError: (err) => {
      notify(
        err instanceof Error ? err.message : "Failed to save SMTP settings",
        "error"
      );
    },
  });

  const testSmtpMutation = useMutation({
    mutationFn: () => sendTestSmtpEmail(testEmail.trim(), workspaceId),
    onSuccess: () => notify("Test digest email sent"),
    onError: (err) => {
      notify(
        err instanceof Error ? err.message : "Test email failed",
        "error"
      );
    },
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-lg font-semibold tracking-tight text-gray-900 dark:text-gray-100">
        Settings
      </h1>

      <section className="rounded-lg border border-gray-200 bg-white p-4 flex items-center justify-between dark:border-neutral-800 dark:bg-neutral-900">
        <div>
          <h2 className="text-sm font-semibold">Appearance</h2>
          <p className="text-xs text-gray-500">
            Light theme by default, neutral gray dark mode.
          </p>
        </div>
        <ThemeToggle />
      </section>

      {FEATURE_REVIEW_BEFORE_SAVE && (
        <section className="rounded-lg border border-gray-200 bg-white p-4 space-y-3 dark:border-neutral-800 dark:bg-neutral-900">
          <h2 className="text-sm font-semibold">Notifications & Review</h2>
          <label className="flex items-center justify-between gap-3 text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
            <span>Notify me when a search finishes</span>
            <input
              type="checkbox"
              checked={browserNotify}
              onChange={(e) => handleToggleBrowserNotify(e.target.checked)}
              className="h-4 w-4 accent-indigo-600"
            />
          </label>
          {FEATURE_AUTOPILOT && (
            <label className="flex items-center justify-between gap-3 border-t border-gray-100 pt-3 text-xs text-gray-700 dark:border-neutral-800 dark:text-gray-300 cursor-pointer">
              <span>Review autopilot leads before saving</span>
              <input
                type="checkbox"
                checked={Boolean(prefs?.reviewAutopilotLeads)}
                disabled={prefsMutation.isPending}
                onChange={(e) => prefsMutation.mutate(e.target.checked)}
                className="h-4 w-4 accent-indigo-600"
              />
            </label>
          )}
        </section>
      )}

      {FEATURE_AUTOPILOT && (
        <section className="rounded-lg border border-gray-200 bg-white p-4 space-y-4 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">SMTP Email Digest</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Used for Autopilot morning digests. Credentials are stored
                server-side and never exposed to the browser.
              </p>
            </div>
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
              {smtpStatus?.configured ? "Configured" : "Not configured"}
            </span>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveSmtpMutation.mutate();
            }}
            className="grid grid-cols-1 gap-3 sm:grid-cols-2"
          >
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">
                SMTP Host
              </label>
              <Input
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="smtp.gmail.com"
                required
              />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-[11px] text-gray-500 mb-1">
                  Port
                </label>
                <Input
                  type="number"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  placeholder="587"
                  required
                />
              </div>
              <label className="flex items-center gap-1.5 pt-5 text-xs text-gray-600 dark:text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={secure}
                  onChange={(e) => setSecure(e.target.checked)}
                  className="h-3.5 w-3.5 accent-indigo-600"
                />
                SSL/TLS
              </label>
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">
                SMTP Username
              </label>
              <Input
                value={user}
                onChange={(e) => setUser(e.target.value)}
                placeholder="you@gmail.com"
                required
              />
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">
                SMTP Password / App Password
              </label>
              <Input
                type="password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                placeholder={
                  smtpStatus?.configured ? "•••••••• (enter to update)" : "App password"
                }
                required
              />
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">
                From Email
              </label>
              <Input
                type="email"
                value={fromEmail}
                onChange={(e) => setFromEmail(e.target.value)}
                placeholder="you@gmail.com"
                required
              />
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">
                From Name (optional)
              </label>
              <Input
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
                placeholder="NicheLeads"
              />
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <Button
                type="submit"
                size="sm"
                disabled={saveSmtpMutation.isPending}
              >
                {saveSmtpMutation.isPending ? "Saving..." : "Save SMTP settings"}
              </Button>
            </div>
          </form>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (testEmail.trim()) testSmtpMutation.mutate();
            }}
            className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3 dark:border-neutral-800"
          >
            <Input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="Send test digest to..."
              className="flex-1 min-w-[200px]"
              required
            />
            <Button
              type="submit"
              size="sm"
              variant="outline"
              disabled={testSmtpMutation.isPending || !smtpStatus?.configured}
            >
              {testSmtpMutation.isPending ? "Sending..." : "Send test email"}
            </Button>
          </form>
        </section>
      )}

      <section className="rounded-lg border border-gray-200 bg-white p-4 space-y-2 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="text-sm font-semibold">Connected services</h2>
        {!health ? (
          <p className="text-xs text-gray-500">Checking...</p>
        ) : (
          <ul className="divide-y divide-gray-100 text-xs dark:divide-neutral-800">
            <li className="flex justify-between py-1.5">
              <span>MongoDB</span>
              <span className="font-medium">
                {health.mongodb.connected ? "Connected" : "Disconnected"}
              </span>
            </li>
            {Object.entries(health.connectors).map(([k, ok]) => (
              <li key={k} className="flex justify-between py-1.5">
                <span>{k}</span>
                <span className="text-gray-600 dark:text-gray-400">
                  {ok ? "Enabled" : "Disabled"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
