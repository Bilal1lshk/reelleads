"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

function getSystemScheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function getEffectiveScheme(): "light" | "dark" {
  if (typeof document === "undefined") return "light";
  const meta = document.querySelector('meta[name="color-scheme"]');
  const content = meta?.getAttribute("content");
  if (content === "dark" || content === "light") return content;
  return getSystemScheme();
}

function applyScheme(stored: "light" | "dark" | null) {
  const meta = document.querySelector('meta[name="color-scheme"]');
  if (meta) {
    meta.setAttribute("content", stored ?? "light dark");
  }
  const effective = stored ?? getSystemScheme();
  document.documentElement.classList.toggle("dark", effective === "dark");
}

export function ThemeToggle() {
  const [scheme, setScheme] = React.useState<"light" | "dark">("light");

  React.useEffect(() => {
    setScheme(getEffectiveScheme());

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemChange = () => {
      let stored: string | null = null;
      try {
        stored = localStorage.getItem("color-scheme");
      } catch {
        stored = null;
      }
      if (!stored) {
        applyScheme(null);
        setScheme(getSystemScheme());
      }
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === "color-scheme") {
        const val =
          e.newValue === "light" || e.newValue === "dark" ? e.newValue : null;
        applyScheme(val);
        setScheme(getEffectiveScheme());
      }
    };

    mq.addEventListener("change", onSystemChange);
    window.addEventListener("storage", onStorage);
    return () => {
      mq.removeEventListener("change", onSystemChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const handleToggle = () => {
    const current = getEffectiveScheme();
    const target: "light" | "dark" = current === "dark" ? "light" : "dark";
    try {
      localStorage.setItem("color-scheme", target);
    } catch {
      // ignore storage errors
    }
    applyScheme(target);
    setScheme(target);
  };

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={handleToggle}
      aria-label={
        scheme === "dark" ? "Switch to light theme" : "Switch to dark theme"
      }
      title={
        scheme === "dark" ? "Switch to light theme" : "Switch to dark theme"
      }
    >
      {scheme === "dark" ? (
        <Sun className="h-4 w-4 text-amber-400" />
      ) : (
        <Moon className="h-4 w-4 text-zinc-700" />
      )}
    </Button>
  );
}
