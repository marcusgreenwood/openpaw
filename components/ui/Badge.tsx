import { cn } from "@/lib/utils";

/**
 * Props for the Badge component.
 *
 * @property children - Badge label content
 * @property variant - Color scheme (default: "default" = muted grey)
 * @property className - Extra classes merged via `cn`
 */
interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "success" | "error" | "warning" | "cyan" | "purple";
  className?: string;
}

/**
 * Small inline label chip used to tag status, type, or category information.
 * Renders as a monospace `<span>` styled with the chosen color variant.
 */
export function Badge({
  children,
  variant = "default",
  className,
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-medium",
        variant === "default" && "bg-white/6 text-text-secondary",
        variant === "success" && "bg-green-500/10 text-terminal-green",
        variant === "error" && "bg-red-500/10 text-terminal-red",
        variant === "warning" && "bg-yellow-500/10 text-terminal-yellow",
        variant === "cyan" && "bg-accent-cyan/10 text-accent-cyan",
        variant === "purple" && "bg-accent-purple/10 text-accent-purple",
        className
      )}
    >
      {children}
    </span>
  );
}
