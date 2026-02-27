"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import { useLiveTerminal, type TerminalLine } from "@/lib/hooks/useLiveTerminal";

interface LiveTerminalProps {
  command: string;
  workspacePath: string;
  autoRun?: boolean;
  onComplete?: (exitCode: number, output: TerminalLine[]) => void;
}

function highlightLine(text: string, type: TerminalLine["type"]) {
  if (type === "system") return "text-white/40";
  if (type === "stderr") return "text-red-400";

  if (/\berror\b/i.test(text)) return "text-red-400";
  if (/\bwarn(ing)?\b/i.test(text)) return "text-yellow-400";
  if (/\b(success|done|passed|complete(d)?|ok)\b/i.test(text))
    return "text-green-400";

  return "text-gray-200";
}

export function LiveTerminal({
  command,
  workspacePath,
  autoRun = true,
  onComplete,
}: LiveTerminalProps) {
  const { output, isRunning, exitCode, durationMs, run, stop } =
    useLiveTerminal();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [userScrolled, setUserScrolled] = useState(false);
  const didRun = useRef(false);
  const didNotify = useRef(false);

  useEffect(() => {
    if (autoRun && !didRun.current) {
      didRun.current = true;
      run(command, workspacePath);
    }
  }, [autoRun, command, workspacePath, run]);

  useEffect(() => {
    if (!isRunning && exitCode !== null && onComplete && !didNotify.current) {
      didNotify.current = true;
      onComplete(exitCode, output);
    }
  }, [isRunning, exitCode, output, onComplete]);

  // Auto-scroll
  useEffect(() => {
    if (!userScrolled && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [output, userScrolled]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setUserScrolled(!atBottom);
  }

  const shortCmd = command.split("\n")[0].slice(0, 60);

  return (
    <div className="my-2 bg-[#0d0d0f] border border-white/[0.06] rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.06]">
        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="text-[10px] text-white/40 hover:text-white/70 transition-colors cursor-pointer shrink-0"
        >
          <span
            className={cn(
              "inline-block transition-transform duration-200",
              !collapsed && "rotate-90"
            )}
          >
            ▶
          </span>
        </button>

        {/* Running indicator */}
        {isRunning && (
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
        )}

        {/* Command name */}
        <code className="text-xs text-white/60 font-mono truncate flex-1">
          {shortCmd}
        </code>

        {/* Duration */}
        {durationMs !== null && (
          <span className="text-[11px] text-white/30 font-mono shrink-0">
            {durationMs < 1000
              ? `${durationMs}ms`
              : `${(durationMs / 1000).toFixed(1)}s`}
          </span>
        )}

        {/* Exit badge */}
        {!isRunning && exitCode !== null && (
          <Badge variant={exitCode === 0 ? "success" : "error"}>
            exit {exitCode}
          </Badge>
        )}

        {/* Stop button */}
        {isRunning && (
          <button
            onClick={stop}
            className="text-[11px] px-2 py-0.5 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors cursor-pointer shrink-0 font-mono"
          >
            Stop
          </button>
        )}
      </div>

      {/* Output area */}
      {!collapsed && (
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="max-h-[300px] overflow-y-auto p-3 font-mono text-[13px] leading-5 scrollbar-thin"
        >
          {output.map((line, i) => (
            <div key={i} className="flex gap-2 min-w-0">
              <span className="text-white/20 text-[11px] select-none shrink-0 w-16 text-right tabular-nums">
                {formatTimestamp(line.timestamp)}
              </span>
              <span
                className={cn(
                  "whitespace-pre-wrap break-all flex-1",
                  highlightLine(line.text, line.type)
                )}
              >
                {line.text}
              </span>
            </div>
          ))}
          {output.length === 0 && isRunning && (
            <span className="text-white/30 text-xs italic">
              Waiting for output...
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function formatTimestamp(ts: number) {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}
