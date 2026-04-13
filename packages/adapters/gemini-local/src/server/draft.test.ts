import { describe, it, expect } from "vitest";
import { draftText } from "./draft.js";

describe("gemini-local draftText", () => {
  it("passes plain-text stdout through as chunks", async () => {
    const fakeScript = `process.stdout.write("gem-out")`;
    const chunks: string[] = [];
    for await (const c of draftText({
      config: {
        command: "node",
        model: "gemini-2.0-flash",
        geminiArgsPrefix: ["-e", fakeScript, "--"],
      },
      messages: [{ role: "user", content: "hi" }],
      signal: new AbortController().signal,
    })) {
      chunks.push(c);
    }
    expect(chunks.join("")).toBe("gem-out");
  });
});
