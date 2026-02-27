"use client";

import { create } from "zustand";

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
