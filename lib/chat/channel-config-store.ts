/**
 * Server-side persistence for channel credentials.
 *
 * Stores channel tokens/secrets in `.claw/channels.json`.
 * Environment variables always take precedence over stored values.
 *
 * Supports both Chat SDK platforms (Slack, Discord, Google Chat) and
 * custom integrations (Telegram, WhatsApp).
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

const CONFIG_PATH = path.join(process.cwd(), ".claw", "channels.json");

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

/** Shape of `.claw/channels.json`; every platform and field is optional. */
export interface StoredChannelConfigs {
  // Custom integrations
  telegram?: { token?: string; secret?: string };
  whatsapp?: { token?: string; secret?: string; phoneNumberId?: string };
  // Chat SDK platforms
  slack?: { token?: string; secret?: string };
  discord?: { token?: string; secret?: string };
  gchat?: { token?: string; secret?: string };
}

/* ------------------------------------------------------------------ */
/*  Read / Write                                                      */
/* ------------------------------------------------------------------ */

/** Read `.claw/channels.json` from disk. Returns `{}` if the file is missing or invalid. */
export async function loadStoredChannelConfig(): Promise<StoredChannelConfigs> {
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf-8");
    return JSON.parse(raw) as StoredChannelConfigs;
  } catch {
    return {};
  }
}

/**
 * Overwrite `.claw/channels.json` with `config`, creating `.claw/` if needed.
 * Does not touch the in-memory cache; call `invalidateChannelConfigCache()` after saving.
 */
export async function saveStoredChannelConfig(
  config: StoredChannelConfigs
): Promise<void> {
  await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}

/* ------------------------------------------------------------------ */
/*  In-memory cache (invalidated on save)                             */
/* ------------------------------------------------------------------ */

let _cached: StoredChannelConfigs | null = null;
let _loadPromise: Promise<void> | null = null;

/** Load the stored config into the in-memory cache once; concurrent callers share one read. */
export async function ensureChannelConfigLoaded(): Promise<void> {
  if (_cached !== null) return;
  if (!_loadPromise) {
    _loadPromise = loadStoredChannelConfig().then((c) => {
      _cached = c;
    });
  }
  await _loadPromise;
}

/** Synchronous read of the cached stored config; `{}` until `ensureChannelConfigLoaded()` has run. */
export function getCachedStoredConfig(): StoredChannelConfigs {
  return _cached ?? {};
}

/** Drop the cached config so the next `ensureChannelConfigLoaded()` re-reads the file. */
export function invalidateChannelConfigCache(): void {
  _cached = null;
  _loadPromise = null;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/** Mask a token/secret for safe display: "****abcd" */
export function maskValue(value: string): string {
  if (!value) return "";
  if (value.length <= 4) return "****";
  return "****" + value.slice(-4);
}
