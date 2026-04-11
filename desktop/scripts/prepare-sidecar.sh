#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DESKTOP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$DESKTOP_DIR/.." && pwd)"
RESOURCES_DIR="$DESKTOP_DIR/resources"

echo "=== Paperclip Desktop: Preparing sidecar bundle ==="

# Step 1: Build all packages (server + UI)
echo "[1/6] Building packages..."
cd "$REPO_ROOT"
pnpm -r build

# Step 2: esbuild bundle
echo "[2/6] Bundling server with esbuild..."
rm -rf "$RESOURCES_DIR/server"
mkdir -p "$RESOURCES_DIR/server/dist"
node "$SCRIPT_DIR/esbuild-server.mjs"

# Step 3: Runtime resource files (not bundleable)
echo "[3/6] Copying runtime resources..."

# 3a: drizzle migrations — bundle's import.meta.url resolves to dist/index.mjs,
#     so "./migrations" → dist/migrations/
mkdir -p "$RESOURCES_DIR/server/dist/migrations/meta"
cp "$REPO_ROOT/packages/db/src/migrations/"*.sql "$RESOURCES_DIR/server/dist/migrations/"
cp "$REPO_ROOT/packages/db/src/migrations/meta/_journal.json" "$RESOURCES_DIR/server/dist/migrations/meta/"

# 3b: ko.json — i18n uses createRequire("./ko.json") which esbuild can't inline
cp "$REPO_ROOT/server/src/i18n/ko.json" "$RESOURCES_DIR/server/dist/ko.json"

# 3c: onboarding-assets — dist/index.mjs → "../onboarding-assets/" = server/onboarding-assets/
mkdir -p "$RESOURCES_DIR/server/onboarding-assets"
cp -r "$REPO_ROOT/server/dist/onboarding-assets/." "$RESOURCES_DIR/server/onboarding-assets/"

# 3c: skills — routes/access.ts resolves "../../skills" from dist/ = server/../skills/ but
#     also tries process.cwd()/skills/. Copy to server/skills/ for the "../../skills" path
#     from dist/index.mjs (dist/../../skills = server/../skills → won't work).
#     Instead copy to a location that the "published" path resolves: dist/../../skills = resources/skills/
mkdir -p "$RESOURCES_DIR/skills"
if [ -d "$REPO_ROOT/skills" ]; then
  cp -r "$REPO_ROOT/skills/." "$RESOURCES_DIR/skills/"
fi

# Step 4: UI dist
echo "[4/6] Copying UI build output..."
if [ -d "$REPO_ROOT/ui/dist" ]; then
  cp -r "$REPO_ROOT/ui/dist" "$RESOURCES_DIR/server/ui-dist"
else
  echo "ERROR: ui/dist not found."
  exit 1
fi

# Step 5: External native/unbundleable modules only
echo "[5/6] Installing external modules..."
NATIVE_NM="$RESOURCES_DIR/server/node_modules"
rm -rf "$NATIVE_NM"
mkdir -p "$NATIVE_NM"

# Create a minimal package.json for npm install of external modules only
cat > "$RESOURCES_DIR/server/package.json" <<'PKGJSON'
{
  "name": "paperclip-server-externals",
  "private": true,
  "dependencies": {
    "sharp": "^0.34.5",
    "embedded-postgres": "^18.1.0-beta.16",
    "pg": "^8.18.0",
    "pino": "^9.14.0",
    "pino-pretty": "^13.1.3",
    "pino-http": "^10.4.0",
    "jsdom": "^28.1.0",
    "ws": "^8.19.0"
  }
}
PKGJSON

cd "$RESOURCES_DIR/server"
npm install --production --ignore-scripts --legacy-peer-deps 2>&1 | tail -5
# Rebuild native modules (sharp bindings + embedded-postgres binaries)
npm rebuild 2>&1 | tail -5

echo "  Native modules copied."
du -sh "$NATIVE_NM"

# Step 6: Node.js binary
echo "[6/6] Downloading Node.js binary..."
bash "$SCRIPT_DIR/download-node.sh" "$RESOURCES_DIR/node"

echo ""
echo "=== Sidecar bundle ready ==="
echo "  Bundle:        $(du -sh "$RESOURCES_DIR/server/dist/index.mjs" | cut -f1)"
echo "  Native modules: $(du -sh "$NATIVE_NM" | cut -f1)"
echo "  UI dist:       $(du -sh "$RESOURCES_DIR/server/ui-dist" | cut -f1)"
echo "  Node.js:       $(du -sh "$RESOURCES_DIR/node" | cut -f1)"
echo "  Total:         $(du -sh "$RESOURCES_DIR" | cut -f1)"
