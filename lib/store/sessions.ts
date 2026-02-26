"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Session } from "@/types";
import { DEFAULT_MODEL_ID } from "@/lib/models/providers";
import type { CronSessionData } from "@/lib/crons/cron-sessions";

/**
 * Shape of the persisted + in-memory sessions store.
 *
 * Persisted fields (via localStorage key `openpaw-sessions`):
 *   - `sessions`, `activeSessionId`, `modelId`, `workspacePath`, `maxToolSteps`
 *
 * In-memory only (reset on page reload):
 *   - `cronSessions`, `sidebarOpen`
 */
interface SessionsState {
  /** All user-created chat sessions, newest first. */
  sessions: Session[];
  /** Cron-generated sessions loaded from the server on mount. */
  cronSessions: CronSessionData[];
  /** ID of the currently visible session, or null when none is selected. */
  activeSessionId: string | null;
  /** Provider-qualified model ID used for new sessions (e.g. "anthropic/claude-sonnet-4-6"). */
  modelId: string;
  /** Absolute path to the agent's working directory. Empty string = use server default. */
  workspacePath: string;
  /** Maximum number of tool-call steps per request before the agent pauses. */
  maxToolSteps: number;
  /** Whether the sidebar is visible (desktop) / expanded (mobile). */
  sidebarOpen: boolean;

  /** Creates a new session, prepends it to the list, sets it as active, and returns its ID. */
  createSession: () => string;
  /** Switches the active session without modifying the sessions list. */
  setActiveSession: (id: string) => void;
  /** Updates the display title of a session and refreshes its `updatedAt` timestamp. */
  updateSessionTitle: (id: string, title: string) => void;
  /**
   * Removes a session (and any associated cron session) from the store.
   * If the deleted session was active, focus moves to the next available session.
   */
  deleteSession: (id: string) => void;
  /** Replaces the entire cron sessions list (called on mount and after cron runs). */
  setCronSessions: (data: CronSessionData[]) => void;
  /** Updates the active model ID (persisted). */
  setModelId: (modelId: string) => void;
  /** Updates the workspace path (persisted). */
  setWorkspacePath: (path: string) => void;
  /** Updates the max tool steps cap (persisted). */
  setMaxToolSteps: (n: number) => void;
  /** Shows or hides the sidebar. */
  setSidebarOpen: (open: boolean) => void;
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export const useSessionsStore = create<SessionsState>()(
  persist(
    (set, get) => ({
      sessions: [],
      cronSessions: [],
      activeSessionId: null,
      modelId: DEFAULT_MODEL_ID,
      workspacePath: "",
      maxToolSteps: 15,
      sidebarOpen: true,

      createSession: () => {
        const id = generateId();
        const session: Session = {
          id,
          title: "New Chat",
          modelId: get().modelId,
          workspacePath: get().workspacePath,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        set((state) => ({
          sessions: [session, ...state.sessions],
          activeSessionId: id,
        }));
        return id;
      },

      setActiveSession: (id) => set({ activeSessionId: id }),

      updateSessionTitle: (id, title) =>
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === id ? { ...s, title, updatedAt: Date.now() } : s
          ),
        })),

      deleteSession: (id) =>
        set((state) => {
          const nextSessions = state.sessions.filter((s) => s.id !== id);
          const nextCronSessions = state.cronSessions.filter(
            (c) => c.session.id !== id
          );
          const nextId =
            state.activeSessionId === id
              ? nextSessions[0]?.id ?? nextCronSessions[0]?.session.id ?? null
              : state.activeSessionId;
          return {
            sessions: nextSessions,
            cronSessions: nextCronSessions,
            activeSessionId: nextId,
          };
        }),

      setCronSessions: (data) => set({ cronSessions: data }),

      setModelId: (modelId) => set({ modelId }),
      setWorkspacePath: (workspacePath) => set({ workspacePath }),
      setMaxToolSteps: (maxToolSteps) => set({ maxToolSteps }),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
    }),
    {
      name: "openpaw-sessions",
      partialize: (state) => ({
        sessions: state.sessions,
        activeSessionId: state.activeSessionId,
        modelId: state.modelId,
        workspacePath: state.workspacePath,
        maxToolSteps: state.maxToolSteps,
      }),
    }
  )
);
