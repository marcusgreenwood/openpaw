"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import { PROVIDER_REGISTRY } from "@/lib/models/providers";

interface ProviderStatus {
  configured: boolean;
  source: "env" | "stored" | "none";
  masked: string;
}

interface ProvidersResponse {
  providers: Record<string, ProviderStatus>;
  configuredProviders: string[];
}

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI (GPT)",
  google: "Google (Gemini)",
  moonshotai: "Moonshot (Kimi)",
};

export function ProviderKeysPanel() {
  const [data, setData] = useState<ProvidersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});

  const fetchProviders = useCallback(async () => {
    try {
      const res = await fetch("/api/providers");
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("Failed to fetch providers:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const body: Record<string, string> = {};
      for (const [provider, val] of Object.entries(values)) {
        if (val.trim() !== "") {
          body[provider] = val.trim();
        }
      }
      await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setValues({});
      await fetchProviders();
      window.dispatchEvent(new CustomEvent("openpaw-providers-updated"));
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async (provider: string) => {
    setSaving(true);
    try {
      await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [provider]: "" }),
      });
      setValues((v) => ({ ...v, [provider]: "" }));
      await fetchProviders();
      window.dispatchEvent(new CustomEvent("openpaw-providers-updated"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center py-12">
        <div className="w-4 h-4 border-2 border-accent-cyan/30 border-t-accent-cyan rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-4 text-center text-text-muted text-xs">
        Failed to load providers.
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <p className="text-xs text-text-muted">
        Configure API keys for AI providers. Only providers with keys set will
        appear in the model selector. Environment variables take precedence
        over saved values.
      </p>

      {Object.keys(PROVIDER_REGISTRY).map((provider) => {
        const status = data.providers[provider];
        const isEnv = status?.source === "env";
        const configured = status?.configured ?? false;

        return (
          <div
            key={provider}
            className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-text-primary">
                {PROVIDER_LABELS[provider] ?? provider}
              </span>
              {configured ? (
                <Badge variant="success">
                  {isEnv ? "env" : "saved"}
                </Badge>
              ) : (
                <Badge variant="default">not configured</Badge>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <input
                type={showKeys[provider] ? "text" : "password"}
                value={values[provider] ?? ""}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [provider]: e.target.value }))
                }
                placeholder={
                  isEnv
                    ? `Set via env (${status?.masked ?? "****"})`
                    : configured
                      ? `Current: ${status?.masked ?? "****"}`
                      : `Enter API key...`
                }
                disabled={isEnv}
                className={cn(
                  "flex-1 h-9 px-3 rounded-lg text-sm font-mono bg-white/5 border border-white/10 text-text-primary outline-none placeholder:text-text-muted focus:border-accent-cyan/40",
                  isEnv && "opacity-50 cursor-not-allowed"
                )}
              />
              {status?.source === "stored" && (
                <button
                  onClick={() => handleClear(provider)}
                  disabled={saving}
                  className="shrink-0 text-[11px] text-terminal-red/80 hover:text-terminal-red px-2 py-1 rounded hover:bg-terminal-red/10 transition-colors cursor-pointer"
                >
                  Clear
                </button>
              )}
              {!isEnv && (
                <button
                  onClick={() =>
                    setShowKeys((s) => ({ ...s, [provider]: !s[provider] }))
                  }
                  className="shrink-0 h-9 w-9 flex items-center justify-center rounded-lg bg-white/5 border border-white/10 hover:bg-white/8 text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
                  title={showKeys[provider] ? "Hide" : "Show"}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    {showKeys[provider] ? (
                      <>
                        <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
                        <path d="M1 1l22 22" />
                      </>
                    ) : (
                      <>
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </>
                    )}
                  </svg>
                </button>
              )}
            </div>
          </div>
        );
      })}

      <button
        onClick={handleSave}
        disabled={saving}
        className={cn(
          "h-9 px-4 rounded-lg text-sm font-medium transition-all cursor-pointer",
          "bg-accent-cyan/15 text-accent-cyan border border-accent-cyan/20 hover:bg-accent-cyan/25",
          saving && "opacity-40 cursor-not-allowed"
        )}
      >
        {saving ? "Saving..." : "Save API Keys"}
      </button>
    </div>
  );
}
