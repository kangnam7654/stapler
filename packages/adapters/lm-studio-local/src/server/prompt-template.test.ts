import { describe, it, expect } from "vitest";
import { DEFAULT_PROMPT_TEMPLATE } from "./execute.js";

// Regression: see ollama-local/src/server/prompt-template.test.ts — same
// status-filter bug shipped in both local-LLM adapters.
describe("lm-studio-local DEFAULT_PROMPT_TEMPLATE", () => {
  it("queries the full active-work status set, not just in_progress", () => {
    expect(DEFAULT_PROMPT_TEMPLATE).toContain("status=todo,in_progress,blocked");
    expect(DEFAULT_PROMPT_TEMPLATE).not.toMatch(/status=in_progress(?![,\w])/);
  });

  it("instructs the agent to query its assigned issues by id", () => {
    expect(DEFAULT_PROMPT_TEMPLATE).toContain("assigneeAgentId={{agent.id}}");
  });
});
