"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useAuditLogStore } from "@/lib/store/audit-log";

interface ToolApprovalProps {
  toolName: string;
  parameters: Record<string, unknown>;
  onApprove: () => void;
  onDeny: () => void;
}

export function ToolApproval({
  toolName,
  parameters,
  onApprove,
  onDeny,
}: ToolApprovalProps) {
  const [alwaysAllow, setAlwaysAllow] = useState(false);
  const addEntry = useAuditLogStore((s) => s.addEntry);

  const handleApprove = () => {
    addEntry({
      timestamp: Date.now(),
      toolName,
      parameters,
      status: "approved",
    });
    onApprove();
  };

  const handleDeny = () => {
    addEntry({
      timestamp: Date.now(),
      toolName,
      parameters,
      status: "denied",
    });
    onDeny();
  };

  return (
    <div
      className={cn(
        "glass-card p-4 my-3 max-w-2xl",
        "border-amber-500/40"
      )}
      style={{ borderColor: "rgba(245, 158, 11, 0.4)" }}
    >
      <div className="flex items-center gap-2 mb-3">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-amber-400 shrink-0"
        >
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <span className="text-sm font-semibold text-amber-400">
          Tool Approval Required
        </span>
      </div>

      <div className="space-y-2 mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">Tool:</span>
          <span className="text-sm font-mono text-text-primary">{toolName}</span>
        </div>
        <div>
          <span className="text-xs text-text-muted block mb-1">Parameters:</span>
          <pre className="text-xs font-mono text-text-secondary bg-white/5 rounded-lg p-3 overflow-x-auto max-h-48 overflow-y-auto">
            {JSON.stringify(parameters, null, 2)}
          </pre>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleApprove}
          className={cn(
            "h-8 px-4 rounded-lg text-xs font-medium transition-all cursor-pointer",
            "bg-green-500/20 border border-green-500/30 text-green-400 hover:bg-green-500/30"
          )}
        >
          Approve
        </button>
        <button
          onClick={handleDeny}
          className={cn(
            "h-8 px-4 rounded-lg text-xs font-medium transition-all cursor-pointer",
            "bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30"
          )}
        >
          Deny
        </button>
        <label className="flex items-center gap-2 ml-auto cursor-pointer">
          <input
            type="checkbox"
            checked={alwaysAllow}
            onChange={(e) => setAlwaysAllow(e.target.checked)}
            className="w-3.5 h-3.5 rounded border border-white/20 bg-white/5 accent-amber-400"
          />
          <span className="text-[11px] text-text-muted">
            Always allow {toolName}
          </span>
        </label>
      </div>
    </div>
  );
}
