export type ClassValue = string | false | null | undefined;

/** Joins class names, dropping falsy entries. */
export function cn(...parts: ClassValue[]): string {
  return parts.filter(Boolean).join(' ');
}

export function prefersReducedMotion(): boolean {
  return (
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
