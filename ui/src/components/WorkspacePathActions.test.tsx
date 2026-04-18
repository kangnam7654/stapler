// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { WorkspacePathActions } from "./WorkspacePathActions.js";

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: any[]) => mockInvoke(...a) }));

beforeEach(() => {
  mockInvoke.mockReset();
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

afterEach(() => {
  cleanup();
  delete (window as any).__TAURI_INTERNALS__;
});

describe("WorkspacePathActions", () => {
  it("renders 3 buttons", () => {
    render(<WorkspacePathActions absolutePath="/test/path" />);
    expect(screen.getByLabelText(/finder|탐색기/i)).toBeTruthy();
    expect(screen.getByLabelText(/copy|복사/i)).toBeTruthy();
    expect(screen.getByLabelText(/ide|vs code/i)).toBeTruthy();
  });

  it("disables finder/ide buttons in web mode", () => {
    render(<WorkspacePathActions absolutePath="/test/path" />);
    expect(screen.getByLabelText(/finder|탐색기/i)).toHaveProperty("disabled", true);
    expect(screen.getByLabelText(/ide|vs code/i)).toHaveProperty("disabled", true);
    expect(screen.getByLabelText(/copy|복사/i)).toHaveProperty("disabled", false);
  });

  it("enables finder/ide in desktop mode", () => {
    (window as any).__TAURI_INTERNALS__ = {};
    render(<WorkspacePathActions absolutePath="/test/path" />);
    expect(screen.getByLabelText(/finder|탐색기/i)).toHaveProperty("disabled", false);
    expect(screen.getByLabelText(/ide|vs code/i)).toHaveProperty("disabled", false);
  });

  it("calls clipboard.writeText on copy click", async () => {
    render(<WorkspacePathActions absolutePath="/test/path" />);
    fireEvent.click(screen.getByLabelText(/copy|복사/i));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("/test/path");
  });

  it("calls Tauri invoke on Finder click in desktop mode", async () => {
    (window as any).__TAURI_INTERNALS__ = {};
    mockInvoke.mockResolvedValue(undefined);
    render(<WorkspacePathActions absolutePath="/test/path" />);
    fireEvent.click(screen.getByLabelText(/finder|탐색기/i));
    expect(mockInvoke).toHaveBeenCalledWith("workspace_open_finder", { absPath: "/test/path" });
  });
});
