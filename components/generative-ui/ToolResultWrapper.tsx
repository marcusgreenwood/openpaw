"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";

/**
 * Props for the ToolResultWrapper component.
 *
 * @property toolName - Tool identifier used to look up the icon (e.g. "executeBash")
 * @property summary - One-line description shown in the collapsed header
 * @property badge - Optional status badge displayed next to the summary
 * @property children - Full tool result content rendered when the accordion is expanded
 * @property defaultOpen - Whether the accordion starts in the open state (default: false)
 */
interface ToolResultWrapperProps {
  toolName: string;
  summary: string;
  badge?: { label: string; variant: "success" | "error" | "default" };
  children: React.ReactNode;
  defaultOpen?: boolean;
}

const TOOL_ICONS: Record<string, string> = {
  executeBash: "⌘",
  readFile: "◇",
  writeFile: "◆",
  listDirectory: "≡",
  createDirectory: "+",
  executeCode: "▷",
};

/**
 * Collapsible accordion wrapper for tool call results.
 * Always renders a compact summary header (tool icon + summary text + optional badge);
 * the full result content is revealed when the user clicks to expand.
 */
export function ToolResultWrapper({
  toolName,
  summary,
  badge,
  children,
  defaultOpen = false,
}: ToolResultWrapperProps) {
  const [open, setOpen] = useState(defaultOpen);
  const icon = TOOL_ICONS[toolName] ?? "•";

  return (
    <div className="my-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      {/* Compact summary header — always visible */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-white/[0.03] transition-colors cursor-pointer group"
      >
        {/* Chevron */}
        <span
          className={cn(
            "text-[10px] text-text-muted transition-transform duration-200",
            open && "rotate-90"
          )}
        >
          ▶
        </span>

        {/* Tool icon */}
        <span className="text-xs text-accent-cyan/70 font-mono">{icon}</span>

        {/* Summary text */}
        <span className="text-[13px] text-text-secondary truncate flex-1">
          {summary}
        </span>

        {/* Badge */}
        {badge && (
          <Badge variant={badge.variant}>{badge.label}</Badge>
        )}

        {/* Expand hint */}
        <span className="text-[11px] text-text-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          {open ? "collapse" : "expand"}
        </span>
      </button>

      {/* Expandable detail */}
      {open && (
        <div className="px-3 pb-3 border-t border-white/[0.04]">
          {children}
        </div>
      )}
    </div>
  );
}
