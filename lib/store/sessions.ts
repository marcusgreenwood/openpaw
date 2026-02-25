"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Session } from "@/types";
import { DEFAULT_MODEL_ID } from "@/lib/models/providers";

interface SessionsState {
  sessions: Session[];
  activeSessionId: string | null;
  modelId: string;
  workspacePath: string;
  sidebarOpen: boolean;

  createSession: () => string;
  setActiveSession: (id: string) => void;
  updateSessionTitle: (id: string, title: string) => void;
  deleteSession: (id: string) => void;
  setModelId: (modelId: string) => void;
  setWorkspacePath: (path: string) => void;
  setSidebarOpen: (open: boolean) => void;
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export const useSessionsStore = create<SessionsState>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeSessionId: null,
      modelId: DEFAULT_MODEL_ID,
      workspacePath: "",
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
        set((state) => ({
          sessions: state.sessions.filter((s) => s.id !== id),
          activeSessionId:
            state.activeSessionId === id
              ? state.sessions.find((s) => s.id !== id)?.id ?? null
              : state.activeSessionId,
        })),

      setModelId: (modelId) => set({ modelId }),
      setWorkspacePath: (workspacePath) => set({ workspacePath }),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
    }),
    {
      name: "openpaw-sessions",
      partialize: (state) => ({
        sessions: state.sessions,
        activeSessionId: state.activeSessionId,
        modelId: state.modelId,
        workspacePath: state.workspacePath,
      }),
    }
  )
);
