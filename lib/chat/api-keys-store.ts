/**
 * Server-side persistence for AI provider API keys.
 *
 * Stores keys in `.claw/api-keys.json`.
 * Environment variables always take precedence over stored values.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

const CONFIG_PATH = path.join(process.cwd(), ".claw", "api-keys.json");

export const PROVIDER_ENV_KEYS: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
  moonshotai: "MOONSHOT_API_KEY",
};

export interface StoredApiKeys {
  anthropic?: string;
  openai?: string;
  google?: string;
  moonshotai?: string;
}

/* ------------------------------------------------------------------ */
/*  Read / Write                                                      */
/* ------------------------------------------------------------------ */

export async function loadStoredApiKeys(): Promise<StoredApiKeys> {
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf-8");
    return JSON.parse(raw) as StoredApiKeys;
  } catch {
    return {};
  }
}

export async function saveStoredApiKeys(config: StoredApiKeys): Promise<void> {
  await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}

/* ------------------------------------------------------------------ */
/*  In-memory cache                                                   */
/* ------------------------------------------------------------------ */

let _cached: StoredApiKeys | null = null;

export async function ensureApiKeysLoaded(): Promise<void> {
  if (_cached === null) {
    _cached = await loadStoredApiKeys();
  }
}

export function getCachedStoredApiKeys(): StoredApiKeys {
  return _cached ?? {};
}

export function invalidateApiKeysCache(): void {
  _cached = null;
}

/* ------------------------------------------------------------------ */
/*  Get API key (env takes precedence over stored)                     */
/* ------------------------------------------------------------------ */

export function getApiKeyFromEnv(provider: string): string | undefined {
  const envKey = PROVIDER_ENV_KEYS[provider];
  if (envKey && process.env[envKey]) {
    return process.env[envKey];
  }
  return undefined;
}

/** Returns the effective API key (env or stored). Call ensureApiKeysLoaded() first for stored. */
export function getApiKey(provider: string): string | undefined {
  const fromEnv = getApiKeyFromEnv(provider);
  if (fromEnv) return fromEnv;
  const stored = getCachedStoredApiKeys();
  return (stored as Record<string, string | undefined>)[provider];
}

export function isProviderConfigured(provider: string): boolean {
  return !!getApiKey(provider);
}

/** Mask for safe display: "****abcd" */
export function maskApiKey(value: string): string {
  if (!value) return "";
  if (value.length <= 4) return "****";
  return "****" + value.slice(-4);
}
