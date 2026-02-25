"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";

interface FileDiffProps {
  path: string;
  before: string | null;
  after: string;
}

export function FileDiff({ path, before, after }: FileDiffProps) {
  const isNew = before === null;
  const beforeLines = before?.split("\n") ?? [];
  const afterLines = after.split("\n");

  return (
    <div className="my-2 rounded-lg overflow-hidden border border-white/6 bg-terminal-bg">
      <div className="flex items-center justify-between px-4 py-2 bg-white/[0.02] border-b border-white/6">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-text-secondary">{path}</span>
          <Badge variant={isNew ? "success" : "cyan"}>
            {isNew ? "created" : "modified"}
          </Badge>
        </div>
        <span className="text-[11px] text-text-muted">
          {isNew
            ? `+${afterLines.length} lines`
            : `${beforeLines.length} → ${afterLines.length} lines`}
        </span>
      </div>

      <div className="p-2 overflow-x-auto max-h-[400px] overflow-y-auto">
        {isNew ? (
          // New file — show all lines as additions
          afterLines.map((line, i) => (
            <div
              key={i}
              className="flex items-start gap-2 px-2 py-0.5 font-mono text-[13px]"
            >
              <span className="text-terminal-green w-4 shrink-0 text-right select-none">
                +
              </span>
              <span className="text-terminal-green/80 whitespace-pre-wrap break-all">
                {line || " "}
              </span>
            </div>
          ))
        ) : (
          // Modified file — simplified view showing new content
          <>
            <div className="text-text-muted text-xs px-2 py-1 mb-1">
              New content:
            </div>
            {afterLines.map((line, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-start gap-2 px-2 py-0.5 font-mono text-[13px]"
                )}
              >
                <span className="text-text-muted w-6 shrink-0 text-right select-none text-[11px]">
                  {i + 1}
                </span>
                <span className="text-text-primary/80 whitespace-pre-wrap break-all">
                  {line || " "}
                </span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
