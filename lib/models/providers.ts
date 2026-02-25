import type { ModelConfig } from "@/types";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createMoonshotAI } from "@ai-sdk/moonshotai";

export const PROVIDER_REGISTRY: Record<string, ModelConfig[]> = {
  anthropic: [
    {
      id: "anthropic/claude-opus-4-6",
      name: "Claude Opus 4.6",
      provider: "anthropic",
      contextWindow: 200_000,
    },
    {
      id: "anthropic/claude-sonnet-4-6",
      name: "Claude Sonnet 4.6",
      provider: "anthropic",
      contextWindow: 200_000,
    },
    {
      id: "anthropic/claude-haiku-4-5",
      name: "Claude Haiku 4.5",
      provider: "anthropic",
      contextWindow: 200_000,
    },
  ],
  openai: [
    {
      id: "openai/gpt-5.2",
      name: "GPT-5.2",
      provider: "openai",
      contextWindow: 128_000,
    },
    {
      id: "openai/gpt-5-mini",
      name: "GPT-5 Mini",
      provider: "openai",
      contextWindow: 128_000,
    },
    {
      id: "openai/gpt-5-nano",
      name: "GPT-5 Nano",
      provider: "openai",
      contextWindow: 128_000,
    },
    {
      id: "openai/gpt-4.1",
      name: "GPT-4.1",
      provider: "openai",
      contextWindow: 128_000,
    },
  ],
  google: [
    {
      id: "google/gemini-3.1-pro-preview",
      name: "Gemini 3.1 Pro",
      provider: "google",
      contextWindow: 1_000_000,
    },
    {
      id: "google/gemini-3-pro-preview",
      name: "Gemini 3 Pro",
      provider: "google",
      contextWindow: 1_000_000,
    },
    {
      id: "google/gemini-3-flash-preview",
      name: "Gemini 3 Flash",
      provider: "google",
      contextWindow: 1_000_000,
    },
    {
      id: "google/gemini-2.5-pro",
      name: "Gemini 2.5 Pro",
      provider: "google",
      contextWindow: 1_000_000,
    },
    {
      id: "google/gemini-2.5-flash",
      name: "Gemini 2.5 Flash",
      provider: "google",
      contextWindow: 1_000_000,
    },
  ],
  moonshotai: [
    {
      id: "moonshotai/kimi-k2.5",
      name: "Kimi K2.5",
      provider: "moonshotai",
      contextWindow: 262_000,
    },
    {
      id: "moonshotai/kimi-k2-turbo-preview",
      name: "Kimi K2 Turbo",
      provider: "moonshotai",
      contextWindow: 128_000,
    },
    {
      id: "moonshotai/kimi-k2-thinking",
      name: "Kimi K2 Thinking",
      provider: "moonshotai",
      contextWindow: 256_000,
    },
  ],
};

export const ALL_MODELS = Object.values(PROVIDER_REGISTRY).flat();
export const DEFAULT_MODEL_ID = "anthropic/claude-sonnet-4-6";

export type ApiKeys = Record<string, string>;

export function resolveModel(
  modelId: string,
  apiKeys?: ApiKeys
): ReturnType<ReturnType<typeof createAnthropic>> {
  const [provider, ...nameParts] = modelId.split("/");
  const name = nameParts.join("/");
  const apiKey = apiKeys?.[provider];

  switch (provider) {
    case "anthropic":
      return createAnthropic(apiKey ? { apiKey } : undefined)(name);
    case "openai":
      return createOpenAI(apiKey ? { apiKey } : undefined)(name);
    case "google":
      return createGoogleGenerativeAI(apiKey ? { apiKey } : undefined)(name);
    case "moonshotai":
      return createMoonshotAI(apiKey ? { apiKey } : undefined)(name);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
