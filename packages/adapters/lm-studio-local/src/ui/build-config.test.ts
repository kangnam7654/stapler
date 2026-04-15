import { describe, expect, it } from "vitest";
import { buildLmStudioLocalConfig } from "./build-config.js";

describe("buildLmStudioLocalConfig", () => {
  it("omits baseUrl when inheriting the company LM Studio setting", () => {
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

    expect(config).toEqual({ baseUrlMode: "company", model: "mistral", timeoutSec: 300 });
  });

  it("stores baseUrl when using a custom LM Studio URL", () => {
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
      baseUrlMode: "custom",
      model: "mistral",
      timeoutSec: 300,
    });
  });
});
