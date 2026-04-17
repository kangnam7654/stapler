import { describe, it, expect } from "vitest";
import {
  deepMergeAdapterConfig,
  isSecretRef,
  resolveAgentAdapterConfig,
} from "../adapter-config.js";

describe("isSecretRef", () => {
  it("detects secret_ref objects", () => {
    expect(isSecretRef({ type: "secret_ref", secretId: "abc" })).toBe(true);
    expect(isSecretRef({ type: "secret_ref", secretId: "abc", version: 1 })).toBe(true);
    expect(isSecretRef({ type: "secret_ref", secretId: "abc", version: "latest" })).toBe(true);
  });

  it("rejects non-secret_ref objects", () => {
    expect(isSecretRef({ type: "plain", value: "x" })).toBe(false);
    expect(isSecretRef({ secretId: "abc" })).toBe(false);
    expect(isSecretRef({})).toBe(false);
    expect(isSecretRef(null)).toBe(false);
    expect(isSecretRef(undefined)).toBe(false);
    expect(isSecretRef("string")).toBe(false);
    expect(isSecretRef(42)).toBe(false);
  });
});

describe("deepMergeAdapterConfig", () => {
  it("returns defaults when overrides is empty", () => {
    expect(deepMergeAdapterConfig({ model: "a", baseUrl: "http://x" }, {})).toEqual({
      model: "a",
      baseUrl: "http://x",
    });
  });

  it("returns overrides when defaults is empty", () => {
    expect(deepMergeAdapterConfig({}, { model: "b" })).toEqual({ model: "b" });
  });

  it("override value wins over defaults value", () => {
    expect(deepMergeAdapterConfig({ model: "a" }, { model: "b" })).toEqual({ model: "b" });
  });

  it("undefined in overrides falls back to defaults", () => {
    // explicit undefined is treated as "not overridden"
    const result = deepMergeAdapterConfig({ model: "a" }, { model: undefined });
    expect(result).toEqual({ model: "a" });
  });

  it("null in overrides falls back to defaults (inherit semantics)", () => {
    // null means "remove override, revert to inherited"
    const result = deepMergeAdapterConfig({ model: "a" }, { model: null });
    expect(result).toEqual({ model: "a" });
  });

  it("null with no defaults produces missing key", () => {
    const result = deepMergeAdapterConfig({}, { model: null });
    expect(result).toEqual({});
  });

  it("recursively merges nested plain objects", () => {
    expect(
      deepMergeAdapterConfig(
        { tuning: { temperature: 0.7, topP: 1.0 } },
        { tuning: { temperature: 0.2 } },
      ),
    ).toEqual({ tuning: { temperature: 0.2, topP: 1.0 } });
  });

  it("replaces arrays entirely (no element-level merge)", () => {
    expect(
      deepMergeAdapterConfig({ stopSequences: ["a", "b", "c"] }, { stopSequences: ["x"] }),
    ).toEqual({ stopSequences: ["x"] });
  });

  it("treats secret_ref objects as leaves (full replace, no key merge)", () => {
    const defaults = {
      env: { API_KEY: { type: "secret_ref", secretId: "old-secret" } },
    };
    const overrides = {
      env: { API_KEY: { type: "secret_ref", secretId: "new-secret" } },
    };
    expect(deepMergeAdapterConfig(defaults, overrides)).toEqual({
      env: { API_KEY: { type: "secret_ref", secretId: "new-secret" } },
    });
  });

  it("secret_ref in defaults preserved when override omits the field", () => {
    const defaults = {
      env: { API_KEY: { type: "secret_ref", secretId: "shared" } },
    };
    const overrides = {
      env: { OTHER: "plain-value" },
    };
    expect(deepMergeAdapterConfig(defaults, overrides)).toEqual({
      env: {
        API_KEY: { type: "secret_ref", secretId: "shared" },
        OTHER: "plain-value",
      },
    });
  });

  it("preserves defaults keys not mentioned in overrides", () => {
    expect(
      deepMergeAdapterConfig(
        { model: "a", baseUrl: "http://x", apiKey: "k" },
        { model: "b" },
      ),
    ).toEqual({ model: "b", baseUrl: "http://x", apiKey: "k" });
  });

  it("adds override keys not in defaults", () => {
    expect(
      deepMergeAdapterConfig({ model: "a" }, { baseUrl: "http://x" }),
    ).toEqual({ model: "a", baseUrl: "http://x" });
  });

  it("handles deeply nested structures", () => {
    expect(
      deepMergeAdapterConfig(
        { a: { b: { c: 1, d: 2 } } },
        { a: { b: { c: 10 } } },
      ),
    ).toEqual({ a: { b: { c: 10, d: 2 } } });
  });

  it("does not mutate inputs", () => {
    const defaults = { tuning: { temperature: 0.7 } };
    const overrides = { tuning: { temperature: 0.2 } };
    const defaultsSnapshot = JSON.parse(JSON.stringify(defaults));
    const overridesSnapshot = JSON.parse(JSON.stringify(overrides));
    deepMergeAdapterConfig(defaults, overrides);
    expect(defaults).toEqual(defaultsSnapshot);
    expect(overrides).toEqual(overridesSnapshot);
  });
});

describe("resolveAgentAdapterConfig", () => {
  it("returns agent config when no company defaults for this provider", () => {
    const resolved = resolveAgentAdapterConfig(
      { adapterType: "lm_studio_local", adapterConfig: { model: "qwen2.5" } },
      { adapterDefaults: null },
    );
    expect(resolved).toEqual({ model: "qwen2.5" });
  });

  it("returns agent config when company has defaults for a different provider", () => {
    const resolved = resolveAgentAdapterConfig(
      { adapterType: "lm_studio_local", adapterConfig: { model: "qwen2.5" } },
      { adapterDefaults: { ollama_local: { model: "llama3.2" } } },
    );
    expect(resolved).toEqual({ model: "qwen2.5" });
  });

  it("merges company defaults when agent has no overrides for that field", () => {
    const resolved = resolveAgentAdapterConfig(
      { adapterType: "lm_studio_local", adapterConfig: { baseUrl: "http://agent" } },
      {
        adapterDefaults: {
          lm_studio_local: { model: "qwen2.5", baseUrl: "http://default" },
        },
      },
    );
    expect(resolved).toEqual({ model: "qwen2.5", baseUrl: "http://agent" });
  });

  it("inherits model when agent adapterConfig omits it", () => {
    const resolved = resolveAgentAdapterConfig(
      { adapterType: "lm_studio_local", adapterConfig: {} },
      { adapterDefaults: { lm_studio_local: { model: "qwen2.5" } } },
    );
    expect(resolved).toEqual({ model: "qwen2.5" });
  });

  it("agent override wins over company default", () => {
    const resolved = resolveAgentAdapterConfig(
      {
        adapterType: "lm_studio_local",
        adapterConfig: { model: "agent-custom" },
      },
      { adapterDefaults: { lm_studio_local: { model: "company-default" } } },
    );
    expect(resolved).toEqual({ model: "agent-custom" });
  });

  it("treats null in agent config as inherit (falls back to defaults)", () => {
    const resolved = resolveAgentAdapterConfig(
      { adapterType: "lm_studio_local", adapterConfig: { model: null } },
      { adapterDefaults: { lm_studio_local: { model: "inherited" } } },
    );
    expect(resolved).toEqual({ model: "inherited" });
  });

  it("handles nested tuning params inheritance", () => {
    const resolved = resolveAgentAdapterConfig(
      {
        adapterType: "claude_local",
        adapterConfig: { tuning: { temperature: 0.2 } },
      },
      {
        adapterDefaults: {
          claude_local: { tuning: { temperature: 0.7, maxTokens: 2000 } },
        },
      },
    );
    expect(resolved).toEqual({ tuning: { temperature: 0.2, maxTokens: 2000 } });
  });

  it("handles null adapterDefaults on company", () => {
    const resolved = resolveAgentAdapterConfig(
      { adapterType: "lm_studio_local", adapterConfig: { model: "x" } },
      { adapterDefaults: null },
    );
    expect(resolved).toEqual({ model: "x" });
  });

  it("handles undefined adapterConfig on agent", () => {
    const resolved = resolveAgentAdapterConfig(
      { adapterType: "lm_studio_local", adapterConfig: undefined as any },
      { adapterDefaults: { lm_studio_local: { model: "default" } } },
    );
    expect(resolved).toEqual({ model: "default" });
  });
});
