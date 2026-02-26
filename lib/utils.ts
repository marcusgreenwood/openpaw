/**
 * Merges class names, filtering out falsy values.
 * Accepts strings, booleans, undefined, and null — truthy values are joined
 * with a space. Use for conditional Tailwind class composition.
 *
 * @example cn("px-4", isActive && "bg-cyan-500", undefined) // "px-4 bg-cyan-500"
 */
export function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(" ");
}
