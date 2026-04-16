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

  /**
   * Builds a project mention href.
   */
  buildProjectMentionHref(projectId: string, color?: string | null): string;

  /**
   * Parses a project mention href.
   */
  parseProjectMentionHref(href: string): { projectId: string; color: string | null } | null;

  /**
   * Builds an agent mention href.
   */
  buildAgentMentionHref(agentId: string, icon?: string | null): string;

  /**
   * Parses an agent mention href.
   */
  parseAgentMentionHref(href: string): { agentId: string; icon: string | null } | null;

  /**
   * Extracts project IDs from markdown mentions.
   */
  extractProjectMentionIds(markdown: string): string[];

  /**
   * Extracts agent IDs from markdown mentions.
   */
  extractAgentMentionIds(markdown: string): string[];

  /**
   * Parse a comma-separated list of MIME type patterns into a normalised array.
   */
  parseAllowedTypes(raw: string | null | undefined): string[];

  /**
   * Check whether `contentType` matches any entry in `allowedPatterns`.
   */
  matchesContentType(contentType: string, allowedPatterns: string[]): boolean;

  /**
   * Sanitizes a string for use as a "friendly" path segment.
   */
  sanitizeFriendlyPathSegment(value: string | null | undefined, fallback: string): string;

  /**
   * Expands a home directory prefix (~) in a path string.
   */
  expandHomePrefix(path: string, homeDir: string): string;

  /**
   * Normalizes a currency code to uppercase.
   */
  normalizeCurrency(code: string): string;

  /**
   * Derives the biller name, falling back to the provider if not explicitly provided.
   */
  deriveBiller(biller: string | null | undefined, provider: string): string;
} | null;

export = native;
