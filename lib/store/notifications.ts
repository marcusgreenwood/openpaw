"use client";

/**
 * @file Client-side notification store.
 *
 * Holds cron results and informational messages for the notification bell. Not
 * persisted and capped at 50 entries; the server keeps its own independent list
 * behind `/api/notifications`.
 */

import { create } from "zustand";

/** A notification shown in the notification bell. */
export interface Notification {
  id: string;
  type: "cron_success" | "cron_failure" | "info";
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  cronJobName?: string;
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
 * Store for in-app notifications.
 *
 * `addNotification` assigns the id and timestamp, marks the entry unread, and
 * prepends it, keeping only the 50 most recent.
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
