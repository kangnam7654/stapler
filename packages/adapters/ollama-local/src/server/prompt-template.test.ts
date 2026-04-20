import { describe, it, expect } from "vitest";
import { DEFAULT_PROMPT_TEMPLATE } from "./execute.js";

// Regression: the embedded prompt previously filtered the agent's task query
// with `status=in_progress` only, which silently excluded freshly-assigned
// `todo` issues — the agent would query, see nothing, and idle. This test
// pins the canonical "what to work on" set used by the inbox-lite endpoint
// (server/routes/agents.ts: status=todo,in_progress,blocked).
describe("ollama-local DEFAULT_PROMPT_TEMPLATE", () => {
  it("queries the full active-work status set, not just in_progress", () => {
    expect(DEFAULT_PROMPT_TEMPLATE).toContain("status=todo,in_progress,blocked");
    // Defense in depth — no leftover `status=in_progress` literal that would
    // mean the bug crept back in for a different occurrence.
    expect(DEFAULT_PROMPT_TEMPLATE).not.toMatch(/status=in_progress(?![,\w])/);
  });

  it("instructs the agent to query its assigned issues by id", () => {
    expect(DEFAULT_PROMPT_TEMPLATE).toContain("assigneeAgentId={{agent.id}}");
  });
});
