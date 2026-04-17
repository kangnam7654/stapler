import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes as nodeRandomBytes,
  timingSafeEqual as nodeTimingSafeEqual,
} from "node:crypto";
import { createReadStream } from "node:fs";
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

// ---------------------------------------------------------------------------
// AES-256-GCM
// ---------------------------------------------------------------------------

export interface AesGcmEncryptResult {
  ciphertext: Buffer;
  authTag: Buffer;
}

/**
 * AES-256-GCM encrypt. Returns ciphertext and 16-byte auth tag separately
 * so callers can persist them as distinct fields.
 *
 * Throws if key is not 32 bytes or iv is not 12 bytes.
 */
export function aes256GcmEncrypt(
  key: Buffer,
  iv: Buffer,
  plaintext: Buffer,
): AesGcmEncryptResult {
  if (sharedNative) {
    try {
      const result = sharedNative.aes256GcmEncrypt(key, iv, plaintext);
      return { ciphertext: result.ciphertext, authTag: result.authTag };
    } catch (_err) {
      // Fall through to JS
    }
  }
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { ciphertext, authTag: cipher.getAuthTag() };
}

/**
 * AES-256-GCM decrypt. Throws on auth-tag mismatch or invalid input.
 */
export function aes256GcmDecrypt(
  key: Buffer,
  iv: Buffer,
  ciphertext: Buffer,
  authTag: Buffer,
): Buffer {
  if (sharedNative) {
    try {
      return sharedNative.aes256GcmDecrypt(key, iv, ciphertext, authTag);
    } catch (_err) {
      // Fall through to JS
    }
  }
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

// ---------------------------------------------------------------------------
// Cryptographic RNG
// ---------------------------------------------------------------------------

/**
 * Returns `len` cryptographically secure random bytes from the OS CSPRNG.
 */
export function randomBytes(len: number): Buffer {
  if (sharedNative) {
    try {
      return sharedNative.randomBytes(len);
    } catch (_err) {
      // Fall through to JS
    }
  }
  return nodeRandomBytes(len);
}

// ---------------------------------------------------------------------------
// Streaming SHA-256 file hash
// ---------------------------------------------------------------------------

/**
 * Streams a file through SHA-256 and resolves to the lowercase hex digest.
 *
 * Uses the napi-rs worker pool when the native binding is available,
 * falling back to a Node.js streaming read + `createHash("sha256")`.
 */
export async function sha256File(path: string): Promise<string> {
  if (sharedNative) {
    try {
      return await sharedNative.sha256File(path);
    } catch (_err) {
      // Fall through to JS
    }
  }
  return await new Promise<string>((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}
