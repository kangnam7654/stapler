import { resolveForProject } from "./workspace-path-service.js";

export interface CwdFallbackProjectCtx {
  companyName: string;
  companyRootPath: string | null;
  projectName: string;
  projectPathOverride: string | null;
}

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
