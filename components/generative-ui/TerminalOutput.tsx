"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";

/**
 * Props for the TerminalOutput component.
 *
 * @property stdout - Captured standard output from the process
 * @property stderr - Captured standard error from the process
 * @property exitCode - Process exit code (0 = success, non-zero = failure)
 * @property durationMs - Optional execution duration shown next to the exit badge
 * @property language - Language label shown in the header (default: "bash")
 * @property command - Optional command string shown inline for context
 */
interface TerminalOutputProps {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs?: number;
  language?: string;
  command?: string;
}

/**
 * Renders the output of a shell command or code execution. Shows stdout in
 * primary text, stderr in red (on failure) or muted (on success), and an exit
 * code badge. Falls back to an italic "No output" message when both streams
 * are empty.
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
