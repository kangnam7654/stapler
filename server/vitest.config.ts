import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    isolate: true,
    testTimeout: 30000,
    hookTimeout: 60000,
    exclude: [...configDefaults.exclude, "__tests__/**/*.js"],
  },
});
