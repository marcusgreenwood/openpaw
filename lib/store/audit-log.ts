/**
 * Store for the tool-call audit log shown in the audit panel.
 *
 * Not persisted and capped at the 100 most recent entries, so this is a live view of the
 * current visit rather than a durable record.
 */

"use client";

import { create } from "zustand";

/** One recorded tool call. */
export interface AuditLogEntry {
  /** Generated client-side id. */
  id: string;
  /** When the call was recorded, ms since epoch. */
  timestamp: number;
  /** Name of the tool invoked, e.g. `"executeBash"`. */
  toolName: string;
  /** The arguments the model passed to the tool. */
  parameters: Record<string, unknown>;
  /** The tool's output. Reserved — the current writer does not capture it. */
  result?: string;
  /**
   * How the call was authorized. The approval prompt in components/chat/ToolApproval.tsx
   * writes `approved` or `denied`; `auto`, for calls that ran without a prompt, is
   * declared but not currently emitted.
   */
  status: "approved" | "denied" | "auto";
  /** Execution duration in milliseconds. Reserved — the current writer does not set it. */
  durationMs?: number;
}

interface AuditLogState {
  entries: AuditLogEntry[];
  addEntry: (entry: Omit<AuditLogEntry, "id">) => void;
  clearEntries: () => void;
}

/** Entries beyond this count are dropped, oldest first. */
const MAX_ENTRIES = 100;

/**
 * Audit log state.
 *
 * `addEntry(entry)` assigns an id and prepends the entry, trimming to
 * {@link MAX_ENTRIES}; `clearEntries()` empties the log.
 */
export const useAuditLogStore = create<AuditLogState>()((set) => ({
  entries: [],

  addEntry: (entry) =>
    set((state) => {
      const newEntry: AuditLogEntry = {
        ...entry,
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      };
      const updated = [newEntry, ...state.entries].slice(0, MAX_ENTRIES);
      return { entries: updated };
    }),

  clearEntries: () => set({ entries: [] }),
}));
