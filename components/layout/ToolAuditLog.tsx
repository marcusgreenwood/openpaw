"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useAuditLogStore, type AuditLogEntry } from "@/lib/store/audit-log";

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + "…";
}

function StatusBadge({ status }: { status: AuditLogEntry["status"] }) {
  const styles = {
    approved: "bg-green-500/10 text-green-400",
    denied: "bg-red-500/10 text-red-400",
    auto: "bg-white/6 text-text-secondary",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium",
        styles[status]
      )}
    >
      {status}
    </span>
  );
}

function EntryRow({
  entry,
  isExpanded,
  onToggle,
}: {
  entry: AuditLogEntry;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const paramPreview = truncate(JSON.stringify(entry.parameters), 60);
  const resultPreview = entry.result ? truncate(entry.result, 60) : "—";

  return (
    <div className="border-b border-white/5 last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full text-left px-3 py-2.5 hover:bg-white/3 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] text-text-muted font-mono">
            {formatTimestamp(entry.timestamp)}
          </span>
          <span className="text-xs font-mono text-text-primary font-medium">
            {entry.toolName}
          </span>
          <StatusBadge status={entry.status} />
          {entry.durationMs !== undefined && (
            <span className="text-[10px] text-text-muted font-mono ml-auto">
              {entry.durationMs}ms
            </span>
          )}
        </div>
        {!isExpanded && (
          <p className="text-[11px] text-text-muted font-mono truncate">
            {paramPreview}
          </p>
        )}
      </button>

      {isExpanded && (
        <div className="px-3 pb-3 space-y-2">
          <div>
            <span className="text-[10px] text-text-muted block mb-1">
              Parameters
            </span>
            <pre className="text-[11px] font-mono text-text-secondary bg-white/5 rounded-lg p-2.5 overflow-x-auto max-h-40 overflow-y-auto">
              {JSON.stringify(entry.parameters, null, 2)}
            </pre>
          </div>
          {entry.result && (
            <div>
              <span className="text-[10px] text-text-muted block mb-1">
                Result
              </span>
              <pre className="text-[11px] font-mono text-text-secondary bg-white/5 rounded-lg p-2.5 overflow-x-auto max-h-40 overflow-y-auto">
                {resultPreview}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ToolAuditLog() {
  const { entries, clearEntries } = useAuditLogStore();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/8">
        <span className="text-xs font-medium text-text-secondary">
          Tool Audit Log
        </span>
        {entries.length > 0 && (
          <button
            onClick={clearEntries}
            className="text-[10px] text-text-muted hover:text-error transition-colors cursor-pointer"
          >
            Clear
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 px-4">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="text-text-muted mb-2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
            <p className="text-xs text-text-muted text-center">
              No tool executions yet.
              <br />
              Tool calls will appear here.
            </p>
          </div>
        ) : (
          entries.map((entry) => (
            <EntryRow
              key={entry.id}
              entry={entry}
              isExpanded={expandedId === entry.id}
              onToggle={() =>
                setExpandedId(expandedId === entry.id ? null : entry.id)
              }
            />
          ))
        )}
      </div>
    </div>
  );
}
