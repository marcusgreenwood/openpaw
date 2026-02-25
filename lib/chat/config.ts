/**
 * Channel & timeout configuration for CLAW.
 *
 * All timeouts are in milliseconds. They can be overridden via environment
 * variables so operators can tune them without code changes.
 */

import * as path from "node:path";
import { getCachedStoredConfig } from "./channel-config-store";

function envInt(key: string, fallback: number): number {
  const v = process.env[key];
  if (v === undefined) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

/* ------------------------------------------------------------------ */
/*  Default workspace                                                 */
/* ------------------------------------------------------------------ */

/** Default workspace directory where files are saved, commands run, etc. */
export const DEFAULT_WORKSPACE = process.env.CLAW_WORKSPACE_DIR
  ? path.resolve(process.env.CLAW_WORKSPACE_DIR)
  : path.join(process.cwd(), "workspace");

/* ------------------------------------------------------------------ */
/*  Tool-level timeouts                                               */
/* ------------------------------------------------------------------ */

/** Max time a single bash command may run (default 30 s) */
export const BASH_TIMEOUT_MS = envInt("CLAW_BASH_TIMEOUT_MS", 30_000);

/** Max time a code-execution snippet may run (default 15 s) */
export const CODE_EXEC_TIMEOUT_MS = envInt("CLAW_CODE_EXEC_TIMEOUT_MS", 15_000);

/** Max time the `npx skills add` install process may run (default 60 s) */
export const SKILL_INSTALL_TIMEOUT_MS = envInt("CLAW_SKILL_INSTALL_TIMEOUT_MS", 60_000);

/* ------------------------------------------------------------------ */
/*  Chat / model-level timeouts                                       */
/* ------------------------------------------------------------------ */

/** Max wall-clock time for a single streaming chat request (Next.js route) */
export const CHAT_STREAM_TIMEOUT_MS = envInt("CLAW_CHAT_STREAM_TIMEOUT_MS", 120_000);

/** Max wall-clock time for a blocking (webhook) chat request */
export const CHAT_BLOCKING_TIMEOUT_MS = envInt("CLAW_CHAT_BLOCKING_TIMEOUT_MS", 90_000);

/** Max number of agentic tool-use steps before we force-stop */
export const MAX_TOOL_STEPS = envInt("CLAW_MAX_TOOL_STEPS", 15);

/* ------------------------------------------------------------------ */
/*  Channel webhook configs                                           */
/* ------------------------------------------------------------------ */

export interface ChannelConfig {
  enabled: boolean;
  token: string;
  secret: string;
  /** Extra channel-specific values */
  extra: Record<string, string>;
}

/**
 * Get Telegram config — env vars take precedence over stored config.
 * Call `ensureChannelConfigLoaded()` before this if you need stored values.
 */
export function getTelegramConfig(): ChannelConfig {
  const stored = getCachedStoredConfig();
  const token = process.env.TELEGRAM_BOT_TOKEN || stored.telegram?.token || "";
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET || stored.telegram?.secret || "";
  return { enabled: !!token, token, secret, extra: {} };
}

/**
 * Slack config — used for Channels UI display.
 * The actual webhook handling is done by the Chat SDK adapter which auto-detects
 * SLACK_BOT_TOKEN and SLACK_SIGNING_SECRET from environment variables.
 */
export function getSlackConfig(): ChannelConfig {
  const stored = getCachedStoredConfig();
  const token = process.env.SLACK_BOT_TOKEN || stored.slack?.token || "";
  const secret = process.env.SLACK_SIGNING_SECRET || stored.slack?.secret || "";
  return { enabled: !!token, token, secret, extra: {} };
}

export function getWhatsAppConfig(): ChannelConfig {
  const stored = getCachedStoredConfig();
  const token = process.env.WHATSAPP_ACCESS_TOKEN || stored.whatsapp?.token || "";
  const secret = process.env.WHATSAPP_VERIFY_TOKEN || stored.whatsapp?.secret || "";
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || stored.whatsapp?.phoneNumberId || "";
  return { enabled: !!token, token, secret, extra: { phoneNumberId } };
}

/* ------------------------------------------------------------------ */
/*  Chat SDK platform configs (for UI display — adapters auto-detect) */
/* ------------------------------------------------------------------ */

export function getDiscordConfig(): ChannelConfig {
  const stored = getCachedStoredConfig();
  const token = process.env.DISCORD_BOT_TOKEN || stored.discord?.token || "";
  const secret = process.env.DISCORD_PUBLIC_KEY || stored.discord?.secret || "";
  return { enabled: !!token, token, secret, extra: {} };
}

export function getGoogleChatConfig(): ChannelConfig {
  const stored = getCachedStoredConfig();
  const token = process.env.GOOGLE_CHAT_SERVICE_ACCOUNT_KEY || stored.gchat?.token || "";
  const secret = process.env.GOOGLE_CHAT_PROJECT_ID || stored.gchat?.secret || "";
  return { enabled: !!token, token, secret, extra: {} };
}

/** Returns which channels are currently configured / enabled */
export function getEnabledChannels(): Record<string, boolean> {
  return {
    // Chat SDK platforms
    slack: getSlackConfig().enabled,
    discord: getDiscordConfig().enabled,
    gchat: getGoogleChatConfig().enabled,
    // Custom integrations
    telegram: getTelegramConfig().enabled,
    whatsapp: getWhatsAppConfig().enabled,
  };
}

/* ------------------------------------------------------------------ */
/*  Field-level source tracking (for the UI)                          */
/* ------------------------------------------------------------------ */

export interface FieldStatus {
  set: boolean;
  source: "env" | "stored" | "none";
  masked: string;
}

function fieldStatus(envVal: string | undefined, storedVal: string | undefined, masker: (v: string) => string): FieldStatus {
  if (envVal) return { set: true, source: "env", masked: masker(envVal) };
  if (storedVal) return { set: true, source: "stored", masked: masker(storedVal) };
  return { set: false, source: "none", masked: "" };
}

import { maskValue } from "./channel-config-store";

export function getTelegramFieldStatus() {
  const stored = getCachedStoredConfig();
  return {
    token: fieldStatus(process.env.TELEGRAM_BOT_TOKEN, stored.telegram?.token, maskValue),
    secret: fieldStatus(process.env.TELEGRAM_WEBHOOK_SECRET, stored.telegram?.secret, maskValue),
  };
}

export function getSlackFieldStatus() {
  const stored = getCachedStoredConfig();
  return {
    token: fieldStatus(process.env.SLACK_BOT_TOKEN, stored.slack?.token, maskValue),
    secret: fieldStatus(process.env.SLACK_SIGNING_SECRET, stored.slack?.secret, maskValue),
  };
}

export function getWhatsAppFieldStatus() {
  const stored = getCachedStoredConfig();
  return {
    token: fieldStatus(process.env.WHATSAPP_ACCESS_TOKEN, stored.whatsapp?.token, maskValue),
    secret: fieldStatus(process.env.WHATSAPP_VERIFY_TOKEN, stored.whatsapp?.secret, maskValue),
    phoneNumberId: fieldStatus(process.env.WHATSAPP_PHONE_NUMBER_ID, stored.whatsapp?.phoneNumberId, maskValue),
  };
}

export function getDiscordFieldStatus() {
  const stored = getCachedStoredConfig();
  return {
    token: fieldStatus(process.env.DISCORD_BOT_TOKEN, stored.discord?.token, maskValue),
    secret: fieldStatus(process.env.DISCORD_PUBLIC_KEY, stored.discord?.secret, maskValue),
  };
}

export function getGoogleChatFieldStatus() {
  const stored = getCachedStoredConfig();
  return {
    token: fieldStatus(process.env.GOOGLE_CHAT_SERVICE_ACCOUNT_KEY, stored.gchat?.token, maskValue),
    secret: fieldStatus(process.env.GOOGLE_CHAT_PROJECT_ID, stored.gchat?.secret, maskValue),
  };
}
