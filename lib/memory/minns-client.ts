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

export async function getMinnsClient(): Promise<MinnsClient | null> {
  if (_configLoaded) return _client;
  _configLoaded = true;

  const config = await loadConfig();
  if (!config) return null;

  _client = createClient(config.apiKey, { agentId: DEFAULT_AGENT_ID });
  return _client;
}

export async function isMemoryEnabled(): Promise<boolean> {
  const client = await getMinnsClient();
  return client !== null;
}

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
