/**
 * In-app notification feed (cron results and informational messages).
 * GET    /api/notifications?since= — list notifications newer than a timestamp
 * POST   /api/notifications — push a notification
 * DELETE /api/notifications — clear all notifications
 *
 * Notifications are held in a module-level array capped at 100 entries: they do
 * not survive a restart and are not shared between serverless instances.
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";

interface StoredNotification {
  id: string;
  type: "cron_success" | "cron_failure" | "info";
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  cronJobName?: string;
  sessionId?: string;
}

const MAX_NOTIFICATIONS = 100;

const notifications: StoredNotification[] = [];

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const since = url.searchParams.get("since");
  const sinceTs = since ? parseInt(since, 10) : 0;

  const filtered = sinceTs
    ? notifications.filter((n) => n.timestamp > sinceTs)
    : notifications;

  return NextResponse.json({ notifications: filtered.slice(0, 50) });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const notification: StoredNotification = {
      id: body.id || generateId(),
      type: body.type || "info",
      title: body.title || "Notification",
      message: body.message || "",
      timestamp: body.timestamp || Date.now(),
      read: false,
      cronJobName: body.cronJobName,
      sessionId: body.sessionId,
    };

    notifications.unshift(notification);

    if (notifications.length > MAX_NOTIFICATIONS) {
      notifications.length = MAX_NOTIFICATIONS;
    }

    return NextResponse.json({ ok: true, notification });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}

export async function DELETE() {
  notifications.length = 0;
  return NextResponse.json({ ok: true });
}
