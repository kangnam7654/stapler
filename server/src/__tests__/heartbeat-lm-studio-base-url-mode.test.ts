import { describe, expect, it } from "vitest";
import { normalizeAdapterConfigForAdapterType } from "../services/heartbeat.js";

describe("normalizeAdapterConfigForAdapterType", () => {
  it("preserves baseUrl when lm_studio_local inherits the company setting", () => {
    const config = normalizeAdapterConfigForAdapterType("lm_studio_local", {
      baseUrlMode: "company",
      baseUrl: "http://100.89.177.3:1234",
      model: "mistral",
    });

    expect(config).toEqual({
      baseUrlMode: "company",
      baseUrl: "http://100.89.177.3:1234",
      model: "mistral",
    });
  });

  it("keeps baseUrl when lm_studio_local uses a custom URL", () => {
    const config = normalizeAdapterConfigForAdapterType("lm_studio_local", {
      baseUrlMode: "custom",
      baseUrl: "http://127.0.0.1:1234",
      model: "mistral",
    });

    expect(config).toEqual({
      baseUrlMode: "custom",
      baseUrl: "http://127.0.0.1:1234",
      model: "mistral",
    });
  });
});
