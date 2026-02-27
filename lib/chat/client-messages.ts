/**
 * Client-side message persistence for chat sessions.
 * Uses localStorage so messages survive page reloads.
 *
 * Branch-aware: messages can be stored per-branch using a composite key
 * `{sessionId}:{branchId}`. The main conversation uses the plain sessionId.
 */

import type { UIMessage } from "ai";

const STORAGE_PREFIX = "openpaw-messages-";

function storageKey(sessionId: string, branchId?: string | null): string {
  return branchId
    ? `${STORAGE_PREFIX}${sessionId}:${branchId}`
    : `${STORAGE_PREFIX}${sessionId}`;
}

export function loadMessages(sessionId: string): UIMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey(sessionId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveMessages(sessionId: string, messages: UIMessage[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey(sessionId), JSON.stringify(messages));
  } catch {
    // quota exceeded — silently ignore
  }
}

export function clearSessionMessages(sessionId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(storageKey(sessionId));
  } catch {
    // ignore
  }
}

/* ── Branch-aware helpers ─────────────────────────────────── */

export function getMessagesForBranch(
  sessionId: string,
  branchId: string | null
): UIMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey(sessionId, branchId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveMessagesForBranch(
  sessionId: string,
  branchId: string | null,
  messages: UIMessage[]
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      storageKey(sessionId, branchId),
      JSON.stringify(messages)
    );
  } catch {
    // quota exceeded — silently ignore
  }
}

/**
 * Copy messages up to (and including) the fork-point message into a new
 * branch's storage. Returns the copied messages.
 */
export function forkMessagesIntoBranch(
  sessionId: string,
  branchId: string,
  forkFromMessageId: string,
  sourceBranchId: string | null
): UIMessage[] {
  const sourceMessages = getMessagesForBranch(sessionId, sourceBranchId);
  const forkIndex = sourceMessages.findIndex(
    (m) => m.id === forkFromMessageId
  );
  const messagesUpToFork =
    forkIndex >= 0
      ? sourceMessages.slice(0, forkIndex + 1)
      : [...sourceMessages];
  saveMessagesForBranch(sessionId, branchId, messagesUpToFork);
  return messagesUpToFork;
}
