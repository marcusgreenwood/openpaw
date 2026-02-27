"use client";

import React, { useEffect, useRef, useSyncExternalStore } from "react";
import { useThemeStore } from "@/lib/store/theme";

const themes = ["dark", "light", "system"] as const;

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function MonitorIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

const iconComponents: Record<(typeof themes)[number], React.FC> = {
  light: SunIcon,
  dark: MoonIcon,
  system: MonitorIcon,
};

const labels: Record<(typeof themes)[number], string> = {
  dark: "Dark",
  light: "Light",
  system: "System",
};

const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

export function ThemeToggle() {
  const { theme, setTheme } = useThemeStore();
  const mounted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const initialRef = useRef(true);

  useEffect(() => {
    if (initialRef.current) {
      initialRef.current = false;
      return;
    }
    if (theme !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      const resolved = mql.matches ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", resolved);
      document.documentElement.classList.toggle("dark", resolved === "dark");
    };
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [theme]);

  const cycle = () => {
    const idx = themes.indexOf(theme);
    setTheme(themes[(idx + 1) % themes.length]);
  };

  if (!mounted) return <div className="w-8 h-8" />;

  const Icon = iconComponents[theme];

  return (
    <button
      onClick={cycle}
      className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-glass-hover text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
      title={`Theme: ${labels[theme]}`}
    >
      <Icon />
    </button>
  );
}
