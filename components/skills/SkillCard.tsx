"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

export interface SkillSearchResult {
  name: string;
  owner: string;
  repo: string;
  description: string;
  stars?: number;
  tags?: string[];
}

type InstallStatus = "idle" | "installing" | "success" | "error";

interface SkillCardProps {
  skill: SkillSearchResult;
  isInstalled: boolean;
  installStatus: InstallStatus;
  onInstall: (skill: SkillSearchResult) => void;
}

const TAG_EMOJI: Record<string, string> = {
  browser: "🌐",
  automation: "🤖",
  code: "💻",
  generation: "✨",
  design: "🎨",
  react: "⚛️",
  mobile: "📱",
  shell: "🖥️",
  bash: "🖥️",
  cli: "🖥️",
  cron: "⏰",
  scheduling: "⏰",
  weather: "🌤️",
  productivity: "📋",
  skills: "🧩",
  search: "🔍",
  api: "🔌",
  data: "📊",
  ui: "🎨",
  accessibility: "♿",
  scraping: "🕷️",
};

function getSkillEmoji(tags?: string[]): string {
  if (!tags?.length) return "🧩";
  for (const tag of tags) {
    const emoji = TAG_EMOJI[tag.toLowerCase()];
    if (emoji) return emoji;
  }
  return "🧩";
}

export function SkillCard({
  skill,
  isInstalled,
  installStatus,
  onInstall,
}: SkillCardProps) {
  return (
    <div
      className={cn(
        "glass-card glass-card-hover p-4 flex flex-col gap-3 transition-all duration-200",
        "hover:scale-[1.01]"
      )}
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl shrink-0 mt-0.5" role="img">
          {getSkillEmoji(skill.tags)}
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-text-primary truncate">
            {skill.name}
          </h3>
          <p className="text-xs text-text-muted mt-0.5">
            {skill.owner}/{skill.repo}
          </p>
        </div>
      </div>

      <p className="text-xs text-text-secondary line-clamp-2 leading-relaxed">
        {skill.description}
      </p>

      {skill.tags && skill.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {skill.tags.slice(0, 3).map((tag) => (
            <Badge key={tag} variant="default" className="text-[10px]">
              {tag}
            </Badge>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between mt-auto pt-1">
        {skill.stars !== undefined && (
          <span className="text-[10px] text-text-muted flex items-center gap-1">
            <svg
              className="w-3 h-3"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
            {skill.stars}
          </span>
        )}
        <div className="ml-auto">
          {isInstalled ? (
            <Badge variant="success">Installed</Badge>
          ) : installStatus === "installing" ? (
            <Button size="sm" variant="primary" disabled>
              <svg
                className="w-3.5 h-3.5 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Installing…
            </Button>
          ) : installStatus === "success" ? (
            <Badge variant="success">
              <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path d="M5 13l4 4L19 7" />
              </svg>
              Installed
            </Badge>
          ) : installStatus === "error" ? (
            <Button
              size="sm"
              variant="danger"
              onClick={() => onInstall(skill)}
            >
              Retry
            </Button>
          ) : (
            <Button
              size="sm"
              variant="primary"
              onClick={() => onInstall(skill)}
            >
              Install
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function SkillCardSkeleton() {
  return (
    <div className="glass-card p-4 flex flex-col gap-3 animate-pulse">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-white/5" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-24 rounded bg-white/5" />
          <div className="h-3 w-32 rounded bg-white/[0.03]" />
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="h-3 w-full rounded bg-white/[0.03]" />
        <div className="h-3 w-3/4 rounded bg-white/[0.03]" />
      </div>
      <div className="flex gap-1">
        <div className="h-5 w-12 rounded bg-white/[0.03]" />
        <div className="h-5 w-16 rounded bg-white/[0.03]" />
      </div>
      <div className="flex justify-end mt-auto pt-1">
        <div className="h-8 w-16 rounded-lg bg-white/5" />
      </div>
    </div>
  );
}
