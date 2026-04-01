import { createRequire } from "node:module";

type PackageJson = {
  version?: string;
};

// In esbuild bundle, __PAPERCLIP_SERVER_VERSION__ is injected at build time.
// In dev (tsx), the variable is undefined so we fall back to package.json.
declare const __PAPERCLIP_SERVER_VERSION__: string | undefined;

const resolveVersion = (): string => {
  if (typeof __PAPERCLIP_SERVER_VERSION__ !== "undefined") {
    return __PAPERCLIP_SERVER_VERSION__;
  }
  const require = createRequire(import.meta.url);
  const pkg = require("../package.json") as PackageJson;
  return pkg.version ?? "0.0.0";
};

export const serverVersion = resolveVersion();
