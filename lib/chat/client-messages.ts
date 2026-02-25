/**
 * Client-side message persistence for chat sessions.
 * Uses localStorage so messages survive page reloads.
 */

import type { UIMessage } from "ai";

const STORAGE_PREFIX = "openpaw-messages-";

export function loadMessages(sessionId: string): UIMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + sessionId);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveMessages(sessionId: string, messages: UIMessage[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_PREFIX + sessionId, JSON.stringify(messages));
  } catch {
    // quota exceeded — silently ignore
  }
}

export function clearSessionMessages(sessionId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_PREFIX + sessionId);
  } catch {
    // ignore
  }
}
