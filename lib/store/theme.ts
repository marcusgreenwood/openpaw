"use client";

/**
 * @file Theme store.
 *
 * Persists the user's theme choice to localStorage under `openpaw-theme` and
 * applies it to the document element. `app/layout.tsx` reads the same key in an
 * inline script so the correct theme is applied before first paint.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

type Theme = "dark" | "light" | "system";

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: () => "dark" | "light";
}

function getSystemTheme(): "dark" | "light" {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const resolved = theme === "system" ? getSystemTheme() : theme;
  document.documentElement.setAttribute("data-theme", resolved);
  document.documentElement.classList.toggle("dark", resolved === "dark");
}

/**
 * Store for the selected theme.
 *
 * `setTheme` immediately applies the theme to the document element; `resolvedTheme`
 * resolves `"system"` against the OS preference. The theme is re-applied on
 * hydration so a persisted choice survives a reload.
 */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: "dark",

      setTheme: (theme: Theme) => {
        set({ theme });
        applyTheme(theme);
      },

      resolvedTheme: () => {
        const { theme } = get();
        if (theme === "system") return getSystemTheme();
        return theme;
      },
    }),
    {
      name: "openpaw-theme",
      partialize: (state) => ({ theme: state.theme }),
    }
  )
);

if (typeof window !== "undefined") {
  useThemeStore.persist.onFinishHydration((state) => {
    applyTheme(state.theme);
  });
}
