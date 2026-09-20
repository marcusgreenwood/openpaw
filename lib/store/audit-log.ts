"use client";

/**
 * @file Tool audit log store (client-side, in-memory).
 *
 * Records every tool invocation the agent makes so the user can review what ran,
 * with which parameters, and whether it was approved. Not persisted: the log is
 * capped at the most recent 100 entries and is cleared on reload.
 */

import { create } from "zustand";

/** A single recorded tool invocation. */
export interface AuditLogEntry {
  id: string;
  timestamp: number;
  toolName: string;
  parameters: Record<string, unknown>;
  result?: string;
  status: "approved" | "denied" | "auto";
  durationMs?: number;
}

interface AuditLogState {
  entries: AuditLogEntry[];
  addEntry: (entry: Omit<AuditLogEntry, "id">) => void;
  clearEntries: () => void;
}

const MAX_ENTRIES = 100;

/**
 * Store of recent tool invocations.
 *
 * `addEntry` assigns the id and prepends the entry, trimming the list to the
 * 100 most recent. `clearEntries` empties it.
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
