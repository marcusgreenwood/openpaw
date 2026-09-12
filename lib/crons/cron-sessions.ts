/**
 * Persists sessions created by cron prompts so the client can load them.
 * Stored in .claw/cron-sessions.json
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Session } from "@/types";
import type { UIMessage } from "ai";

const CONFIG_PATH = path.join(process.cwd(), ".claw", "cron-sessions.json");

/** A transcript produced by one run of a prompt cron. */
export interface CronSessionData {
  /** Session metadata, mirroring a normal chat session so the UI can render it as one. */
  session: Session;
  /** The transcript — a user message holding the prompt and the assistant's reply. */
  messages: UIMessage[];
}

/** On-disk shape of `.claw/cron-sessions.json`. */
export interface StoredCronSessions {
  sessions: CronSessionData[];
}

/**
 * Reads every stored cron session, newest first.
 *
 * @returns The stored sessions, or an empty array if the file is missing or unparseable.
 */
export async function loadCronSessions(): Promise<CronSessionData[]> {
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf-8");
    const data = JSON.parse(raw) as StoredCronSessions;
    return data.sessions ?? [];
  } catch {
    return [];
  }
}

/**
 * Prepends one cron session to the store, creating `.claw/` if needed.
 *
 * Read-modify-write against a single JSON file, so concurrent cron runs finishing at the
 * same instant can lose one of their sessions.
 *
 * @param data - The session and its transcript.
 */
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

/**
 * Removes a stored cron session by its session id.
 *
 * @param sessionId - The `session.id` to remove.
 * @returns `true` if a session was removed, `false` if no session matched.
 */
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
