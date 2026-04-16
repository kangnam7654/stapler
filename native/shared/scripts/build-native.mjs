#!/usr/bin/env node
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
const baseName = "stapler_native_shared";

if (platform === "darwin") {
  srcName = `lib${baseName}.dylib`;
  if (arch === "arm64") suffix = "darwin-arm64";
  else if (arch === "x64") suffix = "darwin-x64";
} else if (platform === "linux") {
  srcName = `lib${baseName}.so`;
  if (arch === "x64") suffix = "linux-x64-gnu";
  else if (arch === "arm64") suffix = "linux-arm64-gnu";
} else if (platform === "win32") {
  srcName = `${baseName}.dll`;
  if (arch === "x64") suffix = "win32-x64-msvc";
}

if (!suffix || !srcName) {
  console.error(`[build-native] unsupported platform: ${platform}-${arch}`);
  process.exit(1);
}

const srcPath = join(targetDir, profile, srcName);
const dstPath = join(crateDir, `shared-native.${suffix}.node`);

if (!existsSync(srcPath)) {
  console.error(`[build-native] build output not found: ${srcPath}`);
  process.exit(1);
}

copyFileSync(srcPath, dstPath);
console.log(`[build-native] wrote ${dstPath}`);
