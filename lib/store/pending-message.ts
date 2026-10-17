/**
 * Pending message to send when switching to a new session (e.g. from command palette, cron run).
 * ChatInterface consumes this when activeSessionId changes.
 */

let pending: string | null = null;
let pendingTitle: string | null = null;

/** Queue a message (and optional session title) to send; replaces any message already queued. */
export function setPendingMessage(text: string, title?: string): void {
  pending = text;
  pendingTitle = title ?? null;
}

/** A dequeued pending message; `title` is omitted when none was set. */
export interface ConsumedPending {
  text: string;
  title?: string;
}

/** Return the queued message and clear it, or `null` if nothing is queued. */
export function consumePendingMessage(): ConsumedPending | null {
  if (!pending) return null;
  const result: ConsumedPending = { text: pending };
  if (pendingTitle) result.title = pendingTitle;
  pending = null;
  pendingTitle = null;
  return result;
}
