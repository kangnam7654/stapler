import * as os from "node:os";
import {
  resolveProjectWorkspacePath,
  toWorkspaceSlug,
  type ResolvedProjectWorkspacePath,
} from "@paperclipai/shared";
import { resolveHomeAwarePath } from "../home-paths.js";

export function systemDefaultRoot(): string {
  const env = process.env.STAPLER_WORKSPACE_ROOT;
  if (env && env.trim().length > 0) return env.trim();
  return `${os.homedir()}/Stapler`;
}

export interface ResolveForProjectInput {
  companyName: string;
  companyRootPath: string | null;
  projectName: string;
  projectPathOverride: string | null;
}

export function resolveForProject(input: ResolveForProjectInput): ResolvedProjectWorkspacePath {
  const resolved = resolveProjectWorkspacePath({
    companySlug: toWorkspaceSlug(input.companyName),
    projectSlug: toWorkspaceSlug(input.projectName),
    companyRootPath: input.companyRootPath,
    projectPathOverride: input.projectPathOverride,
    systemDefaultRoot: systemDefaultRoot(),
  });
  // Expand `~` and resolve to an absolute path so consumers (UI clipboard,
  // Finder/IDE openers) get a usable absolute path. Pure shared resolver stays
  // browser-safe by leaving home expansion to the platform layer.
  return {
    ...resolved,
    resolvedAbsolutePath: resolveHomeAwarePath(resolved.resolvedAbsolutePath),
  };
}
