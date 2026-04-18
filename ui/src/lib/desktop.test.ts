// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { isDesktop } from "./desktop.js";

describe("isDesktop", () => {
  afterEach(() => {
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it("returns false in plain browser", () => {
    expect(isDesktop()).toBe(false);
  });

  it("returns true when Tauri internals present", () => {
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    expect(isDesktop()).toBe(true);
  });
});
