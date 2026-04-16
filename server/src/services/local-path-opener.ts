import { execFile as execFileCallback } from "node:child_process";
import { stat } from "node:fs/promises";
import process from "node:process";
import { promisify } from "node:util";
import { notFound, unprocessable } from "../errors.js";

const execFile = promisify(execFileCallback);

function openCommandForPlatform(targetPath: string, platform = process.platform) {
  if (platform === "darwin") {
    return { command: "open", args: [targetPath] };
  }
  if (platform === "win32") {
    return { command: "cmd", args: ["/c", "start", "", targetPath] };
  }
  return { command: "xdg-open", args: [targetPath] };
}

export async function openLocalDirectory(targetPath: string) {
  const stats = await stat(targetPath).catch((error: unknown) => {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "ENOENT"
    ) {
      throw notFound(`Workspace path does not exist: ${targetPath}`);
    }
    throw error;
  });

  if (!stats.isDirectory()) {
    throw unprocessable(`Workspace path is not a directory: ${targetPath}`);
  }

  const { command, args } = openCommandForPlatform(targetPath);
  try {
    await execFile(command, args, { windowsHide: true });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw unprocessable(`Failed to open workspace path: ${reason}`);
  }
}
