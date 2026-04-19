import { describe, expect, it } from "vitest";
import {
  COMPANY_DEFAULT_FIELDS,
  isInScopeAdapterType,
  buildCompanyAdapterDefaultsPatch,
  stripCompanyDefaultFields,
} from "./onboarding-wizard-helpers";

describe("COMPANY_DEFAULT_FIELDS", () => {
  it("covers exactly 4 in-scope adapter types", () => {
    expect(Object.keys(COMPANY_DEFAULT_FIELDS).sort()).toEqual([
      "claude_local",
      "codex_local",
      "lm_studio_local",
      "ollama_local",
    ]);
  });

  it("LM Studio and Ollama include both baseUrl and model; Claude/Codex include model only", () => {
    expect([...COMPANY_DEFAULT_FIELDS.lm_studio_local]).toEqual(["baseUrl", "model"]);
    expect([...COMPANY_DEFAULT_FIELDS.ollama_local]).toEqual(["baseUrl", "model"]);
    expect([...COMPANY_DEFAULT_FIELDS.claude_local]).toEqual(["model"]);
    expect([...COMPANY_DEFAULT_FIELDS.codex_local]).toEqual(["model"]);
  });
});

describe("isInScopeAdapterType", () => {
  it("returns true for all 4 in-scope adapters", () => {
    expect(isInScopeAdapterType("lm_studio_local")).toBe(true);
    expect(isInScopeAdapterType("ollama_local")).toBe(true);
    expect(isInScopeAdapterType("claude_local")).toBe(true);
    expect(isInScopeAdapterType("codex_local")).toBe(true);
  });

  it("returns false for out-of-scope adapters", () => {
    expect(isInScopeAdapterType("gemini_local")).toBe(false);
    expect(isInScopeAdapterType("cursor")).toBe(false);
    expect(isInScopeAdapterType("openclaw_gateway")).toBe(false);
    expect(isInScopeAdapterType("http")).toBe(false);
    expect(isInScopeAdapterType("hermes_local")).toBe(false);
    expect(isInScopeAdapterType("opencode_local")).toBe(false);
    expect(isInScopeAdapterType("pi_local")).toBe(false);
    expect(isInScopeAdapterType("totally_unknown")).toBe(false);
  });
});

describe("buildCompanyAdapterDefaultsPatch", () => {
  // H-1
  it("includes both baseUrl and model for LM Studio when both provided", () => {
    expect(
      buildCompanyAdapterDefaultsPatch("lm_studio_local", {
        url: "http://10.0.0.1:1234",
        model: "qwen-7b",
      }),
    ).toEqual({ baseUrl: "http://10.0.0.1:1234", model: "qwen-7b" });
  });

  // H-2
  it("returns null for LM Studio when both inputs are blank/whitespace", () => {
    expect(
      buildCompanyAdapterDefaultsPatch("lm_studio_local", { url: "  ", model: "" }),
    ).toBeNull();
  });

  // H-3
  it("ignores URL for Claude (model-only adapter)", () => {
    expect(
      buildCompanyAdapterDefaultsPatch("claude_local", {
        url: "http://should-be-ignored",
        model: "sonnet-4",
      }),
    ).toEqual({ model: "sonnet-4" });
  });

  // H-4
  it("returns null for adapters not in scope", () => {
    expect(
      buildCompanyAdapterDefaultsPatch("gemini_local", { url: "http://x", model: "y" }),
    ).toBeNull();
    expect(
      buildCompanyAdapterDefaultsPatch("openclaw_gateway", { url: "ws://x", model: "" }),
    ).toBeNull();
  });

  it("trims whitespace from values it keeps", () => {
    expect(
      buildCompanyAdapterDefaultsPatch("ollama_local", {
        url: "  http://10.0.0.1:11434  ",
        model: "  llama3.2  ",
      }),
    ).toEqual({ baseUrl: "http://10.0.0.1:11434", model: "llama3.2" });
  });

  it("includes only the field that is non-empty (Codex with model only)", () => {
    expect(
      buildCompanyAdapterDefaultsPatch("codex_local", { url: "", model: "gpt-5" }),
    ).toEqual({ model: "gpt-5" });
  });
});

describe("stripCompanyDefaultFields", () => {
  // H-5
  it("removes baseUrl and model from LM Studio config but preserves other keys", () => {
    expect(
      stripCompanyDefaultFields("lm_studio_local", {
        baseUrl: "x",
        model: "y",
        lmStudioBaseUrlMode: "company",
        env: { FOO: "bar" },
      }),
    ).toEqual({
      lmStudioBaseUrlMode: "company",
      env: { FOO: "bar" },
    });
  });

  it("removes only model for Claude (model-only adapter)", () => {
    expect(
      stripCompanyDefaultFields("claude_local", {
        model: "sonnet-4",
        dangerouslySkipPermissions: true,
      }),
    ).toEqual({ dangerouslySkipPermissions: true });
  });

  // H-6
  it("returns config unchanged for out-of-scope adapter (Gemini)", () => {
    const input = { model: "gemini-pro", command: "gemini" };
    expect(stripCompanyDefaultFields("gemini_local", input)).toEqual(input);
  });

  it("does not mutate the input object", () => {
    const input = { baseUrl: "x", model: "y", other: 1 };
    const original = { ...input };
    stripCompanyDefaultFields("lm_studio_local", input);
    expect(input).toEqual(original);
  });
});
