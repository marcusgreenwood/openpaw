import { cn } from "@/lib/utils";

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  glow?: "cyan" | "purple" | "none";
}

/**
 * Container with the shared glass-card surface and an optional cyan or purple glow
 * (no glow by default).
 */
export function GlassCard({
  children,
  className,
  glow = "none",
}: GlassCardProps) {
  return (
    <div
      className={cn(
        "glass-card",
        glow === "cyan" && "glow-cyan",
        glow === "purple" && "glow-purple",
        className
      )}
    >
      {children}
    </div>
  );
}
