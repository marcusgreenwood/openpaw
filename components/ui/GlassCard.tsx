import { cn } from "@/lib/utils";

/**
 * Props for the GlassCard component.
 *
 * @property children - Card body content
 * @property className - Extra classes merged via `cn`
 * @property glow - Optional glow accent color applied via the `glow-cyan` / `glow-purple` CSS utility
 */
interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  glow?: "cyan" | "purple" | "none";
}

/**
 * A frosted-glass surface container. Applies the global `glass-card` Tailwind
 * utility and optionally adds a colored drop-shadow glow effect.
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
