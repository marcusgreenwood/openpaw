/**
 * Telegram MarkdownV2 response formatter.
 *
 * Telegram uses a custom MarkdownV2 syntax that requires escaping
 * special characters outside of code blocks.
 *
 * @see https://core.telegram.org/bots/api#markdownv2-style
 */

const ESCAPE_CHARS = /([_*\[\]()~`>#+\-=|{}.!\\])/g;

function escapeMarkdownV2(text: string): string {
  return text.replace(ESCAPE_CHARS, "\\$1");
}

/**
 * Convert standard Markdown (from LLM output) to Telegram MarkdownV2.
 *
 * Strategy: preserve code blocks verbatim, escape everything else.
 */
export function formatForTelegram(text: string): string {
  const parts: string[] = [];
  let cursor = 0;

  // Match fenced code blocks
  const codeBlockRe = /```(\w*)\n?([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRe.exec(text)) !== null) {
    // Escape text before code block
    if (match.index > cursor) {
      parts.push(escapeMarkdownV2(text.slice(cursor, match.index)));
    }
    // Code block: wrap in ``` (no escaping inside)
    const lang = match[1] || "";
    const code = match[2];
    parts.push(`\`\`\`${lang}\n${code}\`\`\``);
    cursor = match.index + match[0].length;
  }

  // Remaining text after last code block
  if (cursor < text.length) {
    parts.push(escapeMarkdownV2(text.slice(cursor)));
  }

  let result = parts.join("");

  // Truncate to Telegram's 4096 char limit
  if (result.length > 4000) {
    result = result.slice(0, 3990) + "\n\\.\\.\\. \\(truncated\\)";
  }

  return result;
}

/** Split a long message into multiple Telegram-safe chunks */
export function splitTelegramMessage(text: string, maxLen = 4000): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }

    // Try to break at a newline
    let breakIdx = remaining.lastIndexOf("\n", maxLen);
    if (breakIdx < maxLen * 0.5) breakIdx = maxLen;

    chunks.push(remaining.slice(0, breakIdx));
    remaining = remaining.slice(breakIdx);
  }

  return chunks;
}
