"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Session, ProjectProfile } from "@/types";
import { DEFAULT_MODEL_ID } from "@/lib/models/providers";
import type { CronSessionData } from "@/lib/crons/cron-sessions";
import { setPendingMessage } from "@/lib/store/pending-message";

export interface SessionTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  systemPromptAddition?: string;
  openingMessage?: string;
  modelId?: string;
}

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
