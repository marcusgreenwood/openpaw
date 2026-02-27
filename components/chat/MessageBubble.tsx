"use client";

import type { UIMessage } from "ai";
import { cn } from "@/lib/utils";
import { AssistantContent } from "@/components/chat/AssistantContent";
import { TerminalOutput } from "@/components/generative-ui/TerminalOutput";
import { LiveTerminal } from "@/components/generative-ui/LiveTerminal";
import { CodeBlock } from "@/components/generative-ui/CodeBlock";
import { FileTree } from "@/components/generative-ui/FileTree";
import { FileDiff } from "@/components/generative-ui/FileDiff";
import { ProcessStatus } from "@/components/generative-ui/ProcessStatus";
import { ToolResultWrapper } from "@/components/generative-ui/ToolResultWrapper";
import { MultipleChoice } from "@/components/generative-ui/MultipleChoice";
import { useSessionsStore } from "@/lib/store/sessions";

interface MessageBubbleProps {
  message: UIMessage;
  onChoiceSelect?: (option: string) => void;
  onFork?: (messageId: string) => void;
}

/** Build a short summary string + badge for the collapsed tool header */
function toolSummary(toolName: string, args: Record<string, unknown>, result: Record<string, unknown>) {
  switch (toolName) {
    case "executeBash": {
      const cmd = String(args.command ?? "").split("\n")[0].slice(0, 80);
      const exit = Number(result.exitCode ?? 0);
      return {
        summary: cmd || "bash",
        badge: {
          label: `exit ${exit}`,
          variant: exit === 0 ? "success" as const : "error" as const,
        },
      };
    }
    case "readFile":
      return {
        summary: `Read ${result.path ?? args.path ?? "file"}`,
        badge: { label: "read", variant: "default" as const },
      };
    case "writeFile":
      return {
        summary: `Wrote ${result.path ?? args.path ?? "file"}`,
        badge: { label: "write", variant: "success" as const },
      };
    case "listDirectory":
      return {
        summary: `Listed ${result.path ?? args.path ?? "directory"} (${Array.isArray(result.entries) ? result.entries.length : "?"} items)`,
        badge: { label: "ls", variant: "default" as const },
      };
    case "createDirectory":
      return {
        summary: `Created ${result.path ?? args.path ?? "directory"}`,
        badge: { label: "+dir", variant: "success" as const },
      };
    case "executeCode":
      return {
        summary: `Ran ${args.language ?? "code"}`,
        badge: {
          label: `exit ${result.exitCode ?? 0}`,
          variant: Number(result.exitCode ?? 0) === 0 ? "success" as const : "error" as const,
        },
      };
    default:
      return {
        summary: toolName,
        badge: { label: "done", variant: "default" as const },
      };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderToolPart(part: any, key: string, workspacePath: string, onChoiceSelect?: (option: string) => void) {
  const { type, state, input, output } = part;

  const toolName = typeof type === "string" && type.startsWith("tool-")
    ? type.slice(5)
    : null;

  if (!toolName) return null;

  // Still executing — show LiveTerminal for bash, ProcessStatus for others
  if (state === "input-streaming" || state === "input-available") {
    if (toolName === "executeBash" && input?.command) {
      return (
        <LiveTerminal
          key={key}
          command={String(input.command)}
          workspacePath={workspacePath}
          autoRun
        />
      );
    }
    return (
      <ProcessStatus
        key={key}
        tool={toolName}
        status="running"
        input={input}
      />
    );
  }

  // Error
  if (state === "output-error") {
    return (
      <ProcessStatus
        key={key}
        tool={toolName}
        status="error"
        error={part.errorText}
      />
    );
  }

  // Completed — render
  if (state === "output-available") {
    const result = output ?? {};
    const args = input ?? {};

    // askChoice: render inline MultipleChoice (no collapsible wrapper)
    if (toolName === "askChoice") {
      const question = String(result.question ?? "Choose an option");
      const options = Array.isArray(result.options) ? result.options.map(String) : [];
      if (options.length === 0) return null;
      return (
        <MultipleChoice
          key={key}
          question={question}
          options={options}
          onSelect={onChoiceSelect ?? (() => {})}
        />
      );
    }

    const { summary, badge } = toolSummary(toolName, args, result);
    let detail: React.ReactNode = null;

    if (toolName === "executeBash") {
      detail = (
        <TerminalOutput
          stdout={result.stdout ?? ""}
          stderr={result.stderr ?? ""}
          exitCode={result.exitCode ?? 0}
          durationMs={result.durationMs}
          command={args.command}
        />
      );
    } else if (toolName === "readFile") {
      detail = (
        <CodeBlock
          code={result.content ?? ""}
          filename={result.path}
        />
      );
    } else if (toolName === "writeFile") {
      detail = (
        <FileDiff
          path={result.path ?? args.path ?? "unknown"}
          before={result.previousContent ?? null}
          after={args.content ?? ""}
        />
      );
    } else if (toolName === "listDirectory") {
      detail = (
        <FileTree
          entries={result.entries ?? []}
          basePath={result.path}
        />
      );
    } else if (toolName === "createDirectory") {
      detail = (
        <div className="flex items-center gap-2 text-sm text-terminal-green py-2">
          <span className="font-mono text-xs">+</span>
          <span>Created directory: {result.path}</span>
        </div>
      );
    } else if (toolName === "executeCode") {
      detail = (
        <TerminalOutput
          stdout={result.stdout ?? ""}
          stderr={result.stderr ?? ""}
          exitCode={result.exitCode ?? 0}
          language={result.language ?? args.language}
        />
      );
    } else {
      // Unknown tool — show raw result
      detail = (
        <div className="text-xs text-text-muted">
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </div>
      );
    }

    return (
      <ToolResultWrapper
        key={key}
        toolName={toolName}
        summary={summary}
        badge={badge}
      >
        {detail}
      </ToolResultWrapper>
    );
  }

  return null;
}

export function MessageBubble({ message, onChoiceSelect, onFork }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div className={cn("group/msg relative flex mb-4", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "relative max-w-3xl max-[768px]:max-w-[85vw]",
          isUser ? "glass-bubble-user" : "glass-bubble-assistant"
        )}
      >
        {onFork && (
          <button
            onClick={() => onFork(message.id)}
            className="absolute -top-2 -right-2 z-10 opacity-0 group-hover/msg:opacity-100 transition-opacity p-1 rounded-md bg-surface-2/90 border border-white/[0.1] backdrop-blur-sm hover:bg-surface-2 hover:border-white/20 cursor-pointer shadow-lg"
            title="Fork conversation from here"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-text-secondary"
            >
              <line x1="6" y1="3" x2="6" y2="15" />
              <circle cx="18" cy="6" r="3" />
              <circle cx="6" cy="18" r="3" />
              <path d="M18 9a9 9 0 0 1-9 9" />
            </svg>
          </button>
        )}
        {message.parts.map((part, i) => {
          const key = `${message.id}-${i}`;

          // Text content
          if (part.type === "text") {
            if (!part.text) return null;

            // User messages: plain text. Assistant messages: rendered markdown.
            if (isUser) {
              return (
                <div
                  key={key}
                  className="text-sm leading-relaxed whitespace-pre-wrap break-words"
                >
                  {part.text}
                </div>
              );
            }

            return (
              <div
                key={key}
                className="text-sm leading-relaxed break-words prose-openpaw"
              >
                <AssistantContent>{part.text}</AssistantContent>
              </div>
            );
          }

          // Tool parts (type starts with "tool-")
          if (typeof part.type === "string" && part.type.startsWith("tool-")) {
            return renderToolPart(part, key, onChoiceSelect);
          }

          // Step start
          if (part.type === "step-start") {
            return null; // Hide step boundaries
          }

          return null;
        })}
      </div>
    </div>
  );
}
