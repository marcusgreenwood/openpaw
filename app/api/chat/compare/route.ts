import { generateText, type UIMessage, convertToModelMessages } from "ai";
import { resolveModel, PROVIDER_REGISTRY } from "@/lib/models/providers";
import { ensureApiKeysLoaded, getApiKey } from "@/lib/chat/api-keys-store";
import { buildSystemPrompt } from "@/lib/system-prompt";
import { getSkills } from "@/lib/skills/manager";
import { DEFAULT_WORKSPACE } from "@/lib/chat/config";
import * as path from "node:path";
import { mkdir } from "node:fs/promises";

export const runtime = "nodejs";
export const maxDuration = 60;

const COMPARE_TIMEOUT_MS = 30_000;

interface CompareRequest {
  messages: UIMessage[];
  modelIds: string[];
  workspacePath?: string;
  sessionId?: string;
}

interface CompareResultItem {
  modelId: string;
  text: string;
  usage: { inputTokens: number; outputTokens: number };
  durationMs: number;
  error?: string;
}

export async function POST(req: Request) {
  const body = (await req.json()) as CompareRequest;
  const { messages, modelIds, workspacePath } = body;

  if (!Array.isArray(modelIds) || modelIds.length < 2 || modelIds.length > 3) {
    return Response.json(
      { error: "modelIds must contain 2 or 3 model IDs" },
      { status: 400 }
    );
  }

  const projectRoot = process.cwd();
  const raw = (workspacePath || "").trim() || DEFAULT_WORKSPACE;
  let workspace = path.isAbsolute(raw)
    ? path.resolve(raw)
    : path.resolve(projectRoot, raw);
  if (path.resolve(workspace) === path.resolve(projectRoot)) {
    workspace = path.join(projectRoot, "workspace");
  }
  await mkdir(workspace, { recursive: true }).catch(() => {});

  await ensureApiKeysLoaded();
  const apiKeys: Record<string, string> = {};
  for (const p of Object.keys(PROVIDER_REGISTRY)) {
    const k = getApiKey(p);
    if (k) apiKeys[p] = k;
  }

  const skills = await getSkills(workspace);
  const systemPrompt = await buildSystemPrompt(skills, workspace);
  const modelMessages = await convertToModelMessages(
    Array.isArray(messages) ? messages : []
  );

  const promises = modelIds.map(async (modelId): Promise<CompareResultItem> => {
    const start = Date.now();
    try {
      const model = resolveModel(modelId, apiKeys);
      const result = await Promise.race([
        generateText({
          model,
          system: systemPrompt,
          messages: modelMessages,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Timeout after ${COMPARE_TIMEOUT_MS}ms`)),
            COMPARE_TIMEOUT_MS
          )
        ),
      ]);

      return {
        modelId,
        text: result.text || "(no response)",
        usage: {
          inputTokens: result.usage?.inputTokens ?? 0,
          outputTokens: result.usage?.outputTokens ?? 0,
        },
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        modelId,
        text: "",
        usage: { inputTokens: 0, outputTokens: 0 },
        durationMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

  const settled = await Promise.allSettled(promises);
  const results: CompareResultItem[] = settled.map((s) =>
    s.status === "fulfilled"
      ? s.value
      : {
          modelId: "unknown",
          text: "",
          usage: { inputTokens: 0, outputTokens: 0 },
          durationMs: 0,
          error: s.reason instanceof Error ? s.reason.message : String(s.reason),
        }
  );

  return Response.json(results);
}
