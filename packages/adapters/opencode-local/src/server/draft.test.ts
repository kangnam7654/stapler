import { describe, it, expect } from "vitest";
import { draftText } from "./draft.js";

describe("opencode-local draftText", () => {
  it("passes stdout through as chunks", async () => {
    const fakeScript = `process.stdout.write("oc-out")`;
    const chunks: string[] = [];
    for await (const c of draftText({
      config: {
        command: "node",
        model: "provider/model-id",
        opencodeArgsPrefix: ["-e", fakeScript, "--"],
      },
      messages: [{ role: "user", content: "hi" }],
      signal: new AbortController().signal,
    })) {
      chunks.push(c);
    }
    expect(chunks.join("")).toBe("oc-out");
  });
});
