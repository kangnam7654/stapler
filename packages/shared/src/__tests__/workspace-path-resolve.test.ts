import { describe, it, expect } from "vitest";
import { resolveProjectWorkspacePath } from "../workspace-path/resolve.js";

const DEFAULT_ROOT = "/home/user/Stapler";

describe("resolveProjectWorkspacePath", () => {
  it("project override wins", () => {
    const r = resolveProjectWorkspacePath({
      companySlug: "acme",
      projectSlug: "calc",
      companyRootPath: "/work/acme",
      projectPathOverride: "/dev/legacy",
      systemDefaultRoot: DEFAULT_ROOT,
    });
    expect(r.resolvedAbsolutePath).toBe("/dev/legacy");
    expect(r.source).toBe("project_override");
  });

  it("company root + project slug", () => {
    const r = resolveProjectWorkspacePath({
      companySlug: "acme",
      projectSlug: "calc",
      companyRootPath: "/work/acme",
      projectPathOverride: null,
      systemDefaultRoot: DEFAULT_ROOT,
    });
    expect(r.resolvedAbsolutePath).toBe("/work/acme/calc");
    expect(r.source).toBe("company_root");
  });

  it("system default fallback when both null", () => {
    const r = resolveProjectWorkspacePath({
      companySlug: "acme",
      projectSlug: "calc",
      companyRootPath: null,
      projectPathOverride: null,
      systemDefaultRoot: DEFAULT_ROOT,
    });
    expect(r.resolvedAbsolutePath).toBe("/home/user/Stapler/acme/calc");
    expect(r.source).toBe("system_default");
  });

  it("strips trailing slash from company root", () => {
    const r = resolveProjectWorkspacePath({
      companySlug: "acme",
      projectSlug: "calc",
      companyRootPath: "/work/acme/",
      projectPathOverride: null,
      systemDefaultRoot: DEFAULT_ROOT,
    });
    expect(r.resolvedAbsolutePath).toBe("/work/acme/calc");
  });

  it("strips trailing slash from override", () => {
    const r = resolveProjectWorkspacePath({
      companySlug: "acme",
      projectSlug: "calc",
      companyRootPath: null,
      projectPathOverride: "/dev/legacy/",
      systemDefaultRoot: DEFAULT_ROOT,
    });
    expect(r.resolvedAbsolutePath).toBe("/dev/legacy");
  });

  it("strips trailing slash from system default root", () => {
    const r = resolveProjectWorkspacePath({
      companySlug: "acme",
      projectSlug: "calc",
      companyRootPath: null,
      projectPathOverride: null,
      systemDefaultRoot: "/home/user/Stapler/",
    });
    expect(r.resolvedAbsolutePath).toBe("/home/user/Stapler/acme/calc");
  });

  it("treats empty-string override as unset (falls through to company root)", () => {
    const r = resolveProjectWorkspacePath({
      companySlug: "acme",
      projectSlug: "calc",
      companyRootPath: "/work/acme",
      projectPathOverride: "",
      systemDefaultRoot: DEFAULT_ROOT,
    });
    expect(r.resolvedAbsolutePath).toBe("/work/acme/calc");
    expect(r.source).toBe("company_root");
  });

  it("treats empty-string company root as unset (falls through to system default)", () => {
    const r = resolveProjectWorkspacePath({
      companySlug: "acme",
      projectSlug: "calc",
      companyRootPath: "",
      projectPathOverride: null,
      systemDefaultRoot: DEFAULT_ROOT,
    });
    expect(r.resolvedAbsolutePath).toBe("/home/user/Stapler/acme/calc");
    expect(r.source).toBe("system_default");
  });

  it("preserves filesystem root '/' as system default (no over-strip)", () => {
    const r = resolveProjectWorkspacePath({
      companySlug: "acme",
      projectSlug: "calc",
      companyRootPath: null,
      projectPathOverride: null,
      systemDefaultRoot: "/",
    });
    expect(r.resolvedAbsolutePath).toBe("//acme/calc");
  });
});
