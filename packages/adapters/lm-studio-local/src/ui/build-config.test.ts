import { describe, expect, it } from "vitest";
import { buildLmStudioLocalConfig } from "./build-config.js";

describe("buildLmStudioLocalConfig", () => {
  it("omits baseUrl and baseUrlMode when inheriting the company LM Studio setting", () => {
    const config = buildLmStudioLocalConfig({
      adapterType: "lm_studio_local",
      cwd: "",
      promptTemplate: "",
      model: "mistral",
      thinkingEffort: "",
      chrome: false,
      dangerouslySkipPermissions: false,
      search: false,
      dangerouslyBypassSandbox: false,
      command: "",
      args: "",
      extraArgs: "",
      envVars: "",
      envBindings: {},
      url: "http://localhost:1234",
      lmStudioBaseUrlMode: "company",
      bootstrapPrompt: "",
      maxTurnsPerRun: 300,
      heartbeatEnabled: false,
      intervalSec: 300,
    });

    // Phase 5: baseUrlMode is no longer written. Absence of baseUrl means
    // "inherit from company defaults" at resolve-time.
    expect(config).toEqual({ model: "mistral", timeoutSec: 300 });
    expect(config).not.toHaveProperty("baseUrlMode");
    expect(config).not.toHaveProperty("baseUrl");
  });

  it("stores baseUrl (without baseUrlMode) when using a custom LM Studio URL", () => {
    const config = buildLmStudioLocalConfig({
      adapterType: "lm_studio_local",
      cwd: "",
      promptTemplate: "",
      model: "mistral",
      thinkingEffort: "",
      chrome: false,
      dangerouslySkipPermissions: false,
      search: false,
      dangerouslyBypassSandbox: false,
      command: "",
      args: "",
      extraArgs: "",
      envVars: "",
      envBindings: {},
      url: "http://127.0.0.1:1234",
      lmStudioBaseUrlMode: "custom",
      bootstrapPrompt: "",
      maxTurnsPerRun: 300,
      heartbeatEnabled: false,
      intervalSec: 300,
    });

    expect(config).toEqual({
      baseUrl: "http://127.0.0.1:1234",
      model: "mistral",
      timeoutSec: 300,
    });
    expect(config).not.toHaveProperty("baseUrlMode");
  });

  it("treats a non-empty url without an explicit mode as a custom override", () => {
    const config = buildLmStudioLocalConfig({
      adapterType: "lm_studio_local",
      cwd: "",
      promptTemplate: "",
      model: "phi3",
      thinkingEffort: "",
      chrome: false,
      dangerouslySkipPermissions: false,
      search: false,
      dangerouslyBypassSandbox: false,
      command: "",
      args: "",
      extraArgs: "",
      envVars: "",
      envBindings: {},
      url: "http://192.168.1.5:1234",
      // No lmStudioBaseUrlMode provided — simulates legacy/unset
      lmStudioBaseUrlMode: undefined,
      bootstrapPrompt: "",
      maxTurnsPerRun: 0,
      heartbeatEnabled: false,
      intervalSec: 300,
    });

    expect(config.baseUrl).toBe("http://192.168.1.5:1234");
    expect(config).not.toHaveProperty("baseUrlMode");
    expect(config).not.toHaveProperty("timeoutSec");
  });

  it("omits baseUrl when url is empty and no mode is provided", () => {
    const config = buildLmStudioLocalConfig({
      adapterType: "lm_studio_local",
      cwd: "",
      promptTemplate: "",
      model: "qwen2.5",
      thinkingEffort: "",
      chrome: false,
      dangerouslySkipPermissions: false,
      search: false,
      dangerouslyBypassSandbox: false,
      command: "",
      args: "",
      extraArgs: "",
      envVars: "",
      envBindings: {},
      url: "",
      lmStudioBaseUrlMode: undefined,
      bootstrapPrompt: "",
      maxTurnsPerRun: 0,
      heartbeatEnabled: false,
      intervalSec: 300,
    });

    expect(config).not.toHaveProperty("baseUrl");
    expect(config).not.toHaveProperty("baseUrlMode");
    expect(config.model).toBe("qwen2.5");
  });
});
