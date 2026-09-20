/**
 * @file Public entry point for the long-term memory subsystem.
 *
 * Re-exports the Minns client surface so callers can import from `@/lib/memory`
 * without depending on the concrete backend module. Every re-exported function
 * degrades gracefully when memory is not configured.
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
