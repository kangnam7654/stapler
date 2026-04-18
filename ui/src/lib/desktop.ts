/**
 * Returns `true` when the UI is running inside the Tauri desktop shell.
 *
 * Detection works by looking for the `__TAURI_INTERNALS__` global that the
 * Tauri runtime injects into `window` before any JS executes. Safe to call
 * during SSR or in unit-test environments without `window` defined.
 */
export function isDesktop(): boolean {
  if (typeof window === "undefined") return false;
  return "__TAURI_INTERNALS__" in window;
}
