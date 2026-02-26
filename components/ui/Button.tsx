"use client";

import { cn } from "@/lib/utils";

/**
 * Props for the Button component.
 *
 * Extends all native `<button>` HTML attributes plus:
 * @property variant - Visual style: "primary" (cyan accent), "ghost" (subtle), "danger" (red)
 * @property size - Dimension preset: "sm" | "md" | "lg"
 */
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
}

/**
 * Base button component with three visual variants and three size presets.
 * Disabled state is handled via Tailwind opacity/cursor utilities.
 */
export function Button({
  variant = "ghost",
  size = "md",
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center font-medium transition-all duration-150 rounded-lg cursor-pointer",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        size === "sm" && "h-8 px-3 text-xs gap-1.5",
        size === "md" && "h-9 px-4 text-sm gap-2",
        size === "lg" && "h-11 px-6 text-base gap-2",
        variant === "ghost" &&
          "bg-white/5 border border-white/8 text-text-secondary hover:bg-white/8 hover:text-text-primary hover:border-white/12",
        variant === "primary" &&
          "bg-accent-cyan/20 border border-accent-cyan/30 text-accent-cyan hover:bg-accent-cyan/30 glow-cyan",
        variant === "danger" &&
          "bg-red-500/10 border border-red-500/20 text-error hover:bg-red-500/20",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
