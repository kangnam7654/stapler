// src/server/execute.ts
import fs from "node:fs/promises";
import type {
  AdapterExecutionContext,
  AdapterExecutionResult,
} from "@paperclipai/adapter-utils";
import {
  asNumber,
  asString,
  asStringArray,
  buildBundleTree,
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

const DEFAULT_PROMPT_TEMPLATE = `You are {{agent.name}}, an AI agent running inside the Paperclip control plane.

You have access to the \`paperclip_request\` tool which lets you call the Paperclip REST API (base URL is in PAPERCLIP_API_URL env var).

Key API endpoints:
- Read your assigned tasks: GET /api/companies/{{agent.companyId}}/issues?assigneeAgentId={{agent.id}}&status=in_progress
- Read an assigned delegation: GET /api/delegations/{delegationId}
- Report a delegation: POST /api/delegations/{delegationId}/report  { "result": "...", "status": "reported" }
- List existing agents: GET /api/companies/{{agent.companyId}}/agents
- Comment on issues: POST /api/issues/{issueId}/comments  { "body": "..." }
- Hire new agents: POST /api/companies/{{agent.companyId}}/agent-hires  { "name": "...", "role": "...", "adapterType": "ollama_local", "adapterConfig": { "model": "...", "baseUrl": "http://localhost:11434" } }
- Mark issue done: PATCH /api/issues/{issueId}  { "status": "done" }

Work loop — follow these steps exactly:
1. If PAPERCLIP_DELEGATION_ID is set, first read GET /api/delegations/{delegationId}, then claim/report it as you work.
2. Call GET /api/companies/{{agent.companyId}}/issues?assigneeAgentId={{agent.id}}&status=in_progress to get your current tasks.
3. For each task, FIRST check whether the work is already done (e.g. if the task is to hire a role, call GET /api/companies/{{agent.companyId}}/agents and check if that role already exists).
4. If the work is already done, skip to step 5 immediately — do NOT redo it.
5. If the work is not done, perform it now using paperclip_request.
6. IMPORTANT: Call PATCH /api/issues/{issueId} with { "status": "done" } to mark the task complete. You MUST do this for every task before ending your session.
7. Delegation discipline: if you already delegated or hired someone for an objective in this run, do NOT create a second issue, task, or hire for the same objective. Reuse the existing issue or comment on the existing thread instead of inventing a follow-up task.

Start now by reading your assignments.`;

async function fetchIssueContext(
  issueId: string,
  apiUrl: string,
  apiKey: string,
): Promise<{ title: string; description: string | null } | null> {
  try {
    const url = `${apiUrl.replace(/\/+$/, "")}/api/issues/${encodeURIComponent(issueId)}`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const issue = await res.json() as Record<string, unknown>;
    const title = typeof issue.title === "string" ? issue.title : null;
    if (!title) return null;
    const description = typeof issue.description === "string" ? issue.description : null;
    return { title, description };
  } catch {
    return null;
  }
}

function buildInitialMessages(opts: {
  systemPrompt: string;
  promptTemplate: string;
  prevSummary: string;
  agent: AdapterExecutionContext["agent"];
  taskNote: string;
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
    .replace(/\{\{agent\.name\}\}/g, opts.agent.name ?? opts.agent.id)
    .replace(/\{\{agent\.companyId\}\}/g, opts.agent.companyId);

  const userContent = opts.taskNote
    ? `${opts.taskNote}\n\n${rendered}`
    : rendered;

  messages.push({ role: "user", content: userContent });
  return messages;
}

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const { runId, agent, runtime, config, context, onLog, onMeta, authToken } = ctx;

  const baseUrl = asString(config.baseUrl, DEFAULT_OLLAMA_BASE_URL);
  const model = asString(config.model, DEFAULT_OLLAMA_MODEL);
  const instructionsFilePath = asString(config.instructionsFilePath, "");
  const instructionsRootPath = asString(config.instructionsRootPath, "");
  const cwd = asString(config.cwd, instructionsRootPath || process.cwd());
  let systemPrompt = asString(config.systemPrompt, "");
  if (instructionsFilePath) {
    try {
      const fileContent = await fs.readFile(instructionsFilePath, "utf8");
      systemPrompt = fileContent.trim() + (systemPrompt ? "\n\n" + systemPrompt : "");
    } catch {
      // file not yet created or inaccessible — continue without it
    }
  }
  if (instructionsRootPath) {
    try {
      const tree = await buildBundleTree(instructionsRootPath);
      if (tree) {
        const treeSection = `## Bundle structure\n\n\`\`\`\n${tree}\n\`\`\`\n\nThis tree is a snapshot taken at session start. Use \`read_file(path)\` to load any file. Call \`list_dir(path)\` to re-scan if files may have changed during the session.`;
        systemPrompt = systemPrompt ? `${systemPrompt}\n\n${treeSection}` : treeSection;
      }
    } catch {
      // root inaccessible — continue without tree hint
    }
  }
  const promptTemplate = asString(config.promptTemplate, DEFAULT_PROMPT_TEMPLATE);
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

  // Build task context note from run context
  const issueId =
    (typeof context.issueId === "string" && context.issueId) ||
    (typeof context.taskId === "string" && context.taskId) ||
    null;
  const wakeReason = typeof context.wakeReason === "string" ? context.wakeReason : null;
  const delegationId = typeof context.delegationId === "string" ? context.delegationId : null;
  const rootIssueId = typeof context.rootIssueId === "string" ? context.rootIssueId : null;
  const linkedIssueId = typeof context.linkedIssueId === "string" ? context.linkedIssueId : null;
  if (delegationId) {
    env.PAPERCLIP_DELEGATION_ID = delegationId;
  }
  if (rootIssueId) env.PAPERCLIP_ROOT_ISSUE_ID = rootIssueId;
  if (linkedIssueId) env.PAPERCLIP_LINKED_ISSUE_ID = linkedIssueId;

  let taskNote = "";
  if (delegationId) {
    taskNote = `## Current Delegation\nDelegation ID: ${delegationId}${wakeReason ? `\nWake reason: ${wakeReason}` : ""}\n\nRead it first: GET /api/delegations/${delegationId}`;
  }
  if (issueId) {
    const apiUrl = env.PAPERCLIP_API_URL ?? "";
    const apiKey = env.PAPERCLIP_API_KEY ?? "";
    const issueData = apiUrl ? await fetchIssueContext(issueId, apiUrl, apiKey) : null;
    if (issueData) {
      taskNote += `${taskNote ? "\n\n" : ""}## Current Task\n**${issueData.title}** (ID: ${issueId})`;
      if (issueData.description) taskNote += `\n\n${issueData.description}`;
      if (wakeReason) taskNote += `\n\nWake reason: ${wakeReason}`;
    } else {
      taskNote += `${taskNote ? "\n\n" : ""}## Current Task\nTask ID: ${issueId}${wakeReason ? `\nWake reason: ${wakeReason}` : ""}`;
    }
  }

  const prevSummary = asString(parseObject(runtime.sessionParams).summary, "");
  const messages = buildInitialMessages({ systemPrompt, promptTemplate, prevSummary, agent, taskNote });

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
      ...(loopResult.errorMessage ? { errorMessage: loopResult.errorMessage } : {}),
    },
  };
}
