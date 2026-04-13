import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["packages/db", "packages/shared", "packages/adapter-utils", "packages/adapters/opencode-local", "packages/adapters/ollama-local", "packages/adapters/lm-studio-local", "server", "ui", "cli"],
  },
});
