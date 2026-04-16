import { describe, it, expect } from "vitest";
import { 
  buildProjectMentionHref, 
  parseProjectMentionHref,
  buildAgentMentionHref,
  parseAgentMentionHref,
  extractProjectMentionIds,
  extractAgentMentionIds
} from "../project-mentions.js";

describe("Mention Processing (Native)", () => {
  it("round-trips project mentions", () => {
    const href = buildProjectMentionHref("my-id", "ff0000");
    const parsed = parseProjectMentionHref(href);
    expect(parsed?.projectId).toBe("my-id");
    expect(parsed?.color).toBe("#ff0000");
  });

  it("handles short hex colors", () => {
    const href = buildProjectMentionHref("p1", "f00");
    const parsed = parseProjectMentionHref(href);
    expect(parsed?.color).toBe("#ff0000");
  });

  it("round-trips agent mentions", () => {
    const href = buildAgentMentionHref("bot-1", "bot");
    const parsed = parseAgentMentionHref(href);
    expect(parsed?.agentId).toBe("bot-1");
    expect(parsed?.icon).toBe("bot");
  });

  it("extracts multiple project IDs from markdown", () => {
    const markdown = "See [P1](project://p1) and [P2](project://p2?c=112233)";
    const ids = extractProjectMentionIds(markdown);
    expect(ids).toContain("p1");
    expect(ids).toContain("p2");
    expect(ids.length).toBe(2);
  });

  it("extracts agent IDs from markdown", () => {
    const markdown = "Hello [Bot](agent://bot-id). [Another](agent://a2?i=sparkles)";
    const ids = extractAgentMentionIds(markdown);
    expect(ids).toEqual(["a2", "bot-id"]); // Alphabetical sort from Rust implementation
  });

  it("handles case-insensitive schemes in parsing", () => {
    const parsed = parseProjectMentionHref("PROJECT://p1");
    expect(parsed?.projectId).toBe("p1");
  });
});
