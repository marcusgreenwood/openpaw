"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

interface SkillEditorProps {
  skillName: string;
  workspace?: string;
  onClose: () => void;
  onSaved: () => void;
}

export function SkillEditor({ skillName, workspace, onClose, onSaved }: SkillEditorProps) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const qs = workspace ? `?workspace=${encodeURIComponent(workspace)}` : "";
    fetch(`/api/skills/${encodeURIComponent(skillName)}${qs}`)
      .then((r) => r.json())
      .then((d) => {
        setContent(d.rawContent ?? "");
        setLoading(false);
      })
      .catch((err) => {
        setError(String(err));
        setLoading(false);
      });
  }, [skillName, workspace]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const qs = workspace ? `?workspace=${encodeURIComponent(workspace)}` : "";
      const res = await fetch(`/api/skills/${encodeURIComponent(skillName)}${qs}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save");
      } else {
        setDirty(false);
        onSaved();
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cn(
          "relative w-full max-w-3xl h-[85vh] flex flex-col",
          "bg-bg-elevated border border-white/10 rounded-xl shadow-2xl overflow-hidden"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-white/8">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-text-primary">
              Edit Skill: {skillName}
            </h2>
            <Badge variant="cyan">SKILL.md</Badge>
            {dirty && <Badge variant="warning">unsaved</Badge>}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              disabled={saving || !dirty}
            >
              {saving ? "Saving..." : "Save"}
            </Button>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5 text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Editor */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <span className="text-text-muted text-sm">Loading skill...</span>
            </div>
          ) : (
            <textarea
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                setDirty(true);
              }}
              spellCheck={false}
              className={cn(
                "w-full h-full p-4 bg-transparent text-text-primary text-sm font-mono",
                "outline-none resize-none leading-relaxed",
                "placeholder:text-text-muted"
              )}
              placeholder="# Skill Name\n\nWrite your skill documentation here..."
            />
          )}
        </div>

        {/* Footer */}
        {error && (
          <div className="shrink-0 px-4 py-2 border-t border-white/8 bg-error/5">
            <p className="text-xs text-error">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
