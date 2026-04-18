/**
 * Converts a name to a filesystem-safe slug.
 *
 * - ASCII names are lowercased, kebab-cased, and trimmed of leading/trailing dashes.
 * - Non-ASCII names (e.g. Korean) fall back to a deterministic 32-bit FNV-1a
 *   hash (`name-XXXXXXXX`) — preserving stability over lossy transliteration.
 * - Empty / whitespace-only / non-alphanumeric inputs also fall through to the hash path.
 *
 * Uses a pure-JS hash (no `node:crypto`) so this module is safe to import from
 * both Node (server) and browser (UI bundle) build targets. The hash is used
 * only as a disambiguating filename suffix; cryptographic strength is not
 * required.
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
  return `name-${fnv1a32Hex(name)}`;
}

/**
 * 32-bit FNV-1a hash, returned as 8 hex characters (zero-padded).
 *
 * Stable across Node and browser runtimes. Operates on UTF-16 code units —
 * sufficient for our filename-disambiguation use case.
 */
function fnv1a32Hex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // Equivalent to `hash *= 16777619` but avoids 32-bit overflow.
    hash =
      (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>>
      0;
  }
  return hash.toString(16).padStart(8, "0");
}
