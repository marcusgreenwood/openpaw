/**
 * WhatsApp Cloud API Webhook (Meta Business Platform)
 *
 * Receives incoming messages from WhatsApp via Meta's Cloud API,
 * processes them through the shared OpenPaw chat handler, and sends
 * the response back via the WhatsApp Cloud API.
 *
 * Setup:
 *   1. Create a Meta App at https://developers.facebook.com
 *   2. Add WhatsApp product → get access token & phone number ID
 *   3. Configure webhook URL: https://<DOMAIN>/api/webhooks/whatsapp
 *   4. Subscribe to "messages" webhook field
 *   5. Set env vars:
 *      - WHATSAPP_ACCESS_TOKEN
 *      - WHATSAPP_VERIFY_TOKEN (your custom string for webhook verification)
 *      - WHATSAPP_PHONE_NUMBER_ID
 *      - WHATSAPP_APP_SECRET (optional, for signature verification)
 */

import { NextResponse } from "next/server";
import { getWhatsAppConfig, CHAT_BLOCKING_TIMEOUT_MS } from "@/lib/chat/config";
import { handleChatBlocking } from "@/lib/chat/handler";
import {
  getOrCreateSession,
  appendMessage,
  clearSession,
  persistSessions,
} from "@/lib/chat/session-store";
import {
  formatForWhatsApp,
  splitWhatsAppMessage,
} from "@/lib/chat/formatters/whatsapp";

export const runtime = "nodejs";
export const maxDuration = 120;

/* ------------------------------------------------------------------ */
/*  WhatsApp Cloud API helpers                                        */
/* ------------------------------------------------------------------ */

async function sendWhatsAppMessage(
  token: string,
  phoneNumberId: string,
  to: string,
  text: string
) {
  const chunks = splitWhatsAppMessage(text);

  for (const chunk of chunks) {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "text",
          text: { body: chunk },
        }),
      }
    );

    if (!res.ok) {
      console.error("[WhatsApp] sendMessage failed:", await res.text());
    }
  }
}

async function markAsRead(
  token: string,
  phoneNumberId: string,
  messageId: string
) {
  await fetch(
    `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId,
      }),
    }
  ).catch(() => {});
}

/* ------------------------------------------------------------------ */
/*  GET handler — webhook verification                                */
/* ------------------------------------------------------------------ */

export async function GET(req: Request) {
  const config = getWhatsAppConfig();
  const { searchParams } = new URL(req.url);

  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === config.secret) {
    console.log("[WhatsApp] Webhook verified successfully");
    return new Response(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

/* ------------------------------------------------------------------ */
/*  POST handler — incoming messages                                  */
/* ------------------------------------------------------------------ */

export async function POST(req: Request) {
  const config = getWhatsAppConfig();

  if (!config.enabled) {
    return NextResponse.json(
      { error: "WhatsApp not configured" },
      { status: 503 }
    );
  }

  const body = await req.json();

  // Extract message from the webhook payload
  const entry = body.entry?.[0];
  const changes = entry?.changes?.[0];
  const value = changes?.value;

  if (!value?.messages?.length) {
    // Status updates, etc. — acknowledge
    return NextResponse.json({ ok: true });
  }

  const message = value.messages[0];
  const from = message.from; // sender's phone number
  const phoneNumberId = config.extra.phoneNumberId || value.metadata?.phone_number_id;

  // Only handle text messages
  if (message.type !== "text") {
    await sendWhatsAppMessage(
      config.token,
      phoneNumberId,
      from,
      "I currently only support text messages. Please send me a text!"
    );
    return NextResponse.json({ ok: true });
  }

  const userText = message.text?.body || "";

  // Mark as read
  markAsRead(config.token, phoneNumberId, message.id);

  // Handle clear command
  if (userText.toLowerCase() === "/clear" || userText.toLowerCase() === "clear") {
    clearSession("whatsapp", from);
    await sendWhatsAppMessage(
      config.token,
      phoneNumberId,
      from,
      "🗑️ Session cleared. Start fresh!"
    );
    return NextResponse.json({ ok: true });
  }

  // Process the message
  const session = getOrCreateSession("whatsapp", from);
  appendMessage(session, { role: "user", content: userText });

  try {
    const result = await handleChatBlocking(session.messages, session.modelId);
    appendMessage(session, { role: "assistant", content: result.text });
    persistSessions().catch(() => {});

    const formatted = formatForWhatsApp(result.text);
    await sendWhatsAppMessage(config.token, phoneNumberId, from, formatted);
  } catch (err) {
    console.error("[WhatsApp] Error:", err);
    const errorMsg = err instanceof Error ? err.message : "Unknown error";

    if (errorMsg.includes("timed out")) {
      await sendWhatsAppMessage(
        config.token,
        phoneNumberId,
        from,
        `⏱️ Request timed out after ${Math.round(CHAT_BLOCKING_TIMEOUT_MS / 1000)}s. Try a simpler question or send "clear" to reset.`
      );
    } else {
      await sendWhatsAppMessage(
        config.token,
        phoneNumberId,
        from,
        "❌ Something went wrong. Please try again."
      );
    }
  }

  return NextResponse.json({ ok: true });
}
