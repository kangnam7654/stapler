// src/tools/paperclip-request.ts
import type { ToolContext, ToolExecutor } from "../types.js";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function summarizeResponse(text: string): string {
  const compact = compactWhitespace(text);
  if (!compact) return "<empty>";
  return compact.length > 160 ? `${compact.slice(0, 159)}…` : compact;
}

const ALLOWED_METHODS = new Set(["GET", "POST", "PATCH", "DELETE", "PUT"]);

export const paperclipRequestTool: ToolExecutor = {
  name: "paperclip_request",
  definition: {
    type: "function",
    function: {
      name: "paperclip_request",
      description:
        "Make an authenticated HTTP request to the Paperclip control plane API. Uses PAPERCLIP_API_URL and PAPERCLIP_API_KEY from the agent environment.",
      parameters: {
        type: "object",
        properties: {
          method: {
            type: "string",
            description: "HTTP method",
            enum: ["GET", "POST", "PATCH", "DELETE", "PUT"],
          },
          path: {
            type: "string",
            description: "URL path (must start with /api/...)",
          },
          body: {
            type: "object",
            description: "Optional JSON request body.",
          },
        },
        required: ["method", "path"],
      },
    },
  },
  async execute(args, ctx: ToolContext) {
    const obj = args as Record<string, unknown>;
    const method = (asString(obj.method) ?? "").toUpperCase();
    if (!ALLOWED_METHODS.has(method)) {
      throw new Error(`paperclip_request: unsupported method '${method}'`);
    }
    const pth = asString(obj.path);
    if (!pth) throw new Error("paperclip_request: missing required argument 'path'");

    const apiUrl = ctx.env.PAPERCLIP_API_URL;
    if (!apiUrl) throw new Error("paperclip_request: PAPERCLIP_API_URL not set in agent environment");
    const apiKey = ctx.env.PAPERCLIP_API_KEY ?? "";

    const url = `${apiUrl.replace(/\/+$/, "")}${pth.startsWith("/") ? pth : `/${pth}`}`;

    const headers: Record<string, string> = { Accept: "application/json" };
    if (apiKey.length > 0) headers.Authorization = `Bearer ${apiKey}`;

    const init: RequestInit = { method, headers };
    if (obj.body !== undefined && method !== "GET" && method !== "DELETE") {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(obj.body);
    }

    // Log request without the Authorization header value.
    await ctx.onLog(
      "stdout",
      `[paperclip_request] ${method} ${url}\n`,
    );

    const response = await fetch(url, init);
    const text = await response.text();
    const summary = summarizeResponse(text);
    const resultLabel = `${method} ${url} -> ${response.status}${summary ? ` ${summary}` : ""}`;
    await ctx.onLog(
      response.ok ? "stdout" : "stderr",
      `[paperclip_request result] ${resultLabel}\n`,
    );
    if (!response.ok) {
      return `HTTP ${response.status}\n${text.slice(0, 4096)}`;
    }
    return text.slice(0, 16 * 1024);
  },
};
