import { z } from "zod";
import { AGENT_ADAPTER_TYPES, AGENT_ROLES } from "../constants.js";
import { adapterConfigSchema } from "./agent.js";

export const draftPromptTemplateRequestSchema = z.object({
  adapterType: z.enum(AGENT_ADAPTER_TYPES),
  adapterConfig: adapterConfigSchema,
  name: z.string().trim().min(1).max(200),
  role: z.enum(AGENT_ROLES),
  title: z.string().max(500).nullable().optional(),
  reportsTo: z.string().uuid().nullable().optional(),
  hint: z.string().max(2000).optional(),
});

export type DraftPromptTemplateRequest = z.infer<
  typeof draftPromptTemplateRequestSchema
>;

export type DraftPromptTemplateEvent =
  | { kind: "delta"; delta: string }
  | { kind: "done" }
  | { kind: "error"; message: string };
