"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useNotificationsStore, type Notification } from "@/lib/store/notifications";
import { useSessionsStore } from "@/lib/store/sessions";
import { cn } from "@/lib/utils";

const POLL_INTERVAL = 30_000;
const MAX_DISPLAY = 20;

function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 172_800_000) return "yesterday";
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function NotificationIcon({ type }: { type: Notification["type"] }) {
  if (type === "cron_success") {
    return <span className="text-terminal-green text-sm shrink-0">✅</span>;
  }
  if (type === "cron_failure") {
    return <span className="text-terminal-red text-sm shrink-0">❌</span>;
  }
  return <span className="text-accent-cyan text-sm shrink-0">ℹ️</span>;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [animate, setAnimate] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const lastPollRef = useRef<number>(0);

  const {
    notifications,
    addNotification,
    markRead,
    markAllRead,
    clearAll,
    unreadCount,
  } = useNotificationsStore();

  const { setActiveSession } = useSessionsStore();

  const count = unreadCount();

  const pollNotifications = useCallback(async () => {
    try {
      const since = lastPollRef.current;
      const url = since
        ? `/api/notifications?since=${since}`
        : `/api/notifications`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      const incoming: Notification[] = data.notifications ?? [];

      if (incoming.length > 0) {
        const existingIds = new Set(notifications.map((n) => n.id));
        let hasNew = false;
        for (const n of incoming) {
          if (!existingIds.has(n.id)) {
            addNotification({
              type: n.type,
              title: n.title,
              message: n.message,
              cronJobName: n.cronJobName,
              sessionId: n.sessionId,
            });
            hasNew = true;
          }
        }
        if (hasNew) {
          setAnimate(true);
          setTimeout(() => setAnimate(false), 600);
        }
        lastPollRef.current = Math.max(
          ...incoming.map((n) => n.timestamp),
          lastPollRef.current
        );
      }
    } catch {
      // polling failure is non-critical
    }
  }, [notifications, addNotification]);

  useEffect(() => {
    pollNotifications();
    const interval = setInterval(pollNotifications, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [pollNotifications]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  const handleNotificationClick = (n: Notification) => {
    markRead(n.id);
    if (n.sessionId) {
      setActiveSession(n.sessionId);
      setOpen(false);
    }
  };

  const displayed = notifications.slice(0, MAX_DISPLAY);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5 text-text-muted hover:text-text-secondary transition-colors cursor-pointer relative",
          animate && "notification-bell-ring"
        )}
        title="Notifications"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>

        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1 leading-none">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={dropdownRef}
          className="absolute right-0 top-full mt-2 w-80 max-h-[400px] flex flex-col rounded-xl border border-white/10 bg-bg-surface/95 backdrop-blur-xl shadow-2xl overflow-hidden z-50 notification-dropdown-enter"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/6">
            <span className="text-xs font-semibold text-text-primary">
              Notifications
            </span>
            {count > 0 && (
              <button
                onClick={markAllRead}
                className="text-[10px] text-accent-cyan hover:text-accent-cyan/80 cursor-pointer transition-colors"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {displayed.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-xs text-text-muted">No notifications yet</p>
              </div>
            ) : (
              displayed.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={cn(
                    "w-full text-left px-4 py-3 flex gap-3 items-start hover:bg-white/5 transition-colors border-b border-white/4 cursor-pointer",
                    !n.read && "bg-white/[0.02]"
                  )}
                >
                  <NotificationIcon type={n.type} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "text-xs font-medium truncate",
                          n.read ? "text-text-secondary" : "text-text-primary"
                        )}
                      >
                        {n.title}
                      </span>
                      {!n.read && (
                        <span className="w-1.5 h-1.5 rounded-full bg-accent-cyan shrink-0" />
                      )}
                    </div>
                    <p className="text-[11px] text-text-muted truncate mt-0.5">
                      {n.message}
                    </p>
                    <p className="text-[10px] text-text-muted/60 mt-1">
                      {formatTimeAgo(n.timestamp)}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>

          {displayed.length > 0 && (
            <div className="px-4 py-2 border-t border-white/6">
              <button
                onClick={() => {
                  clearAll();
                  setOpen(false);
                }}
                className="text-[10px] text-text-muted hover:text-terminal-red cursor-pointer transition-colors"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}

      <style jsx>{`
        @keyframes bellRing {
          0% { transform: rotate(0deg); }
          15% { transform: rotate(14deg); }
          30% { transform: rotate(-14deg); }
          45% { transform: rotate(10deg); }
          60% { transform: rotate(-10deg); }
          75% { transform: rotate(4deg); }
          100% { transform: rotate(0deg); }
        }
        .notification-bell-ring {
          animation: bellRing 0.6s ease-in-out;
        }
        @keyframes dropdownEnter {
          from {
            opacity: 0;
            transform: translateY(-8px) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .notification-dropdown-enter {
          animation: dropdownEnter 0.15s ease-out;
        }
      `}</style>
    </div>
  );
}
