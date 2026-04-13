import { describe, it, expect } from "vitest";
import { buildMetaPrompt } from "../services/prompt-template-generator.js";

describe("buildMetaPrompt", () => {
  it("produces system + user messages with identity", () => {
    const messages = buildMetaPrompt({
      agentName: "CTO",
      agentRole: "cto",
      agentTitle: "Chief Technology Officer",
      company: { name: "Acme", description: "AI startup" },
      otherAgents: [{ name: "CEO", role: "ceo", title: "Chief Executive" }],
      reportsTo: null,
      userHint: "focus on unblocking engineers",
    });

    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("system");
    expect(messages[1].role).toBe("user");

    const user = messages[1].content;
    expect(user).toContain("CTO");
    expect(user).toContain("Chief Technology Officer");
    expect(user).toContain("Acme");
    expect(user).toContain("AI startup");
    expect(user).toContain("CEO");
    expect(user).toContain("focus on unblocking engineers");
  });

  it("includes reportsTo when present", () => {
    const messages = buildMetaPrompt({
      agentName: "E1",
      agentRole: "engineer",
      agentTitle: null,
      company: { name: "Acme", description: null },
      otherAgents: [],
      reportsTo: { name: "CTO", role: "cto", title: "Chief Technology Officer" },
      userHint: null,
    });
    expect(messages[1].content).toContain("Reports to: CTO");
  });

  it("system message instructs compactness and variable usage", () => {
    const messages = buildMetaPrompt({
      agentName: "X",
      agentRole: "cto",
      agentTitle: null,
      company: { name: "Acme", description: null },
      otherAgents: [],
      reportsTo: null,
      userHint: null,
    });
    const sys = messages[0].content;
    expect(sys).toMatch(/compact/i);
    expect(sys).toContain("{{ context.");
    expect(sys).toContain("{{ run.");
    expect(sys).toMatch(/language/i);
  });

  it("omits missing fields gracefully", () => {
    const messages = buildMetaPrompt({
      agentName: "Solo",
      agentRole: "ceo",
      agentTitle: null,
      company: { name: "Acme", description: null },
      otherAgents: [],
      reportsTo: null,
      userHint: null,
    });
    expect(messages[1].content).not.toContain("undefined");
    expect(messages[1].content).not.toContain("null");
  });
});
