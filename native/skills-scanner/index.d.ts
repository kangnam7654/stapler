/**
 * Native Rust-backed skill scanner (napi-rs).
 *
 * Returns `null` when the platform-specific `.node` binary is not
 * available (binary not built, or running on an unsupported platform).
 * Consumers must handle the null case and fall back to the TS scanner.
 */

declare const nativeBinding: {
  /**
   * Scan a workspace for skill directories and return a JSON string
   * of the Rust `WorkspaceScanResult` struct (snake_case fields).
   *
   * The returned promise resolves on libuv's thread pool, so calling
   * this does not block the Node event loop.
   *
   * @param companyId - Company identifier used when deriving canonical skill keys.
   * @param workspaceCwd - Absolute path to the workspace to scan.
   * @returns JSON string of `WorkspaceScanResult`.
   */
  scanWorkspaceSkillsAsync(
    companyId: string,
    workspaceCwd: string,
  ): Promise<string>
} | null

export = nativeBinding
