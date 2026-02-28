"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";
import type { FileAttachment } from "@/lib/hooks/useFileAttachments";

interface FileChipsProps {
  files: FileAttachment[];
  onRemove: (id: string) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function FileChips({ files, onRemove }: FileChipsProps) {
  if (files.length === 0) return null;

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
      {files.map((file) => (
        <div
          key={file.id}
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-lg shrink-0",
            "bg-white/5 border border-white/8",
            "text-text-secondary text-xs group"
          )}
        >
          {file.type === "image" ? (
            <Image
              src={file.content}
              alt={file.name}
              width={24}
              height={24}
              unoptimized
              className="rounded object-cover shrink-0"
            />
          ) : (
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0 text-accent-cyan/70"
            >
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
          )}

          <span className="truncate max-w-[120px]">{file.name}</span>
          <span className="text-text-muted">{formatSize(file.size)}</span>

          <button
            type="button"
            onClick={() => onRemove(file.id)}
            className={cn(
              "shrink-0 w-4 h-4 flex items-center justify-center rounded",
              "text-text-muted hover:text-text-primary hover:bg-white/10",
              "opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            )}
            title={`Remove ${file.name}`}
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
