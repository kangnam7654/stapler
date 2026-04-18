import { invoke } from "@tauri-apps/api/core";
import { isDesktop } from "../lib/desktop.js";

export interface WorkspacePathActionsProps {
  absolutePath: string;
}

export function WorkspacePathActions({ absolutePath }: WorkspacePathActionsProps) {
  const desktop = isDesktop();

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(absolutePath);
    } catch (e) {
      console.error("clipboard copy failed", e);
    }
  };

  const onFinder = async () => {
    if (!desktop) return;
    try {
      await invoke("workspace_open_finder", { absPath: absolutePath });
    } catch (e) {
      console.error("open finder failed", e);
    }
  };

  const onIde = async () => {
    if (!desktop) return;
    try {
      await invoke("workspace_open_ide", { absPath: absolutePath });
    } catch (e) {
      console.error("open ide failed", e);
    }
  };

  const desktopOnlyTitle = desktop ? undefined : "Desktop 앱에서만 동작합니다";

  return (
    <div className="inline-flex items-center gap-1">
      <button
        type="button"
        aria-label="Finder에서 열기"
        title={desktopOnlyTitle ?? "Finder에서 열기"}
        disabled={!desktop || !absolutePath}
        onClick={onFinder}
        className="px-2 py-1 text-xs rounded border border-border hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed"
      >
        📁
      </button>
      <button
        type="button"
        aria-label="경로 복사"
        title="경로 복사"
        disabled={!absolutePath}
        onClick={onCopy}
        className="px-2 py-1 text-xs rounded border border-border hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed"
      >
        📋
      </button>
      <button
        type="button"
        aria-label="VS Code에서 열기 (IDE)"
        title={desktopOnlyTitle ?? "VS Code에서 열기"}
        disabled={!desktop || !absolutePath}
        onClick={onIde}
        className="px-2 py-1 text-xs rounded border border-border hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed"
      >
        ▶️
      </button>
    </div>
  );
}
