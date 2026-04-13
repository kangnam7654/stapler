import { describe, it, expect } from "vitest";
import { draftText } from "./draft.js";

describe("pi-local draftText", () => {
  it("passes stdout through as chunks", async () => {
    const fakeScript = `process.stdout.write("pi-out")`;
    const chunks: string[] = [];
    for await (const c of draftText({
      config: {
        command: "node",
        piArgsPrefix: ["-e", fakeScript, "--"],
      },
      messages: [{ role: "user", content: "hi" }],
      signal: new AbortController().signal,
    })) {
      chunks.push(c);
    }
    expect(chunks.join("")).toBe("pi-out");
  });
});
