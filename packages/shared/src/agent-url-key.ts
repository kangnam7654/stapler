import sharedNative from "@paperclipai/shared-native";

const AGENT_URL_KEY_DELIM_RE = /[^a-z0-9]+/g;
const AGENT_URL_KEY_TRIM_RE = /^-+|-+$/g;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Checks if a string looks like a UUID (v1-v5).
 */
export function isUuidLike(value: string | null | undefined): boolean {
  if (typeof value !== "string") return false;

  if (sharedNative) {
    try {
      return sharedNative.isUuidLike(value);
    } catch (_err) {
      // Fall through to JS
    }
  }

  return UUID_RE.test(value.trim());
}

/**
 * Normalizes a string to be used as an agent URL key.
 */
export function normalizeAgentUrlKey(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;

  if (sharedNative) {
    try {
      return sharedNative.normalizeUrlKey(value);
    } catch (_err) {
      // Fall through to JS
    }
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(AGENT_URL_KEY_DELIM_RE, "-")
    .replace(AGENT_URL_KEY_TRIM_RE, "");
  return normalized.length > 0 ? normalized : null;
}

export function deriveAgentUrlKey(name: string | null | undefined, fallback?: string | null): string {
  return normalizeAgentUrlKey(name) ?? normalizeAgentUrlKey(fallback) ?? "agent";
}
