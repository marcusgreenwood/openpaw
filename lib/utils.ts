/**
 * Shared UI helpers.
 */

/**
 * Joins class names, dropping any that are falsy.
 *
 * Lets callers write conditional classes inline — `cn("btn", isActive && "btn-active")` —
 * without emitting `false` or `undefined` into the class attribute. Unlike `clsx`/`twMerge`
 * this does no Tailwind conflict resolution: later classes do not override earlier ones.
 *
 * @param classes - Class names, or falsy values to skip.
 * @returns The truthy class names joined by a single space.
 */
export function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(" ");
}
