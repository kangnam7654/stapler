class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = TestResizeObserver as unknown as typeof ResizeObserver;
}

if (typeof window !== "undefined" && typeof window.ResizeObserver === "undefined") {
  window.ResizeObserver = globalThis.ResizeObserver;
}
