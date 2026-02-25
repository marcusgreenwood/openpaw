/**
 * Pending message to send when switching to a new session (e.g. from command palette, cron run).
 * ChatInterface consumes this when activeSessionId changes.
 */

let pending: string | null = null;
let pendingTitle: string | null = null;

export function setPendingMessage(text: string, title?: string): void {
  pending = text;
  pendingTitle = title ?? null;
}

export interface ConsumedPending {
  text: string;
  title?: string;
}

export function consumePendingMessage(): ConsumedPending | null {
  if (!pending) return null;
  const result: ConsumedPending = { text: pending };
  if (pendingTitle) result.title = pendingTitle;
  pending = null;
  pendingTitle = null;
  return result;
}
