// src/tools/index.ts
export { bashTool } from "./bash.js";
export { readFileTool, writeFileTool, listDirTool } from "./fs.js";
export { paperclipRequestTool } from "./paperclip-request.js";

import { bashTool } from "./bash.js";
import { readFileTool, writeFileTool, listDirTool } from "./fs.js";
import { paperclipRequestTool } from "./paperclip-request.js";
import type { ToolExecutor } from "../types.js";

export const DEFAULT_TOOLS: ToolExecutor[] = [
  paperclipRequestTool,
  bashTool,
  readFileTool,
  writeFileTool,
  listDirTool,
];

export function selectTools(enabled: string[] | undefined, all: ToolExecutor[] = DEFAULT_TOOLS): ToolExecutor[] {
  if (!enabled || enabled.length === 0) return all;
  const set = new Set(enabled);
  return all.filter((t) => set.has(t.name));
}
