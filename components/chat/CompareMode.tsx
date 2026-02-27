"use client";

import { cn } from "@/lib/utils";
import { Markdown } from "./Markdown";
import { ALL_MODELS } from "@/lib/models/providers";
import { useCompareStore, type CompareResult } from "@/lib/store/compare";

interface CompareModeProps {
  onPickWinner: (result: CompareResult) => void;
}

function modelName(modelId: string): string {
  return ALL_MODELS.find((m) => m.id === modelId)?.name ?? modelId;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function SkeletonColumn() {
  return (
    <div className="glass-card p-4 flex flex-col gap-3 animate-pulse">
      <div className="h-5 w-32 rounded bg-white/10" />
      <div className="space-y-2 flex-1">
        <div className="h-3 w-full rounded bg-white/8" />
        <div className="h-3 w-5/6 rounded bg-white/8" />
        <div className="h-3 w-4/6 rounded bg-white/8" />
        <div className="h-3 w-full rounded bg-white/8" />
        <div className="h-3 w-3/6 rounded bg-white/8" />
      </div>
      <div className="h-8 rounded bg-white/5" />
    </div>
  );
}

function ResultColumn({
  result,
  onPick,
}: {
  result: CompareResult;
  onPick: () => void;
}) {
  return (
    <div className="glass-card p-4 flex flex-col gap-3 min-w-0">
      {/* Model name badge */}
      <div className="flex items-center gap-2">
        <span className="px-2 py-0.5 rounded-md bg-accent-cyan/10 border border-accent-cyan/20 text-accent-cyan text-xs font-medium truncate">
          {modelName(result.modelId)}
        </span>
      </div>

      {/* Response text */}
      <div className="flex-1 overflow-y-auto text-sm text-text-primary min-h-[120px] max-h-[60vh]">
        {result.error ? (
          <div className="text-error text-xs p-2 rounded-lg bg-error/10 border border-error/20">
            Error: {result.error}
          </div>
        ) : (
          <Markdown>{result.text}</Markdown>
        )}
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-3 text-[10px] text-text-muted border-t border-white/6 pt-2">
        <span title="Input tokens">⬆ {result.inputTokens.toLocaleString()}</span>
        <span title="Output tokens">⬇ {result.outputTokens.toLocaleString()}</span>
        <span title="Response time">⏱ {formatDuration(result.durationMs)}</span>
      </div>

      {/* Pick button */}
      {!result.error && (
        <button
          type="button"
          onClick={onPick}
          className={cn(
            "w-full py-2 text-xs font-medium rounded-lg transition-all cursor-pointer",
            "bg-accent-cyan/15 border border-accent-cyan/25 text-accent-cyan",
            "hover:bg-accent-cyan/25 hover:border-accent-cyan/40"
          )}
        >
          Use this response
        </button>
      )}
    </div>
  );
}

export function CompareMode({ onPickWinner }: CompareModeProps) {
  const { modelIds, results, isLoading, deactivate } = useCompareStore();
  const count = modelIds.length;

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 max-w-6xl mx-auto">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">
            Model Comparison
          </h2>
          <p className="text-xs text-text-muted mt-0.5">
            {isLoading
              ? "Generating responses…"
              : "Pick the best response to continue the conversation"}
          </p>
        </div>
        <button
          type="button"
          onClick={deactivate}
          className="px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors rounded-lg cursor-pointer"
        >
          Cancel
        </button>
      </div>

      {/* Grid */}
      <div
        className={cn(
          "max-w-6xl mx-auto gap-4",
          "grid",
          count === 2
            ? "grid-cols-1 md:grid-cols-2"
            : "grid-cols-1 md:grid-cols-3"
        )}
      >
        {isLoading
          ? modelIds.map((id) => <SkeletonColumn key={id} />)
          : results.map((result) => (
              <ResultColumn
                key={result.modelId}
                result={result}
                onPick={() => onPickWinner(result)}
              />
            ))}
      </div>
    </div>
  );
}
