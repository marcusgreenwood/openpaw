/**
 * Public entry point for the optional long-term memory layer (Minns).
 *
 * Re-exports the Minns client surface so callers never import the client
 * module directly. Memory is entirely optional: when no API key is configured
 * `isMemoryEnabled()` returns false and the app runs unchanged.
 *
 * Configured via `MINNS_API_KEY` / `MINNS_PROJECT_ID`, falling back to
 * `.claw/minns-config.json`. If the env key is set the file is not read at all.
 * Config is loaded once per process, so changes need a restart.
 *
 * @see lib/memory/minns-client.ts — implementation
 * @see lib/chat/handler.ts — recalls before a response, records after one
 */
export {
  getMinnsClient,
  isMemoryEnabled,
  recordChatEvent,
  recallMemories,
  getMemories,
  searchMemoryFacts,
  saveUserContext,
} from "./minns-client";
