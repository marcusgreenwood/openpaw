/**
 * Unified webhook route for all Chat SDK-managed platforms.
 *
 * Handles: Slack, Discord, Teams, Google Chat, GitHub, Linear
 * (whichever adapters are configured in lib/bot.tsx)
 *
 * Static routes (telegram/, whatsapp/) take precedence in Next.js App Router,
 * so those custom integrations are unaffected by this dynamic route.
 */

import { after } from "next/server";
import { bot } from "@/lib/bot";

export const runtime = "nodejs";
export const maxDuration = 120;

type Platform = keyof typeof bot.webhooks;

export async function POST(
  request: Request,
  context: { params: Promise<{ platform: string }> }
) {
  const { platform } = await context.params;

  const handler = bot.webhooks[platform as Platform];
  if (!handler) {
    return new Response(`Unknown platform: ${platform}`, { status: 404 });
  }

  return handler(request, {
    waitUntil: (task) => after(() => task),
  });
}

/**
 * GET handler — health check for platform adapters.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ platform: string }> }
) {
  const { platform } = await context.params;

  const handler = bot.webhooks[platform as Platform];
  if (!handler) {
    return new Response(
      JSON.stringify({ status: "not_configured", platform }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ status: "active", platform }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
