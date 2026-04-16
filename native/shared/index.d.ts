/**
 * Native shared utilities (napi-rs).
 * 
 * Returns null if the native binding failed to load.
 */
declare const native: {
  /**
   * Normalizes a string to be used as a URL key (slug).
   * Returns null if result is empty or input is null.
   */
  normalizeUrlKey(value: string | null | undefined): string | null;

  /**
   * Checks if a string looks like a UUID (v1-v5).
   */
  isUuidLike(value: string | null | undefined): boolean;

  /**
   * Redacts a username by masking it with asterisks, preserving the first character.
   */
  maskUserNameForLogs(value: string, fallback: string): string;

  /**
   * Redacts user-specific text (usernames and home directories) from a string.
   */
  redactCurrentUserText(
    input: string,
    userNames: string[],
    homeDirs: string[],
    replacement: string
  ): string;

  /**
   * Redacts sensitive information from an event payload.
   */
  redactEventPayload(payload: Record<string, any> | null | undefined): Record<string, any> | null;
} | null;

export = native;
