import sharedNative from "@paperclipai/shared-native";

const PROJECT_URL_KEY_DELIM_RE = /[^a-z0-9]+/g;
const PROJECT_URL_KEY_TRIM_RE = /^-+|-+$/g;

/**
 * Normalizes a string to be used as a project URL key.
 * 
 * Logic (JS Fallback):
 * 1. Trim whitespace.
 * 2. Convert to lowercase.
 * 3. Replace any sequence of non-alphanumeric characters with a single dash.
 * 4. Trim leading and trailing dashes.
 */
export function normalizeProjectUrlKey(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;

  // Try native Rust implementation first
  if (sharedNative) {
    try {
      return sharedNative.normalizeUrlKey(value);
    } catch (_err) {
      // Fall through to JS implementation
    }
  }

  // JS Fallback
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(PROJECT_URL_KEY_DELIM_RE, "-")
    .replace(PROJECT_URL_KEY_TRIM_RE, "");
  return normalized.length > 0 ? normalized : null;
}

export function deriveProjectUrlKey(name: string | null | undefined, fallback?: string | null): string {
  return normalizeProjectUrlKey(name) ?? normalizeProjectUrlKey(fallback) ?? "project";
}
