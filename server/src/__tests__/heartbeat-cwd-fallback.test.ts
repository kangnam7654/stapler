import { describe, it, expect } from "vitest";
import {
  applyWorkspaceCwdFallback,
  resolveRuntimeConfigCwd,
} from "../services/heartbeat-cwd-fallback.js";

describe("heartbeat-cwd-fallback", () => {
  describe("applyWorkspaceCwdFallback (existing)", () => {
    it("returns config unchanged when cwd already non-empty", () => {
      const result = applyWorkspaceCwdFallback(
        { cwd: "/already/set", model: "x" },
        { companyName: "Co", companyRootPath: null, projectName: "Proj", projectPathOverride: null },
      );
      expect(result.cwd).toBe("/already/set");
    });

    it("fills cwd from project resolver when missing", () => {
      const result = applyWorkspaceCwdFallback(
        { model: "x" },
        { companyName: "Co", companyRootPath: null, projectName: "Proj", projectPathOverride: null },
      );
      expect(typeof result.cwd).toBe("string");
      expect(result.cwd?.length ?? 0).toBeGreaterThan(0);
    });
  });

  describe("resolveRuntimeConfigCwd (new — handles both branches)", () => {
    it("I1: project + company present — uses project resolver", () => {
      const result = resolveRuntimeConfigCwd(
        { model: "x" },
        {
          projectCtx: {
            companyName: "Co",
            companyRootPath: null,
            projectName: "Proj",
            projectPathOverride: null,
          },
          fallbackCwd: "/i/workspaces/a1",
        },
      );
      // Resolved to project path, NOT fallbackCwd.
      expect(result.cwd).not.toBe("/i/workspaces/a1");
      expect(typeof result.cwd).toBe("string");
      expect(result.cwd?.length ?? 0).toBeGreaterThan(0);
    });

    it("I2: no project (goal-direct) — uses fallbackCwd", () => {
      const result = resolveRuntimeConfigCwd(
        { model: "x" },
        {
          projectCtx: null,
          fallbackCwd: "/i/workspaces/a1",
        },
      );
      expect(result.cwd).toBe("/i/workspaces/a1");
    });

    it("I3: no project, empty fallbackCwd — leaves config unchanged", () => {
      const result = resolveRuntimeConfigCwd(
        { model: "x" },
        {
          projectCtx: null,
          fallbackCwd: "",
        },
      );
      expect(result.cwd).toBeUndefined();
    });

    it("user-set config.cwd is preserved across both branches", () => {
      const projectBranch = resolveRuntimeConfigCwd(
        { cwd: "/user/override", model: "x" },
        {
          projectCtx: {
            companyName: "Co",
            companyRootPath: null,
            projectName: "Proj",
            projectPathOverride: null,
          },
          fallbackCwd: "/i/workspaces/a1",
        },
      );
      expect(projectBranch.cwd).toBe("/user/override");

      const noProjectBranch = resolveRuntimeConfigCwd(
        { cwd: "/user/override", model: "x" },
        { projectCtx: null, fallbackCwd: "/i/workspaces/a1" },
      );
      expect(noProjectBranch.cwd).toBe("/user/override");
    });
  });
});
