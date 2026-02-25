/**
 * Channel status & configuration API.
 *
 * GET    /api/channels — returns status, webhook URLs, field-level config sources
 * POST   /api/channels — save channel credentials to .claw/channels.json
 * DELETE /api/channels — clear stored credentials for a channel
 */

import { NextResponse } from "next/server";
import {
  getEnabledChannels,
  CHAT_BLOCKING_TIMEOUT_MS,
  BASH_TIMEOUT_MS,
  CODE_EXEC_TIMEOUT_MS,
  MAX_TOOL_STEPS,
  getTelegramFieldStatus,
  getSlackFieldStatus,
  getWhatsAppFieldStatus,
  getDiscordFieldStatus,
  getGoogleChatFieldStatus,
} from "@/lib/chat/config";
import { listSessions } from "@/lib/chat/session-store";
import {
  ensureChannelConfigLoaded,
  loadStoredChannelConfig,
  saveStoredChannelConfig,
  invalidateChannelConfigCache,
} from "@/lib/chat/channel-config-store";

export const runtime = "nodejs";

/* ------------------------------------------------------------------ */
/*  GET — channel status                                              */
/* ------------------------------------------------------------------ */

export async function GET(req: Request) {
  await ensureChannelConfigLoaded();

  const { origin } = new URL(req.url);
  const channels = getEnabledChannels();
  const sessions = listSessions();

  return NextResponse.json({
    channels: {
      // Chat SDK platforms
      slack: {
        enabled: channels.slack,
        webhookUrl: `${origin}/api/webhooks/slack`,
        activeSessions: 0, // managed by Chat SDK state adapter
        fields: getSlackFieldStatus(),
      },
      discord: {
        enabled: channels.discord,
        webhookUrl: `${origin}/api/webhooks/discord`,
        activeSessions: 0,
        fields: getDiscordFieldStatus(),
      },
      gchat: {
        enabled: channels.gchat,
        webhookUrl: `${origin}/api/webhooks/gchat`,
        activeSessions: 0,
        fields: getGoogleChatFieldStatus(),
      },
      // Custom integrations
      telegram: {
        enabled: channels.telegram,
        webhookUrl: `${origin}/api/webhooks/telegram`,
        activeSessions: sessions.filter((s) => s.channel === "telegram").length,
        fields: getTelegramFieldStatus(),
      },
      whatsapp: {
        enabled: channels.whatsapp,
        webhookUrl: `${origin}/api/webhooks/whatsapp`,
        activeSessions: sessions.filter((s) => s.channel === "whatsapp").length,
        fields: getWhatsAppFieldStatus(),
      },
    },
    timeouts: {
      chatBlocking: CHAT_BLOCKING_TIMEOUT_MS,
      bashCommand: BASH_TIMEOUT_MS,
      codeExecution: CODE_EXEC_TIMEOUT_MS,
      maxToolSteps: MAX_TOOL_STEPS,
    },
    totalActiveSessions: sessions.length,
  });
}

/* ------------------------------------------------------------------ */
/*  POST — save channel config                                        */
/* ------------------------------------------------------------------ */

export async function POST(req: Request) {
  const { channel, config } = (await req.json()) as {
    channel: string;
    config: Record<string, string>;
  };

  const validChannels = ["telegram", "slack", "whatsapp", "discord", "gchat"];
  if (!validChannels.includes(channel)) {
    return NextResponse.json({ error: "Invalid channel" }, { status: 400 });
  }

  const stored = await loadStoredChannelConfig();
  (stored as Record<string, unknown>)[channel] = config;
  await saveStoredChannelConfig(stored);
  invalidateChannelConfigCache();

  return NextResponse.json({ success: true });
}

/* ------------------------------------------------------------------ */
/*  DELETE — clear stored config for a channel                        */
/* ------------------------------------------------------------------ */

export async function DELETE(req: Request) {
  const { channel } = (await req.json()) as { channel: string };

  const validChannels = ["telegram", "slack", "whatsapp", "discord", "gchat"];
  if (!validChannels.includes(channel)) {
    return NextResponse.json({ error: "Invalid channel" }, { status: 400 });
  }

  const stored = await loadStoredChannelConfig();
  delete (stored as Record<string, unknown>)[channel];
  await saveStoredChannelConfig(stored);
  invalidateChannelConfigCache();

  return NextResponse.json({ success: true });
}
