"use client";

import { cn } from "@/lib/utils";

interface ProcessStatusProps {
  tool: string;
  status: "running" | "error";
  input?: Record<string, unknown>;
  error?: string;
}

const TOOL_LABELS: Record<string, string> = {
  executeBash: "Running command",
  readFile: "Reading file",
  writeFile: "Writing file",
  listDirectory: "Listing directory",
  createDirectory: "Creating directory",
  executeCode: "Executing code",
};

const TOOL_ICONS: Record<string, string> = {
  executeBash: "$",
  readFile: ">",
  writeFile: "+",
  listDirectory: "#",
  createDirectory: "+",
  executeCode: ">",
};

export function ProcessStatus({ tool, status, input, error }: ProcessStatusProps) {
  const label = TOOL_LABELS[tool] ?? tool;
  const icon = TOOL_ICONS[tool] ?? ">";

  if (status === "error") {
    return (
      <div className="flex items-center gap-2 text-terminal-red text-sm py-2 px-3 my-1 rounded-lg bg-red-500/5 border border-red-500/10">
        <span className="font-mono text-xs">x</span>
        <span>
          {label} failed{error ? `: ${error}` : ""}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 text-text-secondary text-sm py-2 px-3 my-1 rounded-lg bg-white/[0.02] border border-white/5">
      <div className="w-4 h-4 border-2 border-accent-cyan/50 border-t-transparent rounded-full animate-spin shrink-0" />
      <span className="font-mono text-accent-cyan/70 text-xs">{icon}</span>
      <span>{label}</span>
      {input && "command" in input && (
        <code className={cn(
          "text-text-muted text-xs font-mono ml-auto truncate max-w-[200px] md:max-w-xs"
        )}>
          {String(input.command)}
        </code>
      )}
      {input && "path" in input && !("command" in input) && (
        <code className="text-text-muted text-xs font-mono ml-auto">
          {String(input.path)}
        </code>
      )}
      {input && "language" in input && (
        <code className="text-text-muted text-xs font-mono ml-auto">
          {String(input.language)}
        </code>
      )}
    </div>
  );
}
