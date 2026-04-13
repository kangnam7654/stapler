import { describe, it, expect } from "vitest";
import { draftText } from "./draft.js";

describe("cursor-local draftText", () => {
  it("streams assistant text from NDJSON", async () => {
    const fakeScript = [
      `console.log(JSON.stringify({type:"assistant",message:{content:[{type:"text",text:"cu"}]}}))`,
      `console.log(JSON.stringify({type:"assistant",message:{content:[{type:"text",text:"rsor"}]}}))`,
    ].join(";");

    const chunks: string[] = [];
    for await (const c of draftText({
      config: {
        command: "node",
        model: "claude-sonnet-4-5",
        cursorArgsPrefix: ["-e", fakeScript, "--"],
      },
      messages: [{ role: "user", content: "hi" }],
      signal: new AbortController().signal,
    })) {
      chunks.push(c);
    }
    expect(chunks.join("")).toBe("cursor");
  });

  it("flushes the last line when CLI emits no trailing newline", async () => {
    const fakeScript = `process.stdout.write(JSON.stringify({type:"assistant",message:{content:[{type:"text",text:"tail"}]}}))`;
    const chunks: string[] = [];
    for await (const c of draftText({
      config: {
        command: "node",
        cursorArgsPrefix: ["-e", fakeScript, "--"],
      },
      messages: [{ role: "user", content: "hi" }],
      signal: new AbortController().signal,
    })) chunks.push(c);
    expect(chunks.join("")).toBe("tail");
  });
});
