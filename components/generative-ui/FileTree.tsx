"use client";

import { cn } from "@/lib/utils";

/** A single entry in the file tree. */
interface FileEntry {
  name: string;
  type: "file" | "directory";
  path: string;
}

/**
 * Props for the FileTree component.
 *
 * @property entries - List of files and directories to render
 * @property basePath - Optional root path label shown above the tree
 */
interface FileTreeProps {
  entries: FileEntry[];
  basePath?: string;
}

/**
 * Renders a sorted file/directory listing in a terminal-style card.
 * Directories are sorted before files and displayed in accent-cyan;
 * an "Empty directory" message is shown when `entries` is empty.
 */
export function FileTree({ entries, basePath }: FileTreeProps) {
  const sorted = [...entries].sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="my-2 rounded-lg overflow-hidden border border-white/6 bg-terminal-bg">
      {basePath && (
        <div className="px-4 py-2 bg-white/[0.02] border-b border-white/6">
          <span className="text-xs font-mono text-text-muted">{basePath}/</span>
        </div>
      )}
      <div className="p-2">
        {sorted.map((entry) => (
          <div
            key={entry.path}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded text-sm font-mono",
              "hover:bg-white/[0.03] transition-colors"
            )}
          >
            <span
              className={cn(
                "text-xs w-4 text-center",
                entry.type === "directory"
                  ? "text-accent-cyan"
                  : "text-text-muted"
              )}
            >
              {entry.type === "directory" ? "/" : " "}
            </span>
            <span
              className={cn(
                entry.type === "directory"
                  ? "text-accent-cyan"
                  : "text-text-secondary"
              )}
            >
              {entry.name}
            </span>
          </div>
        ))}
        {entries.length === 0 && (
          <span className="text-text-muted text-xs italic px-3 py-2">
            Empty directory
          </span>
        )}
      </div>
    </div>
  );
}
