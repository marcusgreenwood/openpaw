"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { PROVIDER_REGISTRY } from "@/lib/models/providers";
import { useSessionsStore } from "@/lib/store/sessions";
import { useConfiguredProviders } from "@/lib/hooks/use-configured-providers";

export function ModelSwitcher() {
  const { modelId, setModelId } = useSessionsStore();
  const { configuredModels } = useConfiguredProviders();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const currentModel = configuredModels.find((m) => m.id === modelId);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-2 h-8 px-3 rounded-lg text-xs font-medium transition-all cursor-pointer",
          "bg-white/5 border border-white/8 hover:bg-white/8 hover:border-white/12",
          open && "bg-white/8 border-white/12"
        )}
      >
        <div className="w-1.5 h-1.5 rounded-full bg-terminal-green" />
        <span className="text-text-secondary hidden sm:inline">
          {currentModel?.name ?? "Select Model"}
        </span>
        <span className="text-text-secondary sm:hidden">
          {currentModel?.name.split(" ").pop() ?? "Model"}
        </span>
        <svg
          className={cn(
            "w-3 h-3 text-text-muted transition-transform",
            open && "rotate-180"
          )}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-2 w-64 bg-bg-overlay border border-white/10 rounded-xl p-2 z-50 shadow-xl shadow-black/30">
          {configuredModels.length === 0 ? (
            <p className="px-3 py-4 text-xs text-text-muted text-center">
              Configure API keys in Settings to enable models.
            </p>
          ) : (
          Object.entries(
            configuredModels.reduce<Record<string, typeof configuredModels>>(
              (acc, m) => {
                if (!acc[m.provider]) acc[m.provider] = [];
                acc[m.provider].push(m);
                return acc;
              },
              {}
            )
          ).map(([provider, models]) => (
            <div key={provider}>
              <div className="text-[10px] uppercase tracking-wider text-text-muted px-3 py-1.5 mt-1 first:mt-0">
                {provider}
              </div>
              {models.map((model) => (
                <button
                  key={model.id}
                  onClick={() => {
                    setModelId(model.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer",
                    model.id === modelId
                      ? "bg-accent-cyan/10 text-accent-cyan"
                      : "text-text-secondary hover:bg-white/5 hover:text-text-primary"
                  )}
                >
                  <div
                    className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      model.id === modelId
                        ? "bg-accent-cyan"
                        : "bg-white/20"
                    )}
                  />
                  <span className="flex-1 text-left">{model.name}</span>
                  <span className="text-[10px] text-text-muted">
                    {model.contextWindow >= 1_000_000
                      ? `${model.contextWindow / 1_000_000}M`
                      : `${model.contextWindow / 1_000}k`}
                  </span>
                </button>
              ))}
            </div>
          ))
          )}
        </div>
      )}
    </div>
  );
}
