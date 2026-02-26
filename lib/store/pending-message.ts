/**
 * Pending message to send when switching to a new session (e.g. from command palette, cron run).
 * ChatInterface consumes this when activeSessionId changes.
 */

let pending: string | null = null;
let pendingTitle: string | null = null;

/**
 * Stores a message (and optional session title) that should be auto-sent
 * the next time ChatInterface mounts or the active session changes.
 * Only one pending message is held at a time; a second call overwrites the first.
 *
 * @param text - Message text to send automatically
 * @param title - Optional session title to apply to the new session
 */
export function setPendingMessage(text: string, title?: string): void {
  pending = text;
  pendingTitle = title ?? null;
}

export interface ConsumedPending {
  text: string;
  title?: string;
}

/**
 * Returns and clears the current pending message.
 * Returns `null` when no pending message exists.
 * After calling, both `pending` and `pendingTitle` are reset to null.
 */
export function consumePendingMessage(): ConsumedPending | null {
  if (!pending) return null;
  const result: ConsumedPending = { text: pending };
  if (pendingTitle) result.title = pendingTitle;
  pending = null;
  pendingTitle = null;
  return result;
}
