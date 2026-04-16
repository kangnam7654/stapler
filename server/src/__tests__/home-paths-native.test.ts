import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import { 
  resolveHomeAwarePath, 
  resolvePaperclipInstanceRoot,
  resolveDefaultAgentWorkspaceDir,
  resolveManagedProjectWorkspaceDir
} from "../home-paths.js";

describe("Path Utilities (Native Integration)", () => {
  it("resolves home-aware paths", () => {
    const home = os.homedir();
    expect(resolveHomeAwarePath("~")).toBe(home);
    expect(resolveHomeAwarePath("~/projects")).toBe(path.resolve(home, "projects"));
    expect(resolveHomeAwarePath("/abs/path")).toBe(path.resolve("/abs/path"));
  });

  it("resolves managed project workspace dirs with sanitization", () => {
    const root = resolvePaperclipInstanceRoot();
    const dir = resolveManagedProjectWorkspaceDir({
      companyId: "My Company",
      projectId: "Project #1",
      repoName: "Repo.Name"
    });
    
    // Check segments are sanitized via Rust
    expect(dir).toContain("My-Company");
    expect(dir).toContain("Project-1");
    expect(dir).toContain("Repo.Name");
    expect(dir).toBe(path.resolve(root, "projects", "My-Company", "Project-1", "Repo.Name"));
  });

  it("resolves default agent workspace dir", () => {
    const root = resolvePaperclipInstanceRoot();
    const dir = resolveDefaultAgentWorkspaceDir("agent-123");
    expect(dir).toBe(path.resolve(root, "workspaces", "agent-123"));
  });

  it("throws on invalid agent IDs in workspace dir", () => {
    expect(() => resolveDefaultAgentWorkspaceDir("agent/123")).toThrow();
    expect(() => resolveDefaultAgentWorkspaceDir("")).toThrow();
  });
});
