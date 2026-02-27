"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useSessionsStore } from "@/lib/store/sessions";

interface GitData {
  isRepo: boolean;
  branch?: string;
  status?: "clean" | "dirty";
  modified?: string[];
  staged?: string[];
  untracked?: string[];
}

export function GitStatus() {
  const workspacePath = useSessionsStore((s) => s.workspacePath);
  const [data, setData] = useState<GitData | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const fetchStatus = useCallback(() => {
    if (!workspacePath) {
      setData(null);
      return;
    }
    fetch(`/api/git?workspace=${encodeURIComponent(workspacePath)}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setData(null));
  }, [workspacePath]);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  if (!data?.isRepo) return null;

  const dirtyCount =
    (data.modified?.length ?? 0) +
    (data.untracked?.length ?? 0);
  const isClean = data.status === "clean";

  return (
    <div className="relative">
      <button
        onClick={() => setShowDetails(!showDetails)}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors cursor-pointer",
          "hover:bg-white/5",
          isClean ? "text-terminal-green" : "text-warning"
        )}
      >
        {/* Git branch icon */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0"
        >
          <line x1="6" y1="3" x2="6" y2="15" />
          <circle cx="18" cy="6" r="3" />
          <circle cx="6" cy="18" r="3" />
          <path d="M18 9a9 9 0 0 1-9 9" />
        </svg>
        <span className="font-mono truncate">{data.branch}</span>
        {!isClean && (
          <>
            <span className="text-text-muted">·</span>
            <span className="font-mono">
              {dirtyCount} modified
            </span>
          </>
        )}
        {(data.staged?.length ?? 0) > 0 && (
          <span className="ml-auto px-1.5 py-0.5 rounded bg-accent-cyan/15 text-accent-cyan text-[10px] font-mono">
            {data.staged!.length} staged
          </span>
        )}
      </button>

      {showDetails && (
        <div className="absolute bottom-full left-0 right-0 mb-2 bg-bg-overlay border border-white/10 rounded-xl p-3 z-50 shadow-xl shadow-black/30 max-h-48 overflow-y-auto">
          <div className="text-[10px] uppercase tracking-wider text-text-muted mb-2">
            Git Status
          </div>

          {isClean && (
            <p className="text-xs text-terminal-green">Working tree clean</p>
          )}

          {(data.staged?.length ?? 0) > 0 && (
            <div className="mb-2">
              <div className="text-[10px] text-accent-cyan mb-1 font-medium">
                Staged ({data.staged!.length})
              </div>
              {data.staged!.map((f) => (
                <div key={`s-${f}`} className="text-[11px] text-text-secondary font-mono truncate">
                  {f}
                </div>
              ))}
            </div>
          )}

          {(data.modified?.length ?? 0) > 0 && (
            <div className="mb-2">
              <div className="text-[10px] text-warning mb-1 font-medium">
                Modified ({data.modified!.length})
              </div>
              {data.modified!.map((f) => (
                <div key={`m-${f}`} className="text-[11px] text-text-secondary font-mono truncate">
                  {f}
                </div>
              ))}
            </div>
          )}

          {(data.untracked?.length ?? 0) > 0 && (
            <div>
              <div className="text-[10px] text-text-muted mb-1 font-medium">
                Untracked ({data.untracked!.length})
              </div>
              {data.untracked!.map((f) => (
                <div key={`u-${f}`} className="text-[11px] text-text-secondary font-mono truncate">
                  {f}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
