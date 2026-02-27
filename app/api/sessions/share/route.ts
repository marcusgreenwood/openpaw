import { NextRequest, NextResponse } from "next/server";
import * as fs from "node:fs/promises";
import * as path from "node:path";

export const runtime = "nodejs";

const SHARED_DIR = path.join(process.cwd(), ".claw", "shared-sessions");

async function ensureDir() {
  await fs.mkdir(SHARED_DIR, { recursive: true });
}

function sessionPath(id: string) {
  const safe = id.replace(/[^a-zA-Z0-9_-]/g, "");
  return path.join(SHARED_DIR, `${safe}.json`);
}

interface PresenceEntry {
  viewerId: string;
  lastSeen: number;
}

interface SharedSession {
  sessionId: string;
  messages: unknown[];
  sharedAt: number;
  updatedAt: number;
  presence: PresenceEntry[];
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId, messages } = body as {
      sessionId?: string;
      messages?: unknown[];
    };

    if (!sessionId || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: "sessionId and messages[] are required" },
        { status: 400 }
      );
    }

    await ensureDir();
    const filePath = sessionPath(sessionId);

    let existing: SharedSession | null = null;
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      existing = JSON.parse(raw);
    } catch {
      // file doesn't exist yet
    }

    const session: SharedSession = {
      sessionId,
      messages,
      sharedAt: existing?.sharedAt ?? Date.now(),
      updatedAt: Date.now(),
      presence: existing?.presence ?? [],
    };

    await fs.writeFile(filePath, JSON.stringify(session, null, 2));

    const shareUrl = `/shared/${sessionId}`;
    return NextResponse.json({ shareUrl, sessionId });
  } catch (err) {
    console.error("[share] POST error:", err);
    return NextResponse.json(
      { error: "Failed to share session" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const presence = searchParams.get("presence");
  const viewerId = searchParams.get("viewerId");

  if (!id) {
    return NextResponse.json(
      { error: "id query param is required" },
      { status: 400 }
    );
  }

  await ensureDir();
  const filePath = sessionPath(id);

  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const session: SharedSession = JSON.parse(raw);

    if (presence === "true" && viewerId) {
      const now = Date.now();
      const PRESENCE_TTL = 30_000;
      session.presence = session.presence.filter(
        (p) => now - p.lastSeen < PRESENCE_TTL
      );

      const existing = session.presence.find((p) => p.viewerId === viewerId);
      if (existing) {
        existing.lastSeen = now;
      } else {
        session.presence.push({ viewerId, lastSeen: now });
      }

      await fs.writeFile(filePath, JSON.stringify(session, null, 2));
    }

    const activePresence = session.presence.filter(
      (p) => Date.now() - p.lastSeen < 30_000
    );

    return NextResponse.json({
      sessionId: session.sessionId,
      messages: session.messages,
      sharedAt: session.sharedAt,
      updatedAt: session.updatedAt,
      viewerCount: activePresence.length,
    });
  } catch {
    return NextResponse.json(
      { error: "Session not found" },
      { status: 404 }
    );
  }
}
