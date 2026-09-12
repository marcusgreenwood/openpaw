/**
 * Store for conversation branching — forking a session at a chosen message to explore an
 * alternative continuation without losing the original.
 *
 * Persisted to localStorage under `openpaw-branches`. This store holds only branch
 * metadata; the messages themselves live with the session.
 */

"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/** A fork point within a session. */
export interface ConversationBranch {
  /** Generated branch id. */
  id: string;
  /** Session this branch belongs to. */
  sessionId: string;
  /** Branch that was active when this one was created; `null` if forked from the trunk. */
  parentBranchId: string | null;
  /** Id of the message the branch forks after. */
  forkFromMessageId: string;
  /** Display name, defaulting to `Branch <n>`. */
  name: string;
  /** Creation time, ms since epoch. */
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

/**
 * Branch state, keyed by session id.
 *
 * `createBranch(sessionId, forkFromMessageId, name?)` records a fork, makes it active and
 * returns its id. `switchBranch(sessionId, branchId)` activates a branch, or the trunk
 * when passed `null`. `deleteBranch(sessionId, branchId)` removes a branch, falling back
 * to the trunk if it was active — note that child branches are not cascaded and keep a
 * dangling `parentBranchId`. `getBranches` and `getActiveBranch` are read helpers.
 */
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
