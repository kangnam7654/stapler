import { describe, it, expect } from "vitest";
import { toWorkspaceSlug } from "../workspace-path/slug.js";

describe("toWorkspaceSlug", () => {
  it("ASCII alphanumeric → kebab-case lower", () => {
    expect(toWorkspaceSlug("Acme Corp")).toBe("acme-corp");
    expect(toWorkspaceSlug("Calculator V2")).toBe("calculator-v2");
  });

  it("strips special chars and collapses dashes", () => {
    expect(toWorkspaceSlug("Foo!! / Bar  Baz")).toBe("foo-bar-baz");
  });

  it("non-ASCII (Korean) → hash fallback with prefix", () => {
    const out = toWorkspaceSlug("디자인팀");
    expect(out).toMatch(/^name-[0-9a-f]{8}$/);
  });

  it("is deterministic for same input", () => {
    expect(toWorkspaceSlug("디자인팀")).toBe(toWorkspaceSlug("디자인팀"));
  });

  it("different non-ASCII inputs produce different hashes", () => {
    expect(toWorkspaceSlug("디자인팀")).not.toBe(toWorkspaceSlug("개발팀"));
  });

  it("trims leading/trailing dashes", () => {
    expect(toWorkspaceSlug("  -hello-  ")).toBe("hello");
  });

  it("empty input → hash of empty string", () => {
    const out = toWorkspaceSlug("");
    expect(out).toMatch(/^name-[0-9a-f]{8}$/);
  });
});
