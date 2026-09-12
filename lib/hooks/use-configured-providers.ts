/**
 * Hook exposing which model providers currently have an API key configured.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import type { ModelConfig } from "@/types";
import { ALL_MODELS } from "@/lib/models/providers";

/** Shape returned by GET /api/providers. Keys are never returned raw, only masked. */
interface ProvidersResponse {
  providers: Record<string, { configured: boolean; source: string; masked: string }>;
  configuredProviders: string[];
}

/**
 * Loads provider configuration status and narrows the model catalog to usable models.
 *
 * Fetches GET /api/providers on mount and refetches whenever an
 * `openpaw-providers-updated` window event fires, which the Settings UI dispatches after
 * saving keys — so the model picker updates without a reload.
 *
 * A failed fetch is logged and leaves the previous data in place; `isLoading` still
 * resolves to `false`, so callers should treat an empty `configuredModels` as "none
 * available" rather than "still loading".
 *
 * @returns `configuredProviders` (provider names with a key), `configuredModels` (the
 *   subset of {@link ALL_MODELS} belonging to those providers), `isLoading`, and `refetch`.
 */
export function useConfiguredProviders() {
  const [data, setData] = useState<ProvidersResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch("/api/providers");
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("Failed to fetch providers:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
    const handler = () => refetch();
    window.addEventListener("openpaw-providers-updated", handler);
    return () => window.removeEventListener("openpaw-providers-updated", handler);
  }, [refetch]);

  const configuredProviders = data?.configuredProviders ?? [];
  const configuredModels: ModelConfig[] =
    configuredProviders.length > 0
      ? ALL_MODELS.filter((m) => configuredProviders.includes(m.provider))
      : [];

  return {
    configuredProviders,
    configuredModels,
    isLoading: loading,
    refetch,
  };
}
