"use client";

/**
 * @file Compare-mode store.
 *
 * Tracks whether side-by-side model comparison is active, which models are being
 * compared, and the results returned by `/api/chat/compare`. Not persisted:
 * comparisons are a transient view over the current message.
 */

import { create } from "zustand";

/** One model's answer in a comparison, or its failure. */
export interface CompareResult {
  modelId: string;
  text: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
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
 * Store for side-by-side model comparison.
 *
 * `activate` opens compare mode in its loading state, `setResults` fills in the
 * responses, and `deactivate` resets everything.
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
