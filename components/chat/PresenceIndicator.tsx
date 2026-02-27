"use client";

const COLORS = [
  "bg-green-400",
  "bg-blue-400",
  "bg-purple-400",
  "bg-amber-400",
  "bg-pink-400",
];

interface PresenceIndicatorProps {
  viewerCount: number;
}

export function PresenceIndicator({ viewerCount }: PresenceIndicatorProps) {
  if (viewerCount === 0) return null;

  const dots = Math.min(viewerCount, 5);

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex -space-x-1">
        {Array.from({ length: dots }).map((_, i) => (
          <div
            key={i}
            className={`w-2.5 h-2.5 rounded-full border border-bg-base ${COLORS[i % COLORS.length]} animate-pulse`}
            style={{ animationDelay: `${i * 0.2}s` }}
          />
        ))}
      </div>
      <span className="text-xs text-text-muted">
        {viewerCount} {viewerCount === 1 ? "viewer" : "viewers"}
      </span>
    </div>
  );
}
