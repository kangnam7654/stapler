import { describe, it, expect } from "vitest";
import { draftPromptTemplateRequestSchema } from "./agent-prompt-generator.js";

describe("draftPromptTemplateRequestSchema", () => {
  it("accepts minimal valid payload", () => {
    const parsed = draftPromptTemplateRequestSchema.parse({
      adapterType: "ollama_local",
      adapterConfig: { baseUrl: "http://127.0.0.1:11434", model: "llama3" },
      name: "CTO",
      role: "cto",
    });
    expect(parsed.hint).toBeUndefined();
    expect(parsed.title).toBeUndefined();
  });

  it("accepts full payload with hint and reportsTo", () => {
    const parsed = draftPromptTemplateRequestSchema.parse({
      adapterType: "claude_local",
      adapterConfig: { model: "claude-sonnet-4-5" },
      name: "CTO",
      role: "cto",
      title: "Chief Technology Officer",
      reportsTo: "11111111-1111-1111-1111-111111111111",
      hint: "tech lead who unblocks engineers quickly",
    });
    expect(parsed.hint).toBe("tech lead who unblocks engineers quickly");
  });

  it("rejects unknown adapter type", () => {
    expect(() =>
      draftPromptTemplateRequestSchema.parse({
        adapterType: "bogus",
        adapterConfig: {},
        name: "X",
        role: "cto",
      }),
    ).toThrow();
  });

  it("rejects hint longer than 2000 chars", () => {
    expect(() =>
      draftPromptTemplateRequestSchema.parse({
        adapterType: "ollama_local",
        adapterConfig: {},
        name: "X",
        role: "cto",
        hint: "x".repeat(2001),
      }),
    ).toThrow();
  });

  it("rejects empty name", () => {
    expect(() =>
      draftPromptTemplateRequestSchema.parse({
        adapterType: "ollama_local",
        adapterConfig: {},
        name: "",
        role: "cto",
      }),
    ).toThrow();
  });
});
