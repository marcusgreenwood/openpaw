"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ConversationBranch {
  id: string;
  sessionId: string;
  parentBranchId: string | null;
  forkFromMessageId: string;
  name: string;
  createdAt: number;
}

interface BranchState {
  branches: Record<string, ConversationBranch[]>;
  activeBranch: Record<string, string | null>;

  createBranch: (
    sessionId: string,
    forkFromMessageId: string,
    name?: string
  ) => string;
  switchBranch: (sessionId: string, branchId: string | null) => void;
  deleteBranch: (sessionId: string, branchId: string) => void;
  getBranches: (sessionId: string) => ConversationBranch[];
  getActiveBranch: (sessionId: string) => string | null;
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export const useBranchStore = create<BranchState>()(
  persist(
    (set, get) => ({
      branches: {},
      activeBranch: {},

      createBranch: (sessionId, forkFromMessageId, name) => {
        const id = generateId();
        const sessionBranches = get().branches[sessionId] ?? [];
        const branchNumber = sessionBranches.length + 1;
        const branch: ConversationBranch = {
          id,
          sessionId,
          parentBranchId: get().activeBranch[sessionId] ?? null,
          forkFromMessageId,
          name: name ?? `Branch ${branchNumber}`,
          createdAt: Date.now(),
        };
        set((state) => ({
          branches: {
            ...state.branches,
            [sessionId]: [...(state.branches[sessionId] ?? []), branch],
          },
          activeBranch: {
            ...state.activeBranch,
            [sessionId]: id,
          },
        }));
        return id;
      },

      switchBranch: (sessionId, branchId) =>
        set((state) => ({
          activeBranch: {
            ...state.activeBranch,
            [sessionId]: branchId,
          },
        })),

      deleteBranch: (sessionId, branchId) =>
        set((state) => {
          const filtered = (state.branches[sessionId] ?? []).filter(
            (b) => b.id !== branchId
          );
          const wasActive = state.activeBranch[sessionId] === branchId;
          return {
            branches: {
              ...state.branches,
              [sessionId]: filtered,
            },
            activeBranch: {
              ...state.activeBranch,
              [sessionId]: wasActive ? null : state.activeBranch[sessionId],
            },
          };
        }),

      getBranches: (sessionId) => get().branches[sessionId] ?? [],

      getActiveBranch: (sessionId) => get().activeBranch[sessionId] ?? null,
    }),
    {
      name: "openpaw-branches",
    }
  )
);
