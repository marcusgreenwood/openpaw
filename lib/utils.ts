/**
 * @file Small shared UI helpers.
 */

/**
 * Joins class names, dropping falsy values.
 *
 * @param classes - Class names, or falsy values to skip (e.g. `isActive && "active"`).
 * @returns The truthy class names joined by a single space.
 */
export function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(" ");
}
