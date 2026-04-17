import { describe, it, expect } from "vitest";
import { updateCompanySchema } from "../validators/company.js";

describe("updateCompanySchema adapterDefaults", () => {
  it("accepts valid adapterDefaults", () => {
    const result = updateCompanySchema.safeParse({
      adapterDefaults: {
        lm_studio_local: { baseUrl: "http://192.168.1.10:1234" },
        ollama_local: { baseUrl: "http://192.168.1.10:11434" },
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts null adapterDefaults", () => {
    const result = updateCompanySchema.safeParse({ adapterDefaults: null });
    expect(result.success).toBe(true);
  });

  it("accepts partial adapterDefaults (only one adapter)", () => {
    const result = updateCompanySchema.safeParse({
      adapterDefaults: { ollama_local: { baseUrl: "http://10.0.0.1:11434" } },
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty adapterDefaults object", () => {
    const result = updateCompanySchema.safeParse({ adapterDefaults: {} });
    expect(result.success).toBe(true);
  });

  it("accepts defaults for providers beyond lm_studio_local and ollama_local", () => {
    const result = updateCompanySchema.safeParse({
      adapterDefaults: {
        claude_local: { model: "claude-opus-4-7" },
        codex_local: { model: "gpt-5" },
        cursor: { model: "cursor-default" },
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts full partial AdapterConfig per provider (model, baseUrl, apiKey, nested)", () => {
    const result = updateCompanySchema.safeParse({
      adapterDefaults: {
        lm_studio_local: {
          model: "qwen2.5-coder",
          baseUrl: "http://192.168.1.10:1234",
          apiKey: "optional-key",
          tuning: { temperature: 0.7 },
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts secret_ref binding for apiKey at provider level", () => {
    const result = updateCompanySchema.safeParse({
      adapterDefaults: {
        ollama_local: {
          apiKey: { type: "secret_ref", secretId: "ollama-key" },
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-object values at the provider level", () => {
    const result = updateCompanySchema.safeParse({
      adapterDefaults: { lm_studio_local: "not-an-object" },
    });
    expect(result.success).toBe(false);
  });
});
