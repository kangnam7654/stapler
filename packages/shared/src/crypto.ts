import { createHash } from "node:crypto";
import sharedNative from "@paperclipai/shared-native";

/**
 * Returns the full hex-encoded SHA-256 hash of a string.
 *
 * Uses native Rust implementation when available, falling back to Node.js crypto.
 * Mirrors `createHash("sha256").update(value).digest("hex")`.
 */
export function sha256Hex(value: string): string {
  if (sharedNative) {
    try {
      return sharedNative.sha256Hex(value);
    } catch (_err) {
      // Fall through to JS
    }
  }
  return createHash("sha256").update(value).digest("hex");
}
