import { createHash } from "node:crypto";

/**
 * Converts a name to a filesystem-safe slug.
 *
 * - ASCII names are lowercased, kebab-cased, and trimmed of leading/trailing dashes.
 * - Non-ASCII names (e.g. Korean) fall back to a deterministic sha256-derived
 *   slug (`name-XXXXXXXX`) — preserving stability over lossy transliteration.
 * - Empty / whitespace-only / non-alphanumeric inputs also fall through to the hash path.
 *
 * Used by the workspace-path resolver to derive default folder names from
 * company and project names.
 */
export function toWorkspaceSlug(name: string): string {
  const ascii = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (ascii.length > 0) return ascii;
  const hash = createHash("sha256").update(name).digest("hex").slice(0, 8);
  return `name-${hash}`;
}
