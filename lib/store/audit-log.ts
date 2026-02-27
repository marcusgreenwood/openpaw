"use client";

import { create } from "zustand";

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
