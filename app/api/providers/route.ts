/**
 * AI provider API keys configuration.
 *
 * GET  /api/providers — returns which providers are configured (masked, no raw keys)
 * POST /api/providers — save API keys to .claw/api-keys.json
 */

import { NextResponse } from "next/server";
import {
  loadStoredApiKeys,
  saveStoredApiKeys,
  invalidateApiKeysCache,
  PROVIDER_ENV_KEYS,
  maskApiKey,
} from "@/lib/chat/api-keys-store";
import { PROVIDER_REGISTRY } from "@/lib/models/providers";

export const runtime = "nodejs";

const VALID_PROVIDERS = Object.keys(PROVIDER_REGISTRY);

interface ProviderStatus {
  configured: boolean;
  source: "env" | "stored" | "none";
  masked: string;
}

/* ------------------------------------------------------------------ */
/*  GET — provider status                                              */
/* ------------------------------------------------------------------ */

export async function GET() {
  const stored = await loadStoredApiKeys();
  const providers: Record<string, ProviderStatus> = {};

  for (const provider of VALID_PROVIDERS) {
    const envKey = PROVIDER_ENV_KEYS[provider];
    const envVal = envKey ? process.env[envKey] : undefined;
    const storedVal = (stored as Record<string, string | undefined>)[provider];

    let source: "env" | "stored" | "none" = "none";
    let masked = "";

    if (envVal) {
      source = "env";
      masked = maskApiKey(envVal);
    } else if (storedVal) {
      source = "stored";
      masked = maskApiKey(storedVal);
    }

    providers[provider] = {
      configured: !!envVal || !!storedVal,
      source,
      masked,
    };
  }

  const configuredProviders = VALID_PROVIDERS.filter(
    (p) => providers[p].configured
  );

  return NextResponse.json({
    providers,
    configuredProviders,
  });
}

/* ------------------------------------------------------------------ */
/*  POST — save API keys                                              */
/* ------------------------------------------------------------------ */

export async function POST(req: Request) {
  const body = (await req.json()) as Record<string, string | undefined>;

  const updates: Record<string, string> = {};
  for (const provider of VALID_PROVIDERS) {
    const val = body[provider];
    if (val === undefined) continue;
    if (typeof val !== "string") continue;
    const trimmed = val.trim();
    if (trimmed === "") continue;
    updates[provider] = trimmed;
  }

  const stored = await loadStoredApiKeys();
  for (const [provider, key] of Object.entries(updates)) {
    (stored as Record<string, string>)[provider] = key;
  }
  // Allow clearing: if body has explicit empty string, remove from stored
  for (const provider of VALID_PROVIDERS) {
    if (body[provider] === "") {
      delete (stored as Record<string, unknown>)[provider];
    }
  }

  await saveStoredApiKeys(stored);
  invalidateApiKeysCache();

  return NextResponse.json({ success: true });
}
