/**
 * Webhook signature verification for custom channel integrations.
 *
 * Slack verification is handled by the Chat SDK adapter automatically.
 * This file only covers Telegram and WhatsApp (custom integrations).
 */

import * as crypto from "node:crypto";

/* ------------------------------------------------------------------ */
/*  Telegram                                                          */
/* ------------------------------------------------------------------ */

/**
 * Verify Telegram webhook using the secret_token header.
 * When you register a webhook with `secret_token`, Telegram sends it
 * in the `X-Telegram-Bot-Api-Secret-Token` header.
 */
export function verifyTelegram(
  secretToken: string,
  headerValue: string | null
): boolean {
  if (!secretToken) return true; // No secret configured → allow all
  return headerValue === secretToken;
}

/* ------------------------------------------------------------------ */
/*  WhatsApp (Meta)                                                   */
/* ------------------------------------------------------------------ */

/**
 * Verify WhatsApp (Meta) webhook signature.
 * @see https://developers.facebook.com/docs/graph-api/webhooks/getting-started
 */
export function verifyWhatsApp(
  appSecret: string,
  signature: string | null,
  body: string
): boolean {
  if (!appSecret || !signature) return false;

  const expectedSig = crypto
    .createHmac("sha256", appSecret)
    .update(body)
    .digest("hex");

  const provided = signature.replace("sha256=", "");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedSig),
      Buffer.from(provided)
    );
  } catch {
    return false;
  }
}
