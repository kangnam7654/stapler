import { describe, it, expect } from "vitest";
import { draftText } from "./draft.js";

describe("claude-local draftText", () => {
  it("streams assistant text from stream-json NDJSON", async () => {
    // Fake claude binary via a node one-liner that emits stream-json events
    const fakeScript = [
      `console.log(JSON.stringify({type:"system","subtype":"init"}))`,
      `console.log(JSON.stringify({type:"assistant",message:{content:[{type:"text",text:"hel"}]}}))`,
      `console.log(JSON.stringify({type:"assistant",message:{content:[{type:"text",text:"lo"}]}}))`,
      `console.log(JSON.stringify({type:"result",subtype:"success"}))`,
    ].join(";");

    const chunks: string[] = [];
    for await (const c of draftText({
      config: { command: "node", model: "claude-sonnet-4-5", claudeArgsPrefix: ["-e", fakeScript, "--"] },
      messages: [{ role: "user", content: "hi" }],
      signal: new AbortController().signal,
    })) {
      chunks.push(c);
    }
    expect(chunks.join("")).toBe("hello");
  });

  it("throws when command is missing", async () => {
    const gen = draftText({
      config: { command: "", model: "x" },
      messages: [{ role: "user", content: "hi" }],
      signal: new AbortController().signal,
    });
    await expect(async () => {
      for await (const _ of gen) {}
    }).rejects.toThrow(/command/);
  });
});
