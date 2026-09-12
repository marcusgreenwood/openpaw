/**
 * Store for the notification bell.
 *
 * Not persisted and capped at 50 entries. Notifications originate server-side from the
 * cron runner and are polled in from GET /api/notifications, so this store is a client
 * mirror rather than the source of truth — read state is local and is not sent back.
 */

"use client";
import { create } from "zustand";

/** A single notification. */
export interface Notification {
  /** Generated client-side id. */
  id: string;
  /** What produced it — cron outcomes, or a generic informational message. */
  type: "cron_success" | "cron_failure" | "info";
  /** Short headline. */
  title: string;
  /** Body text; for crons, a truncated excerpt of the output or error. */
  message: string;
  /** When it was added, ms since epoch. */
  timestamp: number;
  /** Whether the user has seen it. */
  read: boolean;
  /** Name of the originating cron job, for cron notifications. */
  cronJobName?: string;
  /** Session created by a prompt cron, so the notification can link to the transcript. */
  sessionId?: string;
}

interface NotificationsState {
  notifications: Notification[];
  addNotification: (n: Omit<Notification, "id" | "timestamp" | "read">) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clearAll: () => void;
  unreadCount: () => number;
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * Notification state.
 *
 * `addNotification(n)` fills in the id, timestamp and unread flag and prepends it, keeping
 * the 50 newest. `markRead(id)`, `markAllRead()` and `clearAll()` manage read state, and
 * `unreadCount()` derives the bell's badge count.
 */
export const useNotificationsStore = create<NotificationsState>()((set, get) => ({
  notifications: [],

  addNotification: (n) => {
    const notification: Notification = {
      ...n,
      id: generateId(),
      timestamp: Date.now(),
      read: false,
    };
    set((state) => ({
      notifications: [notification, ...state.notifications].slice(0, 50),
    }));
  },

  markRead: (id) =>
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      ),
    })),

  markAllRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
    })),

  clearAll: () => set({ notifications: [] }),

  unreadCount: () => get().notifications.filter((n) => !n.read).length,
}));
