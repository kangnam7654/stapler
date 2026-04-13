import { describe, it, expect } from "vitest";
import { draftText } from "./draft.js";

describe("codex-local draftText", () => {
  it("streams response text from JSON events", async () => {
    // Fake codex via node one-liner emitting JSON events with content
    const fakeScript = [
      `console.log(JSON.stringify({type:"agent_message",content:"fo"}))`,
      `console.log(JSON.stringify({type:"agent_message",content:"o"}))`,
      `console.log(JSON.stringify({type:"done"}))`,
    ].join(";");

    const chunks: string[] = [];
    for await (const c of draftText({
      config: {
        command: "node",
        model: "gpt-5",
        codexArgsPrefix: ["-e", fakeScript, "--"],
      },
      messages: [{ role: "user", content: "hi" }],
      signal: new AbortController().signal,
    })) {
      chunks.push(c);
    }
    expect(chunks.join("")).toBe("foo");
  });
});
