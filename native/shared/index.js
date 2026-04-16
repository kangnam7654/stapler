'use strict'

// Platform-aware loader for the napi-rs Rust binary.
//
// Returns `null` when the platform-specific `.node` file is not
// available. Consumers must handle the null case and fall back to
// the pure-TS implementation.

const { existsSync } = require('fs')
const { join } = require('path')
const { platform, arch } = process

function resolvePlatformSuffix() {
  if (platform === 'darwin') {
    if (arch === 'arm64') return 'darwin-arm64'
    if (arch === 'x64') return 'darwin-x64'
  }
  if (platform === 'linux') {
    if (arch === 'x64') return 'linux-x64-gnu'
    if (arch === 'arm64') return 'linux-arm64-gnu'
  }
  if (platform === 'win32') {
    if (arch === 'x64') return 'win32-x64-msvc'
  }
  return null
}

let nativeBinding = null

try {
  const suffix = resolvePlatformSuffix()
  if (suffix) {
    const localPath = join(__dirname, `shared-native.${suffix}.node`)
    if (existsSync(localPath)) {
      nativeBinding = require(localPath)
    }
  }
} catch (_err) {
  nativeBinding = null
}

module.exports = nativeBinding
