"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";

/**
 * Props for the CodeBlock component.
 *
 * @property code - Raw source code string to display
 * @property language - Explicit language label; auto-detected from filename when omitted
 * @property filename - Optional filename shown in the header and used for language detection
 */
interface CodeBlockProps {
  code: string;
  language?: string;
  filename?: string;
}

function detectLanguage(filename?: string): string {
  if (!filename) return "text";
  const ext = filename.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    rs: "rust",
    go: "go",
    rb: "ruby",
    java: "java",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    md: "markdown",
    css: "css",
    html: "html",
    sh: "bash",
    bash: "bash",
    sql: "sql",
    toml: "toml",
  };
  return map[ext ?? ""] ?? "text";
}

/**
 * Renders a syntax-highlighted code block with an optional filename header and
 * a one-click copy button. Language is auto-detected from the file extension
 * when not explicitly provided.
 */
export function CodeBlock({ code, language, filename }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const lang = language ?? detectLanguage(filename);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-2 rounded-lg overflow-hidden border border-white/6 bg-terminal-bg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-white/[0.02] border-b border-white/6">
        <div className="flex items-center gap-2">
          {filename && (
            <span className="text-xs font-mono text-text-secondary">
              {filename}
            </span>
          )}
          <Badge variant="default">{lang}</Badge>
        </div>
        <button
          onClick={handleCopy}
          className={cn(
            "text-[11px] font-mono px-2 py-1 rounded transition-colors cursor-pointer",
            copied
              ? "text-terminal-green bg-green-500/10"
              : "text-text-muted hover:text-text-secondary hover:bg-white/5"
          )}
        >
          {copied ? "copied" : "copy"}
        </button>
      </div>

      {/* Code */}
      <pre className="p-4 overflow-x-auto text-[13px] leading-relaxed">
        <code className="text-text-primary font-mono">{code}</code>
      </pre>
    </div>
  );
}
