#!/usr/bin/env node
// Build the Rust cdylib and rename it to a platform-suffixed `.node`
// file that `index.js` can load.
//
// This is intentionally a small shell-ish script instead of using
// `@napi-rs/cli` — Phase 2 only targets darwin-arm64 and linux-x64,
// and we want to keep the npm dep graph tiny. Phase 3 can migrate to
// `napi build` when we start distributing multi-platform binaries.

import { execSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const crateDir = join(__dirname, "..");
const targetDir = join(crateDir, "..", "target");

const debug = process.argv.includes("--debug");
const profile = debug ? "debug" : "release";
const cargoArgs = debug ? ["build"] : ["build", "--release"];

console.log(`[build-native] cargo ${cargoArgs.join(" ")}`);
execSync(`cargo ${cargoArgs.join(" ")}`, {
  cwd: crateDir,
  stdio: "inherit",
});

const { platform, arch } = process;
let suffix;
let srcName;
if (platform === "darwin") {
  srcName = "libskills_scanner.dylib";
  if (arch === "arm64") suffix = "darwin-arm64";
  else if (arch === "x64") suffix = "darwin-x64";
} else if (platform === "linux") {
  srcName = "libskills_scanner.so";
  if (arch === "x64") suffix = "linux-x64-gnu";
  else if (arch === "arm64") suffix = "linux-arm64-gnu";
} else if (platform === "win32") {
  srcName = "skills_scanner.dll";
  if (arch === "x64") suffix = "win32-x64-msvc";
}

if (!suffix || !srcName) {
  console.error(`[build-native] unsupported platform: ${platform}-${arch}`);
  process.exit(1);
}

const srcPath = join(targetDir, profile, srcName);
const dstPath = join(crateDir, `skills-scanner.${suffix}.node`);

if (!existsSync(srcPath)) {
  console.error(`[build-native] build output not found: ${srcPath}`);
  process.exit(1);
}

copyFileSync(srcPath, dstPath);
console.log(`[build-native] wrote ${dstPath}`);
