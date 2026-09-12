"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Session, ProjectProfile } from "@/types";
import { DEFAULT_MODEL_ID } from "@/lib/models/providers";
import type { CronSessionData } from "@/lib/crons/cron-sessions";
import { setPendingMessage } from "@/lib/store/pending-message";

/**
 * A preset for starting a session with a particular purpose.
 *
 * Built-in templates live in {@link BUILT_IN_TEMPLATES}; user-defined ones are persisted
 * with the store.
 */
export interface SessionTemplate {
  /** Template id. Built-ins are prefixed `builtin-`. */
  id: string;
  /** Display name, also used as the created session's title. */
  name: string;
  /** Short summary shown in the template picker. */
  description: string;
  /** Emoji shown next to the name. */
  icon: string;
  /** Extra system prompt text. Currently stored but not yet applied when creating a session. */
  systemPromptAddition?: string;
  /** First message to send automatically once the session opens. */
  openingMessage?: string;
  /** Model to use; falls back to the store's current `modelId`. */
  modelId?: string;
}

/** Templates shipped with the app. Always offered alongside any user-defined ones. */
export const BUILT_IN_TEMPLATES: SessionTemplate[] = [
  {
    id: "builtin-code-review",
    name: "Code Review",
    description: "Review code changes and suggest improvements",
    icon: "🔍",
    openingMessage:
      "Please review the following code and suggest improvements. I'll paste the code next.",
  },
  {
    id: "builtin-debug",
    name: "Debug Session",
    description: "Diagnose and fix bugs step by step",
    icon: "🐛",
    openingMessage:
      "Let's debug an issue together. Please describe the problem you're seeing.",
  },
  {
    id: "builtin-docs",
    name: "Documentation",
    description: "Generate docs, READMEs, and comments",
    icon: "📝",
    openingMessage:
      "I'll help you write documentation. What would you like to document?",
  },
  {
    id: "builtin-project-setup",
    name: "Project Setup",
    description: "Bootstrap new projects and configure tools",
    icon: "🚀",
    openingMessage:
      "Let's set up a new project. What kind of project are you building?",
  },
  {
    id: "builtin-test-writer",
    name: "Test Writer",
    description: "Write unit and integration tests",
    icon: "🧪",
    openingMessage:
      "I'll help you write tests. What code would you like to test?",
  },
];

interface SessionsState {
  sessions: Session[];
  cronSessions: CronSessionData[];
  activeSessionId: string | null;
  modelId: string;
  workspacePath: string;
  maxToolSteps: number;
  sidebarOpen: boolean;
  templates: SessionTemplate[];
  toolApprovalMode: boolean;
  projects: ProjectProfile[];
  activeProjectId: string | null;

  createSession: () => string;
  setActiveSession: (id: string) => void;
  updateSessionTitle: (id: string, title: string) => void;
  deleteSession: (id: string) => void;
  setCronSessions: (data: CronSessionData[]) => void;
  setModelId: (modelId: string) => void;
  setWorkspacePath: (path: string) => void;
  setMaxToolSteps: (n: number) => void;
  setSidebarOpen: (open: boolean) => void;
  setToolApprovalMode: (enabled: boolean) => void;
  addTemplate: (template: SessionTemplate) => void;
  deleteTemplate: (id: string) => void;
  createSessionFromTemplate: (templateId: string) => string | null;
  addProject: (project: Omit<ProjectProfile, "id" | "createdAt">) => string;
  deleteProject: (id: string) => void;
  updateProject: (id: string, updates: Partial<Omit<ProjectProfile, "id" | "createdAt">>) => void;
  setActiveProject: (id: string | null) => void;
}

/** Generates a short id from the current time plus random suffix. */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * The app's primary client store: chat sessions, the active selection, and the global
 * chat settings the header and sidebar read from.
 *
 * Persisted to localStorage under `openpaw-sessions`. Two pieces of state are
 * deliberately excluded from persistence and refetched each visit: `cronSessions`, which
 * is server-owned and loaded from GET /api/cron-sessions, and `sidebarOpen`.
 *
 * Session actions:
 * - `createSession()` — opens a new session with the current model and workspace, makes it
 *   active, and returns its id
 * - `setActiveSession`, `updateSessionTitle`, `deleteSession` — manage the session list.
 *   Deleting the active session selects the next available session, preferring a regular
 *   session over a cron session, and falls back to `null` when none remain
 * - `setCronSessions(data)` — replaces the mirror of server-side cron transcripts
 *
 * Settings actions: `setModelId`, `setWorkspacePath`, `setMaxToolSteps`, `setSidebarOpen`
 * and `setToolApprovalMode`, which gates whether tool calls require confirmation.
 *
 * Template actions: `addTemplate` and `deleteTemplate` manage user templates, while
 * `createSessionFromTemplate(templateId)` searches built-ins and user templates, creates a
 * session, and — if the template has an `openingMessage` — queues it as a pending message
 * and dispatches `openpaw-new-chat` so ChatInterface sends it. Returns `null` for an
 * unknown template id.
 *
 * Project actions: `addProject`, `updateProject` and `deleteProject` manage saved project
 * profiles; `setActiveProject(id)` also switches the workspace to that project's path and,
 * when the project declares one, its preferred model. Passing `null` clears the selection
 * without touching the workspace, and an unknown id is ignored.
 */
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
      templates: [],
      toolApprovalMode: false,
      projects: [],
      activeProjectId: null,

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
      setToolApprovalMode: (toolApprovalMode) => set({ toolApprovalMode }),

      addTemplate: (template) =>
        set((state) => ({
          templates: [...state.templates, template],
        })),

      deleteTemplate: (id) =>
        set((state) => ({
          templates: state.templates.filter((t) => t.id !== id),
        })),

      createSessionFromTemplate: (templateId) => {
        const allTemplates = [
          ...BUILT_IN_TEMPLATES,
          ...get().templates,
        ];
        const template = allTemplates.find((t) => t.id === templateId);
        if (!template) return null;

        const id = generateId();
        const session: Session = {
          id,
          title: template.name,
          modelId: template.modelId ?? get().modelId,
          workspacePath: get().workspacePath,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        set((state) => ({
          sessions: [session, ...state.sessions],
          activeSessionId: id,
        }));

        if (template.openingMessage) {
          setPendingMessage(template.openingMessage, template.name);
          window.dispatchEvent(new CustomEvent("openpaw-new-chat"));
        }

        return id;
      },

      addProject: (project) => {
        const id = generateId();
        const newProject: ProjectProfile = {
          ...project,
          id,
          createdAt: Date.now(),
        };
        set((state) => ({
          projects: [...state.projects, newProject],
        }));
        return id;
      },

      deleteProject: (id) =>
        set((state) => ({
          projects: state.projects.filter((p) => p.id !== id),
          activeProjectId: state.activeProjectId === id ? null : state.activeProjectId,
        })),

      updateProject: (id, updates) =>
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id ? { ...p, ...updates } : p
          ),
        })),

      setActiveProject: (id) => {
        const state = get();
        if (id === null) {
          set({ activeProjectId: null });
          return;
        }
        const project = state.projects.find((p) => p.id === id);
        if (!project) return;
        const updates: Partial<SessionsState> = {
          activeProjectId: id,
          workspacePath: project.workspacePath,
        };
        if (project.preferredModelId) {
          updates.modelId = project.preferredModelId;
        }
        set(updates);
      },
    }),
    {
      name: "openpaw-sessions",
      partialize: (state) => ({
        sessions: state.sessions,
        activeSessionId: state.activeSessionId,
        modelId: state.modelId,
        workspacePath: state.workspacePath,
        maxToolSteps: state.maxToolSteps,
        templates: state.templates,
        toolApprovalMode: state.toolApprovalMode,
        projects: state.projects,
        activeProjectId: state.activeProjectId,
      }),
    }
  )
);
