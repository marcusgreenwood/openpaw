"use client";

import { useState, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";

interface FileDropZoneProps {
  onDrop: (files: FileList) => void;
  children: React.ReactNode;
}

export function FileDropZone({ onDrop, children }: FileDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dragCountRef = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCountRef.current += 1;
    if (e.dataTransfer?.types?.includes("Files")) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCountRef.current -= 1;
    if (dragCountRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCountRef.current = 0;
      setIsDragging(false);

      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        onDrop(files);
      }
    },
    [onDrop]
  );

  return (
    <div
      className="relative flex flex-col h-full"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {children}

      <div
        className={cn(
          "absolute inset-0 z-50 flex items-center justify-center",
          "bg-accent-cyan/5 border-2 border-dashed border-accent-cyan/30 rounded-xl",
          "transition-opacity duration-200 pointer-events-none",
          isDragging ? "opacity-100" : "opacity-0"
        )}
      >
        <div className="flex flex-col items-center gap-3 text-accent-cyan/70">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="12" y1="18" x2="12" y2="12" />
            <line x1="9" y1="15" x2="12" y2="12" />
            <line x1="15" y1="15" x2="12" y2="12" />
          </svg>
          <span className="text-sm font-medium">Drop files to add context</span>
        </div>
      </div>
    </div>
  );
}
