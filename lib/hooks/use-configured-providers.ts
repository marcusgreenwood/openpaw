"use client";

/**
 * @file Hook exposing which AI providers have an API key configured.
 */

import { useState, useEffect, useCallback } from "react";
import type { ModelConfig } from "@/types";
import { ALL_MODELS } from "@/lib/models/providers";

interface ProvidersResponse {
  providers: Record<string, { configured: boolean; source: string; masked: string }>;
  configuredProviders: string[];
}

/**
 * Fetches provider configuration status from `/api/providers`.
 *
 * Refetches on the `openpaw-providers-updated` window event, so saving keys in
 * Settings immediately updates the model picker.
 *
 * @returns The configured provider keys, the models those providers offer, a
 *          loading flag, and a manual `refetch`.
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
