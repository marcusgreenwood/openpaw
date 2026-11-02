"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";

interface TerminalOutputProps {
  stdout: string;
  stderr: string;
  exitCode: number;
  /** Run time in milliseconds; shown as ms below one second, otherwise as seconds. */
  durationMs?: number;
  /** Label shown in the header. Defaults to "bash". */
  language?: string;
  command?: string;
}

/**
 * Final stdout/stderr and exit-code badge for a completed executeBash or executeCode call.
 * Replaces LiveTerminal once an executeBash call reaches output-available.
 */
export function TerminalOutput({
  stdout,
  stderr,
  exitCode,
  durationMs,
  language,
  command,
}: TerminalOutputProps) {
  const success = exitCode === 0;

  return (
    <div className="terminal-block my-2 w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 pb-2 border-b border-white/5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-text-muted uppercase tracking-wider">
            {language ?? "bash"}
          </span>
          {command && (
            <code className="text-xs text-text-secondary whitespace-pre-wrap break-all block max-w-full overflow-x-auto">
              {command}
            </code>
          )}
        </div>
        <div className="flex items-center gap-2">
          {durationMs !== undefined && (
            <span className="text-[11px] text-text-muted">
              {durationMs < 1000
                ? `${durationMs}ms`
                : `${(durationMs / 1000).toFixed(1)}s`}
            </span>
          )}
          <Badge variant={success ? "success" : "error"}>
            exit {exitCode}
          </Badge>
        </div>
      </div>

      {/* Output */}
      {stdout && (
        <pre className="text-text-primary whitespace-pre-wrap break-all text-[13px]">
          {stdout}
        </pre>
      )}
      {stderr && (
        <pre
          className={cn(
            "whitespace-pre-wrap break-all text-[13px]",
            stdout && "mt-2 pt-2 border-t border-white/5",
            success ? "text-text-secondary" : "text-terminal-red"
          )}
        >
          {stderr}
        </pre>
      )}
      {!stdout && !stderr && (
        <span className="text-text-muted text-xs italic">No output</span>
      )}
    </div>
  );
}
