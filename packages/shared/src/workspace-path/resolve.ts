export interface ResolveProjectWorkspacePathInput {
  companySlug: string;
  projectSlug: string;
  companyRootPath: string | null;
  projectPathOverride: string | null;
  systemDefaultRoot: string;
}

export interface ResolvedProjectWorkspacePath {
  resolvedAbsolutePath: string;
  source: "project_override" | "company_root" | "system_default";
}

function stripTrailingSlash(p: string): string {
  return p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p;
}

export function resolveProjectWorkspacePath(
  input: ResolveProjectWorkspacePathInput,
): ResolvedProjectWorkspacePath {
  if (input.projectPathOverride) {
    return {
      resolvedAbsolutePath: stripTrailingSlash(input.projectPathOverride),
      source: "project_override",
    };
  }
  if (input.companyRootPath) {
    const root = stripTrailingSlash(input.companyRootPath);
    return {
      resolvedAbsolutePath: `${root}/${input.projectSlug}`,
      source: "company_root",
    };
  }
  const root = stripTrailingSlash(input.systemDefaultRoot);
  return {
    resolvedAbsolutePath: `${root}/${input.companySlug}/${input.projectSlug}`,
    source: "system_default",
  };
}
