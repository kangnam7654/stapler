import { createHash, createHmac, timingSafeEqual as nodeTimingSafeEqual } from "node:crypto";
import sharedNative from "@paperclipai/shared-native";

// ---------------------------------------------------------------------------
// SHA-256
// ---------------------------------------------------------------------------

/**
 * Returns the full hex-encoded SHA-256 hash of a string.
 *
 * Uses native Rust implementation when available, falling back to Node.js crypto.
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

// ---------------------------------------------------------------------------
// HMAC-SHA256
// ---------------------------------------------------------------------------

/**
 * Computes HMAC-SHA256 and returns the hex digest.
 */
export function hmacSha256Hex(key: Buffer, data: Buffer): string {
  if (sharedNative) {
    try {
      return sharedNative.hmacSha256Hex(key, data);
    } catch (_err) {
      // Fall through to JS
    }
  }
  return createHmac("sha256", key).update(data).digest("hex");
}

/**
 * Computes HMAC-SHA256 and returns the base64url (no padding) digest.
 */
export function hmacSha256Base64Url(key: Buffer, data: Buffer): string {
  if (sharedNative) {
    try {
      return sharedNative.hmacSha256Base64Url(key, data);
    } catch (_err) {
      // Fall through to JS
    }
  }
  return createHmac("sha256", key).update(data).digest("base64url");
}

// ---------------------------------------------------------------------------
// Timing-safe comparison
// ---------------------------------------------------------------------------

/**
 * Constant-time equality comparison for two buffers.
 * Returns false if lengths differ.
 */
export function timingSafeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  if (sharedNative) {
    try {
      return sharedNative.timingSafeEqual(a, b);
    } catch (_err) {
      // Fall through to JS
    }
  }
  return nodeTimingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// Base64url (RFC 4648 §5, no padding)
// ---------------------------------------------------------------------------

/**
 * Encodes bytes to base64url (no padding).
 */
export function base64UrlEncode(data: Buffer): string {
  if (sharedNative) {
    try {
      return sharedNative.base64UrlEncode(data);
    } catch (_err) {
      // Fall through to JS
    }
  }
  return data.toString("base64url");
}

/**
 * Decodes a base64url (no padding) string to a Buffer.
 * Returns null on invalid input.
 */
export function base64UrlDecode(encoded: string): Buffer | null {
  if (sharedNative) {
    try {
      return sharedNative.base64UrlDecode(encoded);
    } catch (_err) {
      // Fall through to JS
    }
  }
  try {
    return Buffer.from(encoded, "base64url");
  } catch {
    return null;
  }
}
