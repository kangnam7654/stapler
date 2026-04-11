import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");
const RESOURCES_DIR = resolve(__dirname, "../resources");

// Read server version for build-time injection
const serverPkg = JSON.parse(
  readFileSync(resolve(REPO_ROOT, "server/package.json"), "utf8"),
);

const result = await build({
  entryPoints: [resolve(REPO_ROOT, "server/dist/index.js")],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  outfile: resolve(RESOURCES_DIR, "server/dist/index.mjs"),

  // Native modules and their ecosystems — cannot be bundled
  external: [
    // sharp (C++ native bindings)
    "sharp",
    "@img/*",
    // embedded-postgres (PostgreSQL binary)
    "embedded-postgres",
    "@embedded-postgres/*",
    // pg (used by embedded-postgres at runtime)
    "pg",
    "pg-native",
    "pg-pool",
    "pg-types",
    "pg-protocol",
    "pg-connection-string",
    "pgpass",
    // pino — uses worker threads with require.resolve(), cannot be bundled
    "pino",
    "pino-pretty",
    "pino-http",
    "pino-abstract-transport",
    "pino-std-serializers",
    "thread-stream",
    "sonic-boom",
    "on-exit-leak-free",
    "real-require",
    // jsdom — uses __dirname to read CSS/data files at runtime
    "jsdom",
    // vite — dev-only, never used in production
    "vite",
  ],

  // CJS compatibility shim for packages that use require() and __dirname
  banner: {
    js: [
      'import { createRequire as __bundled_createRequire } from "node:module";',
      'import { fileURLToPath as __bundled_fileURLToPath } from "node:url";',
      'import { dirname as __bundled_dirname } from "node:path";',
      "const require = __bundled_createRequire(import.meta.url);",
      "var __filename = __bundled_fileURLToPath(import.meta.url);",
      "var __dirname = __bundled_dirname(__filename);",
    ].join("\n"),
  },

  // Inline JSON files (ko.json, package.json references)
  loader: {
    ".json": "json",
  },

  // Build-time constants
  define: {
    __PAPERCLIP_SERVER_VERSION__: JSON.stringify(serverPkg.version),
  },

  sourcemap: true,
  treeShaking: true,
  logLevel: "info",
  metafile: true,
});

// Write metafile for analysis
writeFileSync(
  resolve(RESOURCES_DIR, "server/dist/meta.json"),
  JSON.stringify(result.metafile),
);

// Report external modules
const externals = new Set();
for (const [path, info] of Object.entries(result.metafile.inputs)) {
  if (info.bytes === 0 && path.startsWith("external:")) {
    externals.add(path.replace("external:", ""));
  }
}
console.log(`\nExternal modules: ${[...externals].sort().join(", ")}`);
