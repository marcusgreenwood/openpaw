"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

interface MemoryConfig {
  enabled: boolean;
  source: "env" | "stored" | "none";
  hasApiKey: boolean;
  maskedKey: string;
  projectId: string;
}

export function MemorySettings() {
  const [config, setConfig] = useState<MemoryConfig | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [projectId, setProjectId] = useState("");
  const [saving, setSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    fetch("/api/memory/config")
      .then((r) => r.json())
      .then((d) => {
        setConfig(d);
        setProjectId(d.projectId ?? "");
      })
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    try {
      await fetch("/api/memory/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim(), projectId: projectId.trim() }),
      });
      setApiKey("");
      const r = await fetch("/api/memory/config");
      setConfig(await r.json());
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    await fetch("/api/memory/config", { method: "DELETE" });
    const r = await fetch("/api/memory/config");
    setConfig(await r.json());
  };

  if (!config) return <div className="p-4 text-text-muted text-sm">Loading...</div>;

  return (
    <div className="p-4 space-y-4">
      <div>
        <p className="text-xs text-text-muted mb-3">
          Connect to{" "}
          <a href="https://minns.ai" target="_blank" rel="noopener noreferrer" className="text-accent-cyan hover:underline">
            Minns Memory Layer
          </a>{" "}
          to give the agent persistent long-term memory across sessions. The agent will
          automatically remember facts, preferences, and context.
        </p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-text-secondary">Minns API Key</label>
          {config.hasApiKey && (
            <Badge variant={config.source === "env" ? "success" : "cyan"}>
              {config.source}
            </Badge>
          )}
          {!config.hasApiKey && (
            <Badge variant="warning">not configured</Badge>
          )}
        </div>
        {config.source === "env" ? (
          <div className="h-10 px-3 flex items-center rounded-lg text-sm font-mono bg-white/5 border border-white/10 text-text-muted">
            Set via env ({config.maskedKey})
          </div>
        ) : (
          <div className="relative">
            <input
              type={showKey ? "text" : "password"}
              value={apiKey || (config.hasApiKey ? config.maskedKey : "")}
              onChange={(e) => setApiKey(e.target.value)}
              onFocus={() => {
                if (!apiKey && config.hasApiKey) setApiKey("");
              }}
              placeholder="Enter API key..."
              className="w-full h-10 px-3 pr-10 rounded-lg text-sm font-mono bg-white/5 border border-white/10 text-text-primary outline-none placeholder:text-text-muted focus:border-accent-cyan/40"
            />
            <button
              onClick={() => setShowKey(!showKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary cursor-pointer"
              title={showKey ? "Hide" : "Show"}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                {showKey ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                ) : (
                  <>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </>
                )}
              </svg>
            </button>
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-text-secondary mb-2">
          Project ID
        </label>
        <input
          type="text"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          placeholder="e.g. 1b43920b-..."
          disabled={config.source === "env"}
          className="w-full h-10 px-3 rounded-lg text-sm font-mono bg-white/5 border border-white/10 text-text-primary outline-none placeholder:text-text-muted focus:border-accent-cyan/40 disabled:opacity-50"
        />
      </div>

      {config.source !== "env" && (
        <div className="flex gap-2 pt-1">
          <Button variant="primary" size="sm" onClick={handleSave} disabled={saving || !apiKey.trim()}>
            {saving ? "Saving..." : "Save Memory Config"}
          </Button>
          {config.hasApiKey && (
            <Button variant="ghost" size="sm" onClick={handleClear}>
              Clear
            </Button>
          )}
        </div>
      )}

      {config.enabled && (
        <div className="pt-2 text-xs text-green-400/80 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
          Memory is active — the agent will remember across sessions
        </div>
      )}
    </div>
  );
}
