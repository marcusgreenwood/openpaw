/**
 * WhatsApp response formatter.
 *
 * WhatsApp supports a limited subset of formatting:
 *  - Bold: *text*
 *  - Italic: _text_
 *  - Strikethrough: ~text~
 *  - Monospace: ```text```
 *  - Inline code: `code`
 *
 * @see https://faq.whatsapp.com/539178204879377
 */

/**
 * Convert standard Markdown to WhatsApp-compatible formatting.
 */
export function formatForWhatsApp(text: string): string {
  let result = text;

  // Headers → bold
  result = result.replace(/^#{1,6}\s+(.+)$/gm, "*$1*");

  // Bold: **text** → *text*
  result = result.replace(/\*\*(.+?)\*\*/g, "*$1*");

  // Links: [text](url) → text (url)
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)");

  // Truncate to WhatsApp's 65536 char limit (with buffer)
  if (result.length > 64_000) {
    result = result.slice(0, 64_000) + "\n... (truncated)";
  }

  return result;
}

/**
 * Split a long message into WhatsApp-safe chunks.
 * WhatsApp max message size is ~65536 chars but practical limit is lower.
 */
export function splitWhatsAppMessage(
  text: string,
  maxLen = 4096
): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }

    let breakIdx = remaining.lastIndexOf("\n", maxLen);
    if (breakIdx < maxLen * 0.5) breakIdx = maxLen;

    chunks.push(remaining.slice(0, breakIdx));
    remaining = remaining.slice(breakIdx).trimStart();
  }

  return chunks;
}
