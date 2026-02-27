"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  SkillCard,
  SkillCardSkeleton,
  type SkillSearchResult,
} from "@/components/skills/SkillCard";
import type { Skill } from "@/types";

type InstallStatus = "idle" | "installing" | "success" | "error";

interface SkillMarketplaceProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  installedSkills: Skill[];
  onSkillInstalled?: () => void;
}

export function SkillMarketplace({
  open,
  onOpenChange,
  installedSkills,
  onSkillInstalled,
}: SkillMarketplaceProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SkillSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [installStatuses, setInstallStatuses] = useState<
    Record<string, InstallStatus>
  >({});
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const installedNames = new Set(installedSkills.map((s) => s.name));

  const fetchResults = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const url = q
        ? `/api/skills/search?q=${encodeURIComponent(q)}`
        : "/api/skills/search";
      const res = await fetch(url);
      const data = await res.json();
      setResults(data.results ?? []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
      setSearched(true);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSearched(false);
      setInstallStatuses({});
      fetchResults("");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open, fetchResults]);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchResults(query);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open, fetchResults]);

  const handleInstall = async (skill: SkillSearchResult) => {
    const skillName = `${skill.owner}/${skill.repo}`;
    setInstallStatuses((prev) => ({ ...prev, [skill.name]: "installing" }));

    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skillName }),
      });
      const result = await res.json();
      setInstallStatuses((prev) => ({
        ...prev,
        [skill.name]: result.success ? "success" : "error",
      }));
      if (result.success) {
        onSkillInstalled?.();
      }
    } catch {
      setInstallStatuses((prev) => ({ ...prev, [skill.name]: "error" }));
    }
  };

  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100]">
      {/* Glass backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />

      {/* Modal */}
      <div
        className={cn(
          "absolute inset-4 md:inset-8 lg:inset-12",
          "bg-bg-elevated border border-white/10 rounded-2xl",
          "glow-cyan shadow-2xl shadow-black/40",
          "flex flex-col overflow-hidden"
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-4 px-6 py-4 border-b border-white/6">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-text-primary">
              Skill Marketplace
            </h2>
            <p className="text-xs text-text-muted mt-0.5">
              Browse and install skills to extend your agent
            </p>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="text-text-muted hover:text-text-primary transition-colors cursor-pointer p-1"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-4">
          <div className="relative">
            <svg
              className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search skills... (e.g. browser, react, coding)"
              className={cn(
                "w-full h-12 pl-12 pr-4 rounded-xl text-sm",
                "bg-white/5 border border-white/8",
                "text-text-primary outline-none",
                "placeholder:text-text-muted",
                "focus:border-accent-cyan/40 focus:bg-white/[0.07]",
                "transition-colors"
              )}
            />
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SkillCardSkeleton />
              <SkillCardSkeleton />
              <SkillCardSkeleton />
              <SkillCardSkeleton />
            </div>
          ) : results.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {results.map((skill) => (
                <SkillCard
                  key={`${skill.owner}/${skill.repo}/${skill.name}`}
                  skill={skill}
                  isInstalled={installedNames.has(skill.name)}
                  installStatus={installStatuses[skill.name] ?? "idle"}
                  onInstall={handleInstall}
                />
              ))}
            </div>
          ) : searched ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <span className="text-4xl mb-4">🔍</span>
              <p className="text-sm text-text-secondary">
                No skills found for &ldquo;{query}&rdquo;
              </p>
              <p className="text-xs text-text-muted mt-1">
                Try a different search term or browse the featured skills
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
