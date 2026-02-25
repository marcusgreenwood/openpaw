/**
 * Central Chat SDK bot instance.
 *
 * Handles all Chat SDK-supported platforms (Slack, Discord, etc.) through a
 * unified event-driven architecture. When the bot is @mentioned, it subscribes
 * to the thread and responds to follow-up messages using the CLAW AI agent
 * with full tool access (bash, files, code execution, etc.).
 *
 * Telegram and WhatsApp are handled separately via custom webhook routes
 * since the Chat SDK doesn't support those platforms.
 */

import { Chat } from "chat";
import { createSlackAdapter } from "@chat-adapter/slack";
import { createDiscordAdapter } from "@chat-adapter/discord";
import { createMemoryState } from "@chat-adapter/state-memory";
import { streamText, stepCountIs } from "ai";
import { buildContext } from "@/lib/chat/handler";
import { MAX_TOOL_STEPS } from "@/lib/chat/config";

/* ------------------------------------------------------------------ */
/*  Create adapters conditionally based on env vars                    */
/* ------------------------------------------------------------------ */

type AnyAdapter = ReturnType<typeof createSlackAdapter> | ReturnType<typeof createDiscordAdapter>;
const adapters: Record<string, AnyAdapter> = {};

// Slack adapter — auto-detects SLACK_BOT_TOKEN + SLACK_SIGNING_SECRET
if (process.env.SLACK_BOT_TOKEN) {
  adapters.slack = createSlackAdapter();
}

// Discord adapter — auto-detects DISCORD_BOT_TOKEN + DISCORD_PUBLIC_KEY
if (process.env.DISCORD_BOT_TOKEN) {
  adapters.discord = createDiscordAdapter();
}

/* ------------------------------------------------------------------ */
/*  Create the Chat SDK bot instance                                   */
/* ------------------------------------------------------------------ */

export const bot = new Chat({
  userName: "claw",
  adapters,
  state: createMemoryState(),
  streamingUpdateIntervalMs: 500,
});

/* ------------------------------------------------------------------ */
/*  Shared AI agent handler                                            */
/* ------------------------------------------------------------------ */

async function handleAIMessage(
  thread: Parameters<Parameters<typeof bot.onNewMention>[0]>[0],
  messageText: string
) {
  try {
    // Show typing indicator while we process
    await thread.adapter.startTyping(thread.id).catch(() => {});

    // Fetch thread history from the platform for multi-turn context
    const history = await thread.adapter.fetchMessages(thread.id, { limit: 30 });
    const messages = history.messages
      .filter((m) => m.text.trim())
      .map((m) => ({
        role: (m.author.isMe ? "assistant" : "user") as "assistant" | "user",
        content: m.text,
      }));

    // If no history yet (e.g., initial mention), add the current message
    if (messages.length === 0 && messageText) {
      messages.push({ role: "user", content: messageText });
    }

    // Build agent context — reuses the same model/tools/skills as the web UI
    const { model, systemPrompt, tools } = await buildContext(
      "anthropic/claude-sonnet-4-6"
    );

    const result = streamText({
      model,
      system: systemPrompt,
      messages,
      tools,
      stopWhen: [stepCountIs(MAX_TOOL_STEPS)],
    });

    // Stream the response — Slack uses native streaming, others use post+edit
    await thread.post(result.textStream);
  } catch (err) {
    console.error("[CLAW Bot] Error handling message:", err);
    const errorMsg = err instanceof Error ? err.message : "Unknown error";

    if (errorMsg.includes("timed out")) {
      await thread.post(
        "⏱️ Request timed out. Try a simpler question or start a new thread."
      );
    } else {
      await thread.post("❌ Something went wrong. Please try again.");
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Event handlers                                                     */
/* ------------------------------------------------------------------ */

/**
 * New @mention — subscribe to the thread and respond.
 * This fires when the bot is mentioned in a thread it's NOT yet subscribed to.
 */
bot.onNewMention(async (thread, message) => {
  // Subscribe so future messages trigger onSubscribedMessage
  await thread.subscribe();

  // Post a welcome message + handle the initial question
  if (message.text.trim()) {
    await handleAIMessage(thread, message.text);
  } else {
    await thread.post(
      "🐾 *CLAW AI Agent* — I'm now listening to this thread. Ask me any coding question or task!"
    );
  }
});

/**
 * Subscribed thread message — the bot is already watching this thread.
 * Respond with AI to every follow-up message.
 */
bot.onSubscribedMessage(async (thread, message) => {
  // Skip empty messages
  if (!message.text.trim()) return;

  await handleAIMessage(thread, message.text);
});

/**
 * Button actions from cards.
 */
bot.onAction("clear", async (event) => {
  // Unsubscribe and let the user know
  await event.thread.unsubscribe();
  await event.thread.post("🗑️ Context cleared. @mention me again to start fresh!");
});

/**
 * Slash command: /claw <message>
 */
bot.onSlashCommand("/claw", async (event) => {
  if (!event.text?.trim()) {
    await event.channel.post(
      "🐾 *CLAW AI Agent*\nUsage: `/claw <your question or task>`\nOr @mention me in a channel to start a conversation thread."
    );
    return;
  }

  // For slash commands, post in the channel and let the user see the response
  await event.channel.post(`Processing: _${event.text}_`);
});
