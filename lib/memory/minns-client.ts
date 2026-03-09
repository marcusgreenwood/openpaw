/**
 * @file Minns client — thin wrapper around the Minns SDK for long-term agent memory.
 *
 * Lazily initialises a singleton {@link MinnsClient} on first use; all public functions
 * return empty/void results when Minns is not configured (no API key), so callers do
 * not need to guard against a missing client. Configuration is read from the
 * `MINNS_API_KEY` / `MINNS_PROJECT_ID` environment variables or `.claw/minns-config.json`.
 */

import { createClient, type MinnsClient, type MemoryResponse, type RecallContextResult, type ClaimSearchResponse } from "minns-sdk";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const DEFAULT_AGENT_ID = 1;
const CONFIG_PATH = path.join(process.cwd(), ".claw", "minns-config.json");

interface MinnsConfig {
  apiKey: string;
  projectId: string;
}

let _client: MinnsClient | null = null;
let _configLoaded = false;

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

async function loadConfig(): Promise<MinnsConfig | null> {
  const envKey = process.env.MINNS_API_KEY;
  const envProject = process.env.MINNS_PROJECT_ID;
  if (envKey) {
    return { apiKey: envKey, projectId: envProject ?? "" };
  }

  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw) as MinnsConfig;
    if (parsed.apiKey) return parsed;
  } catch {
    // config file missing or invalid — Minns not configured
  }

  return null;
}

/**
 * Returns the singleton Minns client, initialising it on first call.
 * Returns `null` when Minns is not configured (missing API key).
 */
export async function getMinnsClient(): Promise<MinnsClient | null> {
  if (_configLoaded) return _client;
  _configLoaded = true;

  const config = await loadConfig();
  if (!config) return null;

  _client = createClient(config.apiKey, { agentId: DEFAULT_AGENT_ID });
  return _client;
}

/**
 * Returns `true` when a Minns client has been successfully configured,
 * `false` when no API key is present. Use this to conditionally surface
 * memory-related UI or skip memory operations.
 */
export async function isMemoryEnabled(): Promise<boolean> {
  const client = await getMinnsClient();
  return client !== null;
}

/**
 * Records a chat exchange as two Minns events: a semantic context event for the
 * full exchange text and an action/outcome event capturing tool calls made.
 * No-ops silently when Minns is not configured or the request fails.
 *
 * @param sessionId           - Session identifier (hashed to a numeric key).
 * @param agentType           - Agent type label used as the Minns event namespace.
 * @param userMessage         - The user's raw message text.
 * @param assistantResponse   - The assistant's response text.
 * @param toolCalls           - Optional list of tool names invoked during the turn.
 */
export async function recordChatEvent(
  sessionId: string,
  agentType: string,
  userMessage: string,
  assistantResponse: string,
  toolCalls?: string[],
): Promise<void> {
  const client = await getMinnsClient();
  if (!client) return;

  const numericSession = simpleHash(sessionId);
  const exchangeText = `User: ${userMessage}\nAssistant: ${assistantResponse}`;

  try {
    await client
      .event(agentType, { sessionId: numericSession })
      .context(exchangeText, "chat_exchange")
      .semantic(true)
      .send();

    await client
      .event(agentType, { sessionId: numericSession })
      .action("chat_response", {
        query: userMessage,
        tool_calls: toolCalls ?? [],
      })
      .outcome({ response: assistantResponse })
      .send();
  } catch {
    // Minns unavailable — silently continue
  }
}

/**
 * Runs a multi-strategy memory recall against Minns for the given query.
 * Returns strategies, episodic memories, and claims relevant to the query.
 * Returns an empty result when Minns is unavailable or the request fails.
 *
 * @param query   - Natural language query used to retrieve relevant memories.
 * @param agentId - Optional agent ID; defaults to {@link DEFAULT_AGENT_ID}.
 * @returns A {@link RecallContextResult} with strategies, memories, and claims.
 */
export async function recallMemories(
  query: string,
  agentId?: number,
): Promise<RecallContextResult> {
  const empty: RecallContextResult = { strategies: [], memories: [], claims: [], recall_ms: 0 };
  const client = await getMinnsClient();
  if (!client) return empty;

  try {
    const context = {
      environment: { variables: {}, spatial: null, temporal: { time_of_day: null, deadlines: [], patterns: [] } },
      active_goals: [],
      resources: { computational: { cpu_percent: 0, memory_bytes: 0, storage_bytes: 0, network_bandwidth: 0 }, external: {} },
      embeddings: null,
    };

    return await client.recallContext({
      agentId: agentId ?? DEFAULT_AGENT_ID,
      context,
      claimsQuery: query,
      memoryLimit: 5,
      strategyLimit: 3,
    });
  } catch {
    return empty;
  }
}

/**
 * Fetches stored episodic memories for an agent from Minns.
 * Returns an empty array when Minns is unavailable or the request fails.
 *
 * @param agentId - Numeric ID of the agent whose memories to retrieve.
 * @param limit   - Maximum number of memories to return (defaults to 10).
 * @returns Array of {@link MemoryResponse} objects.
 */
export async function getMemories(
  agentId: number,
  limit?: number,
): Promise<MemoryResponse[]> {
  const client = await getMinnsClient();
  if (!client) return [];

  try {
    return await client.getAgentMemories(agentId, limit ?? 10);
  } catch {
    return [];
  }
}

/**
 * Searches stored claims (facts) in Minns using semantic similarity to the query.
 * Returns the top-5 matching claims. Returns an empty array when Minns is unavailable.
 *
 * @param query - Natural language query to match against stored claims.
 * @returns Array of {@link ClaimSearchResponse} objects ranked by relevance.
 */
export async function searchMemoryFacts(
  query: string,
): Promise<ClaimSearchResponse[]> {
  const client = await getMinnsClient();
  if (!client) return [];

  try {
    return await client.searchClaims({ queryText: query, topK: 5 });
  } catch {
    return [];
  }
}

/**
 * Saves a piece of user context (preference, fact, or instruction) to Minns as a
 * semantic `user_preference` context event. No-ops silently when Minns is unavailable.
 *
 * @param text      - The text to store as a memory.
 * @param sessionId - Session identifier correlated with the memory (hashed internally).
 */
export async function saveUserContext(
  text: string,
  sessionId: string,
): Promise<void> {
  const client = await getMinnsClient();
  if (!client) return;

  const numericSession = simpleHash(sessionId);

  try {
    await client
      .event("openpaw", { sessionId: numericSession })
      .context(text, "user_preference")
      .semantic(true)
      .send();
  } catch {
    // Minns unavailable — silently continue
  }
}
