// src/loop.ts
import type {
  AgentLoopOptions,
  AgentLoopResult,
  ChatMessage,
  ToolCall,
  ToolExecutor,
} from "./types.js";
import { chatCompletionStream } from "./client.js";

function findTool(tools: ToolExecutor[], name: string): ToolExecutor | undefined {
  return tools.find((t) => t.name === name);
}

function parseToolArgs(raw: string): unknown {
  if (!raw || raw.trim().length === 0) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function executeToolCall(
  call: ToolCall,
  tools: ToolExecutor[],
  ctx: { cwd: string; env: Record<string, string>; onLog: AgentLoopOptions["onLog"] },
): Promise<ChatMessage> {
  const tool = findTool(tools, call.function.name);
  if (!tool) {
    return {
      role: "tool",
      tool_call_id: call.id,
      name: call.function.name,
      content: `error: tool '${call.function.name}' is not available`,
    };
  }
  try {
    await ctx.onLog("stdout", `[tool] ${tool.name}(${call.function.arguments})\n`);
    const args = parseToolArgs(call.function.arguments);
    const output = await tool.execute(args, ctx);
    return {
      role: "tool",
      tool_call_id: call.id,
      name: tool.name,
      content: output,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await ctx.onLog("stderr", `[tool error] ${tool.name}: ${message}\n`);
    return {
      role: "tool",
      tool_call_id: call.id,
      name: tool.name,
      content: `error: ${message}`,
    };
  }
}

export async function runAgentLoop(opts: AgentLoopOptions): Promise<AgentLoopResult> {
  const { baseUrl, model, apiKey, tools, enabledToolNames, timeoutMs, env, cwd, onLog } = opts;
  const activeTools =
    enabledToolNames && enabledToolNames.length > 0
      ? tools.filter((t) => enabledToolNames.includes(t.name))
      : tools;
  const toolDefs = activeTools.map((t) => t.definition);

  const messages: ChatMessage[] = [...opts.messages];
  const usage = { inputTokens: 0, outputTokens: 0 };
  const deadline = Date.now() + timeoutMs;
  const toolCtx = { cwd, env, onLog };

  while (true) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      return {
        messages,
        finishReason: "timeout",
        errorMessage: `AgentLoop timed out after ${timeoutMs}ms`,
        usage,
      };
    }

    let loggedModelPrefix = false;
    let response;
    try {
      response = await chatCompletionStream({
        baseUrl,
        apiKey,
        request: {
          model,
          messages,
          ...(toolDefs.length > 0 ? { tools: toolDefs, tool_choice: "auto" as const } : {}),
        },
        timeoutMs: remaining,
        onDelta: async (delta) => {
          if (!loggedModelPrefix) {
            loggedModelPrefix = true;
            await onLog("stdout", "[model] ");
          }
          await onLog("stdout", delta);
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        messages,
        finishReason: "error",
        errorMessage: message,
        usage,
      };
    }

    if (response.usage) {
      usage.inputTokens += response.usage.prompt_tokens ?? 0;
      usage.outputTokens += response.usage.completion_tokens ?? 0;
    }

    const choice = response.choices[0];
    if (!choice) {
      return {
        messages,
        finishReason: "error",
        errorMessage: "chat completion response had no choices",
        usage,
      };
    }

    const assistantMsg = choice.message;
    messages.push(assistantMsg);

    const toolCalls = assistantMsg.tool_calls ?? [];
    if (toolCalls.length === 0) {
      if (loggedModelPrefix) {
        await onLog("stdout", "\n");
      }
      await onLog(
        "stdout",
        `[loop] finish_reason=${choice.finish_reason ?? "unknown"} — no tool_calls returned (tokens: in=${usage.inputTokens} out=${usage.outputTokens})\n`,
      );
      return { messages, finishReason: "done", errorMessage: null, usage };
    }

    for (const call of toolCalls) {
      const toolResult = await executeToolCall(call, activeTools, toolCtx);
      messages.push(toolResult);
    }
  }
}
