// src/server/execute.ts
import type {
  AdapterExecutionContext,
  AdapterExecutionResult,
} from "@paperclipai/adapter-utils";
import {
  asNumber,
  asString,
  asStringArray,
  buildPaperclipEnv,
  parseObject,
} from "@paperclipai/adapter-utils/server-utils";
import {
  DEFAULT_TOOLS,
  runAgentLoop,
  selectTools,
  summarizeSession,
  type ChatMessage,
} from "@paperclipai/adapter-openai-compat-local";
import {
  DEFAULT_OLLAMA_BASE_URL,
  DEFAULT_OLLAMA_MODEL,
  PROVIDER_NAME,
} from "../index.js";

function buildInitialMessages(opts: {
  systemPrompt: string;
  promptTemplate: string;
  prevSummary: string;
  agent: AdapterExecutionContext["agent"];
}): ChatMessage[] {
  const messages: ChatMessage[] = [];
  if (opts.systemPrompt.length > 0) {
    messages.push({ role: "system", content: opts.systemPrompt });
  }
  if (opts.prevSummary.length > 0) {
    messages.push({
      role: "user",
      content: `Previous session summary:\n${opts.prevSummary}\n\nContinue from where you left off.`,
    });
  }
  const rendered = opts.promptTemplate
    .replace(/\{\{agent\.id\}\}/g, opts.agent.id)
    .replace(/\{\{agent\.name\}\}/g, opts.agent.name ?? opts.agent.id);
  messages.push({ role: "user", content: rendered });
  return messages;
}

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const { runId, agent, runtime, config, onLog, onMeta, authToken } = ctx;

  const baseUrl = asString(config.baseUrl, DEFAULT_OLLAMA_BASE_URL);
  const model = asString(config.model, DEFAULT_OLLAMA_MODEL);
  const cwd = asString(config.cwd, process.cwd());
  const systemPrompt = asString(config.systemPrompt, "");
  const promptTemplate = asString(
    config.promptTemplate,
    "You are agent {{agent.name}}. Continue your Paperclip work.",
  );
  const timeoutSec = asNumber(config.timeoutSec, 300);
  const enabledToolNames = asStringArray(config.enabledTools);

  const envConfig = parseObject(config.env);
  const env: Record<string, string> = { ...buildPaperclipEnv(agent) };
  env.PAPERCLIP_RUN_ID = runId;
  for (const [k, v] of Object.entries(envConfig)) {
    if (typeof v === "string") env[k] = v;
  }
  if (authToken && !env.PAPERCLIP_API_KEY) {
    env.PAPERCLIP_API_KEY = authToken;
  }

  const prevSummary = asString(parseObject(runtime.sessionParams).summary, "");
  const messages = buildInitialMessages({ systemPrompt, promptTemplate, prevSummary, agent });

  if (onMeta) {
    await onMeta({
      adapterType: "ollama_local",
      command: "(http)",
      cwd,
      commandNotes: [`Calling ${baseUrl}/v1/chat/completions with model ${model}`],
      commandArgs: [],
      env: {},
      prompt: messages.at(-1)?.content ?? "",
      context: ctx.context,
    });
  }

  const selectedTools = selectTools(enabledToolNames.length > 0 ? enabledToolNames : undefined, DEFAULT_TOOLS);

  const loopResult = await runAgentLoop({
    baseUrl,
    model,
    messages,
    tools: selectedTools,
    timeoutMs: timeoutSec * 1000,
    env,
    cwd,
    onLog,
  });

  const summary = await summarizeSession({
    baseUrl,
    model,
    messages: loopResult.messages,
    timeoutMs: 60_000,
  });

  const timedOut = loopResult.finishReason === "timeout";
  const errored = loopResult.finishReason === "error";

  return {
    exitCode: errored ? 1 : 0,
    signal: null,
    timedOut,
    errorMessage: loopResult.errorMessage,
    usage: {
      inputTokens: loopResult.usage.inputTokens,
      outputTokens: loopResult.usage.outputTokens,
    },
    provider: PROVIDER_NAME,
    biller: PROVIDER_NAME,
    model,
    billingType: "local" as const,
    costUsd: 0,
    sessionParams: summary ? { summary } : null,
    sessionDisplayId: summary ? `summary@${Date.now()}` : null,
    resultJson: {
      finishReason: loopResult.finishReason,
      messageCount: loopResult.messages.length,
    },
  };
}
