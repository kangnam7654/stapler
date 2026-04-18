import { describe, it, expect, vi, beforeEach } from "vitest";

const mockResolve = vi.hoisted(() => vi.fn());
vi.mock("../services/workspace-path-service.js", () => ({
  resolveForProject: mockResolve,
  systemDefaultRoot: () => "/tmp/Stapler",
}));

import { applyWorkspaceCwdFallback } from "../services/heartbeat-cwd-fallback.js";

beforeEach(() => mockResolve.mockReset());

describe("applyWorkspaceCwdFallback", () => {
  it("respects explicit cwd", () => {
    const out = applyWorkspaceCwdFallback(
      { cwd: "/explicit/cwd", model: "x" },
      { companyName: "Acme", projectName: "Calc", companyRootPath: null, projectPathOverride: null },
    );
    expect(out.cwd).toBe("/explicit/cwd");
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it("injects resolved path when cwd missing", () => {
    mockResolve.mockReturnValue({ resolvedAbsolutePath: "/work/acme/calc", source: "company_root" });
    const out = applyWorkspaceCwdFallback(
      { model: "x" },
      { companyName: "Acme", projectName: "Calc", companyRootPath: "/work/acme", projectPathOverride: null },
    );
    expect(out.cwd).toBe("/work/acme/calc");
    expect(mockResolve).toHaveBeenCalledOnce();
  });

  it("injects when cwd is empty string", () => {
    mockResolve.mockReturnValue({ resolvedAbsolutePath: "/work/acme/calc", source: "company_root" });
    const out = applyWorkspaceCwdFallback(
      { cwd: "", model: "x" },
      { companyName: "Acme", projectName: "Calc", companyRootPath: "/work/acme", projectPathOverride: null },
    );
    expect(out.cwd).toBe("/work/acme/calc");
  });

  it("injects when cwd is whitespace only", () => {
    mockResolve.mockReturnValue({ resolvedAbsolutePath: "/work/acme/calc", source: "company_root" });
    const out = applyWorkspaceCwdFallback(
      { cwd: "   ", model: "x" },
      { companyName: "Acme", projectName: "Calc", companyRootPath: "/work/acme", projectPathOverride: null },
    );
    expect(out.cwd).toBe("/work/acme/calc");
  });
});
