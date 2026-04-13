import { describe, it, expect } from "vitest";
import { draftHermes } from "../adapters/hermes-draft.js";

describe("hermes draft shim", () => {
  it("passes stdout through as chunks", async () => {
    const fakeScript = `process.stdout.write("herm-out")`;
    const chunks: string[] = [];
    for await (const c of draftHermes({
      config: {
        command: "node",
        hermesArgsPrefix: ["-e", fakeScript, "--"],
      },
      messages: [{ role: "user", content: "hi" }],
      signal: new AbortController().signal,
    })) {
      chunks.push(c);
    }
    expect(chunks.join("")).toBe("herm-out");
  });
});
