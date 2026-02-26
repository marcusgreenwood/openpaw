"use client";

import { useState, useEffect } from "react";
import { ModelSwitcher } from "./ModelSwitcher";
import { SettingsModal } from "./SettingsModal";
import { useSessionsStore } from "@/lib/store/sessions";

/**
 * Props for the Header component.
 *
 * @property onOpenCommandPalette - Callback invoked when the Cmd+K button is clicked
 */
interface HeaderProps {
  onOpenCommandPalette: () => void;
}

/**
 * Top navigation bar for the OpenPaw application.
 * Contains the sidebar toggle, the OpenPaw logo, a settings button,
 * the Cmd+K command palette trigger, and the ModelSwitcher dropdown.
 * Renders the SettingsModal as a controlled child.
 */
export function Header({ onOpenCommandPalette }: HeaderProps) {
  const { sidebarOpen, setSidebarOpen } = useSessionsStore();
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
    <header className="h-14 shrink-0 flex items-center justify-between px-4 md:px-6 border-b border-white/6 bg-bg-base/80 backdrop-blur-lg relative z-40">
      <div className="flex items-center gap-3">
        {/* Sidebar toggle */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5 text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
          title="Toggle sidebar"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M3 12h18M3 6h18M3 18h18" />
          </svg>
        </button>

        {/* Logo */}
        <div className="flex items-center gap-2">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            className="shrink-0"
            aria-hidden
          >
            {/* Cat paw: 3 toe beans + main pad */}
            <ellipse cx="12" cy="18" rx="5" ry="3.5" fill="currentColor" className="text-accent-cyan opacity-90" />
            <circle cx="7.5" cy="10" r="2.2" fill="currentColor" className="text-accent-cyan" />
            <circle cx="12" cy="7" r="2.2" fill="currentColor" className="text-accent-cyan" />
            <circle cx="16.5" cy="10" r="2.2" fill="currentColor" className="text-accent-cyan" />
          </svg>
          <h1 className="text-lg font-bold gradient-text tracking-tight">
            OpenPaw
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Settings */}
        <button
          onClick={() => setSettingsOpen(true)}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5 text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
          title="Settings"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>

        {/* Command palette trigger */}
        <button
          onClick={onOpenCommandPalette}
          className="hidden md:flex items-center gap-2 h-8 px-3 rounded-lg text-xs bg-white/5 border border-white/8 hover:bg-white/8 text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
          title="Command palette (Cmd+K)"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <span className="font-mono">Cmd+K</span>
        </button>

        <ModelSwitcher />
      </div>
    </header>

    <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
