/**
 * Store for the color theme.
 *
 * Persisted to localStorage under `openpaw-theme`. The chosen theme is applied to
 * `<html>` as both a `data-theme` attribute and a `dark` class, on every change and once
 * more after hydration so a stored preference survives a reload.
 */

"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Theme preference; `system` follows the OS setting. */
type Theme = "dark" | "light" | "system";

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: () => "dark" | "light";
}

/** Reads the OS color-scheme preference, defaulting to dark when there is no window. */
function getSystemTheme(): "dark" | "light" {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** Resolves `system` and writes the result to the `<html>` element. No-op on the server. */
function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const resolved = theme === "system" ? getSystemTheme() : theme;
  document.documentElement.setAttribute("data-theme", resolved);
  document.documentElement.classList.toggle("dark", resolved === "dark");
}

/**
 * Theme state.
 *
 * `setTheme(theme)` stores the preference and applies it to the document immediately.
 * `resolvedTheme()` returns the concrete theme in effect, resolving `system` against the
 * OS preference at call time.
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
