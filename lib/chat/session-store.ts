/**
 * Server-side session store for webhook-based channels (Telegram, Slack, WhatsApp).
 *
 * Keeps conversation history per (channel, externalUserId) so multi-turn
 * conversations work even though HTTP webhooks are stateless.
 *
 * Uses an in-memory Map for speed with optional JSON file persistence
 * so sessions survive server restarts during development.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ModelMessage } from "ai";

export interface ChannelSession {
  /** Internal session identifier: `${channel}:${externalUserId}` */
  id: string;
  /**
   * Channel type — only custom integrations (Telegram, WhatsApp).
   * Chat SDK-managed platforms (Slack, Discord, etc.) handle their own
   * session state via the Chat SDK state adapter.
   */
  channel: "telegram" | "whatsapp";
  externalUserId: string;
  modelId: string;
  messages: ModelMessage[];
  createdAt: number;
  updatedAt: number;
}

/* ------------------------------------------------------------------ */
/*  In-memory store                                                   */
/* ------------------------------------------------------------------ */

const store = new Map<string, ChannelSession>();

function sessionKey(channel: string, externalUserId: string): string {
  return `${channel}:${externalUserId}`;
}

/* ------------------------------------------------------------------ */
/*  CRUD operations                                                   */
/* ------------------------------------------------------------------ */

export function getSession(
  channel: string,
  externalUserId: string
): ChannelSession | undefined {
  return store.get(sessionKey(channel, externalUserId));
}

export function getOrCreateSession(
  channel: "telegram" | "whatsapp",
  externalUserId: string,
  modelId = "anthropic/claude-sonnet-4-5"
): ChannelSession {
  const key = sessionKey(channel, externalUserId);
  let session = store.get(key);
  if (!session) {
    session = {
      id: key,
      channel,
      externalUserId,
      modelId,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    store.set(key, session);
  }
  return session;
}

export function appendMessage(
  session: ChannelSession,
  message: ModelMessage
): void {
  session.messages.push(message);
  session.updatedAt = Date.now();

  // Keep context manageable — keep last 50 messages
  if (session.messages.length > 50) {
    session.messages = session.messages.slice(-50);
  }
}

export function clearSession(channel: string, externalUserId: string): void {
  store.delete(sessionKey(channel, externalUserId));
}

export function listSessions(): ChannelSession[] {
  return Array.from(store.values());
}

/* ------------------------------------------------------------------ */
/*  Persistence (JSON file — dev convenience)                         */
/* ------------------------------------------------------------------ */

const PERSIST_PATH = path.join(
  process.cwd(),
  ".claw",
  "channel-sessions.json"
);

export async function persistSessions(): Promise<void> {
  try {
    await fs.mkdir(path.dirname(PERSIST_PATH), { recursive: true });
    const data = Object.fromEntries(store);
    await fs.writeFile(PERSIST_PATH, JSON.stringify(data, null, 2), "utf-8");
  } catch {
    // Silently ignore persistence errors
  }
}

export async function loadPersistedSessions(): Promise<number> {
  try {
    const raw = await fs.readFile(PERSIST_PATH, "utf-8");
    const data = JSON.parse(raw) as Record<string, ChannelSession>;
    let count = 0;
    for (const [key, session] of Object.entries(data)) {
      store.set(key, session);
      count++;
    }
    return count;
  } catch {
    return 0;
  }
}
