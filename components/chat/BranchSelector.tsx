"use client";

import { useState, useRef, useEffect } from "react";
import {
  useBranchStore,
  type ConversationBranch,
} from "@/lib/store/branches";

interface BranchSelectorProps {
  sessionId: string;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function BranchSelector({ sessionId }: BranchSelectorProps) {
  const branches = useBranchStore((s) => s.branches[sessionId] ?? []);
  const activeBranchId = useBranchStore(
    (s) => s.activeBranch[sessionId] ?? null
  );
  const switchBranch = useBranchStore((s) => s.switchBranch);
  const deleteBranch = useBranchStore((s) => s.deleteBranch);

  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  if (branches.length === 0) return null;

  const activeBranch = branches.find((b) => b.id === activeBranchId);
  const currentLabel = activeBranch ? activeBranch.name : "Main";

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-white/[0.06]">
      <span className="text-xs text-text-secondary select-none">🌿</span>

      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-text-primary bg-surface-2/60 border border-white/[0.08] hover:bg-surface-2 transition-colors cursor-pointer"
        >
          <span className="truncate max-w-[140px]">{currentLabel}</span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform ${open ? "rotate-180" : ""}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {open && (
          <div className="absolute left-0 top-full mt-1 z-50 min-w-[220px] rounded-lg bg-surface-1/95 border border-white/[0.1] backdrop-blur-xl shadow-2xl overflow-hidden">
            {/* Main branch */}
            <button
              onClick={() => {
                switchBranch(sessionId, null);
                setOpen(false);
              }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors cursor-pointer ${
                activeBranchId === null
                  ? "bg-accent-cyan/10 text-accent-cyan"
                  : "text-text-secondary hover:bg-white/[0.04] hover:text-text-primary"
              }`}
            >
              <span className="font-medium truncate flex-1">Main</span>
              {activeBranchId === null && (
                <span className="text-[10px] text-accent-cyan/70">active</span>
              )}
            </button>

            {branches.map((branch) => (
              <BranchItem
                key={branch.id}
                branch={branch}
                isActive={branch.id === activeBranchId}
                onSwitch={() => {
                  switchBranch(sessionId, branch.id);
                  setOpen(false);
                }}
                onDelete={() => {
                  deleteBranch(sessionId, branch.id);
                }}
              />
            ))}
          </div>
        )}
      </div>

      <span className="text-[10px] text-text-secondary/50 select-none">
        {branches.length} branch{branches.length !== 1 ? "es" : ""}
      </span>
    </div>
  );
}

function BranchItem({
  branch,
  isActive,
  onSwitch,
  onDelete,
}: {
  branch: ConversationBranch;
  isActive: boolean;
  onSwitch: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`group flex items-center gap-2 px-3 py-2 text-xs transition-colors ${
        isActive
          ? "bg-accent-cyan/10 text-accent-cyan"
          : "text-text-secondary hover:bg-white/[0.04] hover:text-text-primary"
      }`}
    >
      <button
        onClick={onSwitch}
        className="flex-1 text-left truncate cursor-pointer"
      >
        <span className="font-medium">{branch.name}</span>
        <span className="ml-1.5 text-[10px] opacity-50">
          {timeAgo(branch.createdAt)}
        </span>
      </button>
      {isActive && (
        <span className="text-[10px] text-accent-cyan/70 shrink-0">
          active
        </span>
      )}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="opacity-0 group-hover:opacity-100 shrink-0 p-0.5 rounded hover:bg-white/10 transition-all cursor-pointer"
        title="Delete branch"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
