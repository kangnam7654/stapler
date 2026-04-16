import { describe, it, expect } from "vitest";
import { normalizeProjectUrlKey, deriveProjectUrlKey } from "../project-url-key.js";
import { normalizeAgentUrlKey, isUuidLike } from "../agent-url-key.js";

describe("URL Key Normalization (Native)", () => {
  it("normalizes project keys", () => {
    expect(normalizeProjectUrlKey("Hello World")).toBe("hello-world");
    expect(normalizeProjectUrlKey("  Foo #! Bar  ")).toBe("foo-bar");
    expect(normalizeProjectUrlKey("---foo---")).toBe("foo");
    expect(normalizeProjectUrlKey("!!!")).toBeNull();
  });

  it("derives project keys", () => {
    expect(deriveProjectUrlKey("My Project")).toBe("my-project");
    expect(deriveProjectUrlKey(null, "Fallback")).toBe("fallback");
    expect(deriveProjectUrlKey(null, null)).toBe("project");
  });

  it("normalizes agent keys", () => {
    expect(normalizeAgentUrlKey("My Agent")).toBe("my-agent");
    expect(normalizeAgentUrlKey("")).toBeNull();
  });

  it("checks UUID likeness", () => {
    expect(isUuidLike("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isUuidLike("  550e8400-e29b-41d4-a716-446655440000  ")).toBe(true);
    expect(isUuidLike("not-a-uuid")).toBe(false);
  });
});
