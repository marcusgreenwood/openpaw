/**
 * Persists sessions created by cron prompts so the client can load them.
 * Stored in .claw/cron-sessions.json
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Session } from "@/types";
import type { UIMessage } from "ai";

const CONFIG_PATH = path.join(process.cwd(), ".claw", "cron-sessions.json");

export interface CronSessionData {
  session: Session;
  messages: UIMessage[];
}

export interface StoredCronSessions {
  sessions: CronSessionData[];
}

export async function loadCronSessions(): Promise<CronSessionData[]> {
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf-8");
    const data = JSON.parse(raw) as StoredCronSessions;
    return data.sessions ?? [];
  } catch {
    return [];
  }
}

export async function saveCronSession(data: CronSessionData): Promise<void> {
  const existing = await loadCronSessions();
  const updated = [data, ...existing];
  await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
  await fs.writeFile(
    CONFIG_PATH,
    JSON.stringify({ sessions: updated }, null, 2),
    "utf-8"
  );
}

export async function deleteCronSession(sessionId: string): Promise<boolean> {
  const existing = await loadCronSessions();
  const updated = existing.filter((c) => c.session.id !== sessionId);
  if (updated.length === existing.length) return false;
  await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
  await fs.writeFile(
    CONFIG_PATH,
    JSON.stringify({ sessions: updated }, null, 2),
    "utf-8"
  );
  return true;
}
