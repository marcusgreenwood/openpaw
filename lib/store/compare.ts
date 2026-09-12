/**
 * Store for Compare mode, which answers one prompt with several models side by side.
 *
 * Not persisted: comparisons are per-visit and are discarded on reload.
 */

"use client";

import { create } from "zustand";

/** One model's answer in a comparison. */
export interface CompareResult {
  /** The model that produced this result. */
  modelId: string;
  /** The generated text; empty when `error` is set. */
  text: string;
  /** Prompt tokens consumed. */
  inputTokens: number;
  /** Completion tokens produced. */
  outputTokens: number;
  /** Wall-clock duration in milliseconds. */
  durationMs: number;
  /** Failure message if this model errored or timed out; other models still return. */
  error?: string;
}

interface CompareState {
  active: boolean;
  modelIds: string[];
  results: CompareResult[];
  isLoading: boolean;
  activate: (modelIds: string[]) => void;
  setResults: (results: CompareResult[]) => void;
  deactivate: () => void;
}

/**
 * Compare-mode state.
 *
 * `activate(modelIds)` opens the compare panel and marks it loading; `setResults(results)`
 * fills in the answers and clears the loading flag; `deactivate()` closes the panel and
 * resets everything.
 */
export const useCompareStore = create<CompareState>()((set) => ({
  active: false,
  modelIds: [],
  results: [],
  isLoading: false,

  activate: (modelIds: string[]) =>
    set({ active: true, modelIds, results: [], isLoading: true }),

  setResults: (results: CompareResult[]) =>
    set({ results, isLoading: false }),

  deactivate: () =>
    set({ active: false, modelIds: [], results: [], isLoading: false }),
}));
