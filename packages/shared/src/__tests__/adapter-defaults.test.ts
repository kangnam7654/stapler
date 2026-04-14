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
});
