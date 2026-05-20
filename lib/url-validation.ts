/**
 * Returns true only when `next` is a safe internal path we can redirect to.
 * Rejects protocol-relative URLs (`//evil.com`), absolute URLs, and the
 * backslash-prefix variant that some browsers interpret as a host.
 */
export function isSafeNext(next: string | null | undefined): boolean {
  if (!next || typeof next !== "string") return false;
  if (next.length > 512) return false;
  if (!next.startsWith("/")) return false;
  if (next.startsWith("//")) return false;
  if (next.startsWith("/\\")) return false;
  return true;
}

const SLUG_RE = /^[a-z0-9-]{1,60}$/;

export function isValidSlug(slug: string | null | undefined): slug is string {
  return typeof slug === "string" && SLUG_RE.test(slug);
}
