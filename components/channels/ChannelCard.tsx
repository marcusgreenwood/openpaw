"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";

interface FieldStatus {
  set: boolean;
  source: "env" | "stored" | "none";
  masked: string;
}

interface ChannelCardProps {
  label: string;
  icon: React.ReactNode;
  enabled: boolean;
  webhookUrl: string;
  activeSessions: number;
  fields: Record<string, FieldStatus>;
  fieldLabels: Record<string, string>;
  onSave: (config: Record<string, string>) => Promise<void>;
  onClear: () => Promise<void>;
}

export function ChannelCard({
  label,
  icon,
  enabled,
  webhookUrl,
  activeSessions,
  fields,
  fieldLabels,
  onSave,
  onClear,
}: ChannelCardProps) {
  const [expanded, setExpanded] = useState(!enabled);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  const hasStoredFields = Object.values(fields).some((f) => f.source === "stored");
  const allEnv = Object.values(fields).every((f) => f.source === "env" || f.source === "none");

  const handleCopy = async () => {
    await navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Build config: only include non-empty fields
      const config: Record<string, string> = {};
      for (const key of Object.keys(fieldLabels)) {
        const val = values[key];
        if (val !== undefined && val !== "") {
          config[key] = val;
        } else if (fields[key]?.source === "stored") {
          // Preserve existing stored values if user didn't change them
          config[key] = "__keep__"; // sentinel — server should keep old value
        }
      }
      await onSave(config);
      setValues({});
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    try {
      await onClear();
      setValues({});
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="glass-card p-3 space-y-2">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 cursor-pointer"
      >
        <span className="text-text-secondary">{icon}</span>
        <span className="text-sm font-medium text-text-primary flex-1 text-left">
          {label}
        </span>
        {enabled ? (
          <Badge variant="success">connected</Badge>
        ) : (
          <Badge variant="default">offline</Badge>
        )}
        {activeSessions > 0 && (
          <Badge variant="cyan">{activeSessions} active</Badge>
        )}
        <svg
          className={cn(
            "w-3 h-3 text-text-muted transition-transform",
            expanded && "rotate-180"
          )}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="space-y-3 pt-1">
          {/* Webhook URL */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-text-muted block mb-1">
              Webhook URL
            </label>
            <div className="flex items-center gap-1.5">
              <code className="flex-1 text-[11px] font-mono text-text-secondary bg-white/3 border border-white/6 rounded px-2 py-1.5 truncate select-all">
                {webhookUrl}
              </code>
              <button
                onClick={handleCopy}
                className="shrink-0 h-7 w-7 flex items-center justify-center rounded bg-white/5 border border-white/8 hover:bg-white/8 text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
                title="Copy URL"
              >
                {copied ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" />
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Credential fields */}
          {Object.entries(fieldLabels).map(([key, fieldLabel]) => {
            const field = fields[key];
            const isEnv = field?.source === "env";
            const isPassword = key.includes("token") || key.includes("secret") || key.includes("Secret");
            const show = showSecrets[key];

            return (
              <div key={key}>
                <label className="text-[10px] uppercase tracking-wider text-text-muted flex items-center gap-1.5 mb-1">
                  {fieldLabel}
                  {isEnv && <Badge variant="warning">env</Badge>}
                  {field?.source === "stored" && <Badge variant="success">saved</Badge>}
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type={isPassword && !show ? "password" : "text"}
                    value={values[key] ?? ""}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, [key]: e.target.value }))
                    }
                    placeholder={
                      isEnv
                        ? `Set via env (${field.masked})`
                        : field?.set
                          ? `Current: ${field.masked}`
                          : `Enter ${fieldLabel.toLowerCase()}...`
                    }
                    disabled={isEnv}
                    className={cn(
                      "flex-1 h-8 px-3 rounded-lg text-xs font-mono bg-white/5 border border-white/8 text-text-primary outline-none placeholder:text-text-muted",
                      isEnv && "opacity-50 cursor-not-allowed"
                    )}
                  />
                  {isPassword && (
                    <button
                      onClick={() =>
                        setShowSecrets((s) => ({ ...s, [key]: !s[key] }))
                      }
                      className="shrink-0 h-8 w-8 flex items-center justify-center rounded-lg bg-white/5 border border-white/8 hover:bg-white/8 text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
                      title={show ? "Hide" : "Show"}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        {show ? (
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

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={saving || allEnv}
              className={cn(
                "h-7 px-3 rounded-lg text-xs font-medium transition-all cursor-pointer",
                "bg-accent-cyan/15 text-accent-cyan border border-accent-cyan/20 hover:bg-accent-cyan/25",
                (saving || allEnv) && "opacity-40 cursor-not-allowed"
              )}
            >
              {saving ? "Saving..." : "Save"}
            </button>
            {hasStoredFields && (
              <button
                onClick={handleClear}
                disabled={saving}
                className="h-7 px-3 rounded-lg text-xs font-medium text-terminal-red/80 border border-terminal-red/15 hover:bg-terminal-red/10 transition-all cursor-pointer"
              >
                Clear saved
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
