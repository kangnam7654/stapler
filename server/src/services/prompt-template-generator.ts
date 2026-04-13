import type { AgentRole } from "@paperclipai/shared";

export interface BuildMetaPromptInput {
  agentName: string;
  agentRole: AgentRole;
  agentTitle: string | null;
  company: { name: string; description: string | null };
  otherAgents: { name: string; role: string; title: string | null }[];
  reportsTo: { name: string; role: string; title: string | null } | null;
  userHint: string | null;
}

const SYSTEM_INSTRUCTIONS = [
  "You draft a Prompt Template used by an AI agent on every heartbeat.",
  "",
  "Constraints:",
  "- Keep it compact. Target under 300 words.",
  "- Prefer task framing and variables over stable instructions.",
  "- Use Handlebars-style variables where appropriate:",
  "  {{ agent.name }}, {{ agent.role }}, {{ context.* }}, {{ run.* }}.",
  "- Do NOT include stable multi-paragraph instructions (those belong in bootstrap).",
  "- Do NOT wrap the output in markdown fences, JSON, or commentary.",
  "- Output ONLY the template body as plain text.",
  "- Match the language of the user's hint. If no hint language is obvious, use the language of the company name / description. If still ambiguous, use English.",
].join("\n");

export function buildMetaPrompt(
  input: BuildMetaPromptInput,
): { role: "system" | "user"; content: string }[] {
  const lines: string[] = [];
  lines.push("Design a prompt template for a new AI agent.");
  lines.push("");
  lines.push("Agent identity:");
  lines.push(`- Name: ${input.agentName}`);
  lines.push(`- Role: ${input.agentRole}`);
  if (input.agentTitle) lines.push(`- Title: ${input.agentTitle}`);
  if (input.reportsTo) {
    lines.push(
      `- Reports to: ${input.reportsTo.name} (${input.reportsTo.role}${input.reportsTo.title ? `, ${input.reportsTo.title}` : ""})`,
    );
  }

  lines.push("");
  lines.push(`Company: ${input.company.name}`);
  if (input.company.description) lines.push(`Description: ${input.company.description}`);

  if (input.otherAgents.length > 0) {
    lines.push("");
    lines.push("Other agents in the company:");
    for (const a of input.otherAgents) {
      lines.push(`- ${a.name} (${a.role}${a.title ? `, ${a.title}` : ""})`);
    }
  }

  if (input.userHint && input.userHint.trim().length > 0) {
    lines.push("");
    lines.push("User's intent for this agent:");
    lines.push(input.userHint.trim());
  }

  return [
    { role: "system", content: SYSTEM_INSTRUCTIONS },
    { role: "user", content: lines.join("\n") },
  ];
}
