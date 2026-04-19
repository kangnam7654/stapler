import { resolveForProject } from "./workspace-path-service.js";

export interface CwdFallbackProjectCtx {
  companyName: string;
  companyRootPath: string | null;
  projectName: string;
  projectPathOverride: string | null;
}

/**
 * Existing helper — kept for backward compatibility and direct use when
 * caller has already verified projectCtx is present.
 *
 * Returns config unchanged when `cwd` is already a non-empty trimmed string,
 * preserving any user override.
 */
export function applyWorkspaceCwdFallback<T extends Record<string, unknown> & { cwd?: string }>(
  config: T,
  projectCtx: CwdFallbackProjectCtx,
): T {
  if (typeof config.cwd === "string" && config.cwd.trim().length > 0) {
    return config;
  }
  const resolved = resolveForProject(projectCtx);
  return { ...config, cwd: resolved.resolvedAbsolutePath };
}

/**
 * Single resolver that handles both project-present and project-absent
 * branches. Goal-direct issues (no project) get cwd from `fallbackCwd`
 * (heartbeat passes `executionWorkspace.cwd` here).
 *
 * In all branches a non-empty existing `config.cwd` wins (user override).
 */
export function resolveRuntimeConfigCwd<T extends Record<string, unknown> & { cwd?: string }>(
  config: T,
  options: {
    projectCtx: CwdFallbackProjectCtx | null;
    fallbackCwd: string;
  },
): T {
  if (typeof config.cwd === "string" && config.cwd.trim().length > 0) {
    return config;
  }
  if (options.projectCtx) {
    return applyWorkspaceCwdFallback(config, options.projectCtx);
  }
  if (options.fallbackCwd.trim().length > 0) {
    return { ...config, cwd: options.fallbackCwd };
  }
  return config;
}
