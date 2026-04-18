import { describe, it, expect } from "vitest";
import { workspacePathSchema } from "../validators/workspace-path.js";

describe("workspacePathSchema", () => {
  it("accepts absolute POSIX path", () => {
    const r = workspacePathSchema.safeParse("/home/user/work");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe("/home/user/work");
  });

  it("accepts tilde-prefixed path", () => {
    const r = workspacePathSchema.safeParse("~/Stapler/acme");
    expect(r.success).toBe(true);
  });

  it("accepts null", () => {
    const r = workspacePathSchema.safeParse(null);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBeNull();
  });

  it("normalizes empty string to null", () => {
    const r = workspacePathSchema.safeParse("");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBeNull();
  });

  it("normalizes whitespace-only string to null", () => {
    const r = workspacePathSchema.safeParse("   ");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBeNull();
  });

  it("rejects relative path", () => {
    const r = workspacePathSchema.safeParse("relative/path");
    expect(r.success).toBe(false);
  });

  it("rejects path > 1024 chars", () => {
    const long = "/" + "x".repeat(1024);
    const r = workspacePathSchema.safeParse(long);
    expect(r.success).toBe(false);
  });

  it("rejects bare tilde (no slash)", () => {
    const r = workspacePathSchema.safeParse("~");
    expect(r.success).toBe(false);
  });

  it("accepts boundary case: exactly 1024 chars", () => {
    const path = "/" + "x".repeat(1023); // 1024 total
    const r = workspacePathSchema.safeParse(path);
    expect(r.success).toBe(true);
  });

  it("rejects boundary case: 1025 chars", () => {
    const path = "/" + "x".repeat(1024); // 1025 total — duplicate of original >1024 test, but explicitly named
    const r = workspacePathSchema.safeParse(path);
    expect(r.success).toBe(false);
  });
});
