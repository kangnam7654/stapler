import { describe, it, expectTypeOf } from "vitest";
import type {
  ServerAdapterModule,
  AdapterDraftTextContext,
} from "./types.js";

describe("ServerAdapterModule.draftText", () => {
  it("is an optional async iterable producer", () => {
    const adapter: ServerAdapterModule = {
      type: "test",
      async execute() { throw new Error(); },
      async testEnvironment() { throw new Error(); },
      async *draftText(_ctx: AdapterDraftTextContext): AsyncIterable<string> {
        yield "hello";
      },
    };
    expectTypeOf(adapter.draftText).toEqualTypeOf<
      ((ctx: AdapterDraftTextContext) => AsyncIterable<string>) | undefined
    >();
    // Confirm an adapter without draftText is also valid (optional hook).
    const minimal: ServerAdapterModule = {
      type: "minimal",
      async execute() { throw new Error(); },
      async testEnvironment() { throw new Error(); },
    };
    expectTypeOf(minimal.draftText).toEqualTypeOf<
      ((ctx: AdapterDraftTextContext) => AsyncIterable<string>) | undefined
    >();
  });
});
