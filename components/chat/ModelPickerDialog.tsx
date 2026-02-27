"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useConfiguredProviders } from "@/lib/hooks/use-configured-providers";

interface ModelPickerDialogProps {
  open: boolean;
  onClose: () => void;
  onCompare: (modelIds: string[]) => void;
}

export function ModelPickerDialog({
  open,
  onClose,
  onCompare,
}: ModelPickerDialogProps) {
  const { configuredModels } = useConfiguredProviders();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  if (!open) return null;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < 3) {
        next.add(id);
      }
      return next;
    });
  };

  const handleCompare = () => {
    if (selected.size >= 2) {
      onCompare(Array.from(selected));
      setSelected(new Set());
    }
  };

  const handleClose = () => {
    setSelected(new Set());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[110]">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      <div className="absolute top-[15%] left-1/2 -translate-x-1/2 w-full max-w-md">
        <div className="glass-card glow-cyan p-0 overflow-hidden">
          {/* Header */}
          <div className="px-5 py-4 border-b border-white/6">
            <h2 className="text-sm font-semibold text-text-primary">
              Compare Models
            </h2>
            <p className="text-xs text-text-muted mt-1">
              Select 2–3 models to compare side by side
            </p>
          </div>

          {/* Model list */}
          <div className="max-h-72 overflow-y-auto p-3 space-y-1">
            {configuredModels.length === 0 && (
              <p className="text-sm text-text-muted text-center py-6">
                No models configured. Add API keys in Settings.
              </p>
            )}
            {configuredModels.map((model) => {
              const isSelected = selected.has(model.id);
              const disabled = !isSelected && selected.size >= 3;
              return (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => !disabled && toggle(model.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors cursor-pointer",
                    isSelected
                      ? "bg-accent-cyan/15 border border-accent-cyan/30 text-accent-cyan"
                      : "bg-transparent border border-transparent text-text-secondary hover:bg-white/5",
                    disabled && "opacity-40 cursor-not-allowed"
                  )}
                >
                  <div
                    className={cn(
                      "w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                      isSelected
                        ? "border-accent-cyan bg-accent-cyan/20"
                        : "border-white/20 bg-transparent"
                    )}
                  >
                    {isSelected && (
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 10 10"
                        fill="currentColor"
                      >
                        <path d="M8.5 2.5L4 7.5L1.5 5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  <span className="flex-1 text-left">{model.name}</span>
                  <span className="text-[10px] text-text-muted">
                    {model.provider}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-white/6 flex items-center justify-between">
            <span className="text-xs text-text-muted">
              {selected.size}/3 selected
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCompare}
                disabled={selected.size < 2}
                className={cn(
                  "px-4 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer",
                  selected.size >= 2
                    ? "bg-accent-cyan/20 border border-accent-cyan/30 text-accent-cyan hover:bg-accent-cyan/30"
                    : "bg-white/5 border border-white/8 text-text-muted cursor-not-allowed"
                )}
              >
                Compare
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
