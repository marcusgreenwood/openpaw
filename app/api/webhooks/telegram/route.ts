/**
 * Telegram Bot Webhook
 *
 * Receives updates from the Telegram Bot API, processes them through the
 * shared OpenPaw chat handler, and sends the response back via the Bot API.
 *
 * Setup:
 *   1. Create a bot via @BotFather → get TELEGRAM_BOT_TOKEN
 *   2. Set TELEGRAM_WEBHOOK_SECRET (optional but recommended)
 *   3. Register webhook:
 *      curl https://api.telegram.org/bot<TOKEN>/setWebhook \
 *        -d url=https://<YOUR_DOMAIN>/api/webhooks/telegram \
 *        -d secret_token=<WEBHOOK_SECRET>
 */

import { NextResponse } from "next/server";
import { getTelegramConfig, CHAT_BLOCKING_TIMEOUT_MS } from "@/lib/chat/config";
import { verifyTelegram } from "@/lib/chat/verify";
import { handleChatBlocking } from "@/lib/chat/handler";
import {
  getOrCreateSession,
  appendMessage,
  persistSessions,
} from "@/lib/chat/session-store";
import {
  formatForTelegram,
  splitTelegramMessage,
} from "@/lib/chat/formatters/telegram";

export const runtime = "nodejs";
export const maxDuration = 120;

/* ------------------------------------------------------------------ */
/*  Telegram Bot API helper                                           */
/* ------------------------------------------------------------------ */

/**
 * Send a message via the Telegram Bot API `sendMessage` method.
 *
 * The text is split into chunks of at most 4000 characters (preferring
 * newline breaks) and sent in order. If a chunk fails, the error is logged
 * and the whole text, truncated to 4000 characters, is resent once without
 * `parse_mode` before returning, so chunks after the failed one are dropped
 * and chunks already sent may appear twice. Failures in plain-text mode are
 * logged and skipped. Network errors from `fetch` are not caught.
 *
 * @param token - Bot token.
 * @param chatId - Target chat id.
 * @param text - Message text, already escaped for `parseMode`.
 * @param parseMode - Telegram parse mode; `""` sends plain text.
 */
async function sendTelegramMessage(
  token: string,
  chatId: number | string,
  text: string,
  parseMode = "MarkdownV2"
) {
  const chunks = splitTelegramMessage(text);
  for (const chunk of chunks) {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: chunk,
          parse_mode: parseMode,
        }),
      }
    );
    if (!res.ok) {
      // Fallback: send without parse_mode if MarkdownV2 fails
      console.error(`[Telegram] sendMessage failed:`, await res.text());
      if (parseMode !== "") {
        await sendTelegramMessage(token, chatId, text.slice(0, 4000), "");
        return;
      }
    }
  }
}

/**
 * Show the "typing…" indicator in a chat via `sendChatAction`.
 * Best effort: errors are swallowed and the response is not checked.
 *
 * @param token - Bot token.
 * @param chatId - Target chat id.
 */
async function sendTypingAction(token: string, chatId: number | string) {
  await fetch(`https://api.telegram.org/bot${token}/sendChatAction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action: "typing" }),
  }).catch(() => {});
}

/* ------------------------------------------------------------------ */
/*  POST handler                                                      */
/* ------------------------------------------------------------------ */

/**
 * Handle a Telegram Bot API update.
 *
 * Verifies the `X-Telegram-Bot-Api-Secret-Token` header against the
 * configured secret. If no secret is configured, `verifyTelegram` accepts
 * every request. Only `update.message.text` is handled; other updates are
 * acknowledged and ignored. `/start` sends a greeting and `/clear` resets the
 * session. Any other text is appended to the in-memory session for the
 * sender (keyed by `from.id`, falling back to the chat id), run through
 * `handleChatBlocking` with the session's model, and the reply is formatted
 * for MarkdownV2 and sent back. Sessions are persisted in the background.
 * Agent errors and timeouts are reported to the user in the chat.
 *
 * Config comes from env vars or the cached `.claw/channels.json` values. This
 * handler does not load that cache itself, so a stored-only token is seen
 * only after another route (e.g. `GET /api/channels`) has populated it.
 *
 * @returns 503 `{ error: "Telegram not configured" }` when no bot token is
 *   available, 401 `{ error: "Invalid secret" }` on a secret mismatch, and
 *   200 `{ ok: true }` otherwise, including when the agent fails, so Telegram
 *   does not retry the update.
 */
export async function POST(req: Request) {
  const config = getTelegramConfig();
  if (!config.enabled) {
    return NextResponse.json(
      { error: "Telegram not configured" },
      { status: 503 }
    );
  }

  // Verify webhook secret
  const secretHeader = req.headers.get("x-telegram-bot-api-secret-token");
  if (!verifyTelegram(config.secret, secretHeader)) {
    return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
  }

  const update = await req.json();

  // We only handle text messages
  const message = update.message;
  if (!message?.text) {
    return NextResponse.json({ ok: true });
  }

  const chatId = message.chat.id;
  const userId = String(message.from?.id || chatId);
  const userText = message.text;

  // Handle /start and /clear commands
  if (userText === "/start") {
    await sendTelegramMessage(
      config.token,
      chatId,
      "👋 Hi\\! I'm *OpenPaw*, an AI coding agent\\. Send me any coding question or task\\!",
      "MarkdownV2"
    );
    return NextResponse.json({ ok: true });
  }

  if (userText === "/clear") {
    const { clearSession } = await import("@/lib/chat/session-store");
    clearSession("telegram", userId);
    await sendTelegramMessage(
      config.token,
      chatId,
      "🗑️ Session cleared\\. Start fresh\\!",
      "MarkdownV2"
    );
    return NextResponse.json({ ok: true });
  }

  // Show typing indicator
  sendTypingAction(config.token, chatId);

  // Get or create session
  const session = getOrCreateSession("telegram", userId);

  // Append user message
  appendMessage(session, { role: "user", content: userText });

  try {
    // Process through OpenPaw
    const result = await handleChatBlocking(session.messages, session.modelId);

    // Append assistant response
    appendMessage(session, { role: "assistant", content: result.text });

    // Persist sessions
    persistSessions().catch(() => {});

    // Format and send
    const formatted = formatForTelegram(result.text);
    await sendTelegramMessage(config.token, chatId, formatted);
  } catch (err) {
    console.error("[Telegram] Error:", err);
    const errorMsg = err instanceof Error ? err.message : "Unknown error";

    if (errorMsg.includes("timed out")) {
      await sendTelegramMessage(
        config.token,
        chatId,
        `⏱️ Request timed out after ${Math.round(CHAT_BLOCKING_TIMEOUT_MS / 1000)}s\\. Try a simpler question or use /clear to reset\\.`,
        "MarkdownV2"
      );
    } else {
      await sendTelegramMessage(
        config.token,
        chatId,
        "❌ Something went wrong\\. Please try again\\.",
        "MarkdownV2"
      );
    }
  }

  return NextResponse.json({ ok: true });
}
