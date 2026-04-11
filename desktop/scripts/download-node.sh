#!/usr/bin/env bash
set -euo pipefail

# Downloads the official Node.js binary for the current architecture
NODE_VERSION="${NODE_VERSION:-v22.22.0}"
DEST_DIR="${1:-$(dirname "$0")/../resources/node}"

ARCH=$(uname -m)
case "$ARCH" in
  arm64|aarch64) PLATFORM_ARCH="arm64" ;;
  x86_64)        PLATFORM_ARCH="x64" ;;
  *)             echo "Unsupported architecture: $ARCH"; exit 1 ;;
esac

TARBALL="node-${NODE_VERSION}-darwin-${PLATFORM_ARCH}.tar.gz"
URL="https://nodejs.org/dist/${NODE_VERSION}/${TARBALL}"

mkdir -p "$DEST_DIR"

echo "Downloading Node.js ${NODE_VERSION} (${PLATFORM_ARCH})..."
curl -fsSL "$URL" | tar xz --strip-components=1 -C "$DEST_DIR" "node-${NODE_VERSION}-darwin-${PLATFORM_ARCH}/bin/node"

# Move extracted binary to the right place
if [ -f "$DEST_DIR/bin/node" ]; then
  mv "$DEST_DIR/bin/node" "$DEST_DIR/node"
  rm -rf "$DEST_DIR/bin"
fi

chmod +x "$DEST_DIR/node"
echo "Node.js binary saved to $DEST_DIR/node"
"$DEST_DIR/node" --version
