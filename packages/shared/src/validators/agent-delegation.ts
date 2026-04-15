import { z } from "zod";
import { AGENT_DELEGATION_STATUSES, ISSUE_PRIORITIES } from "../constants.js";

export const agentDelegationStatusSchema = z.enum(AGENT_DELEGATION_STATUSES);

const nullableUuidSchema = z.string().uuid().optional().nullable();
const nullableTextSchema = z.string().max(20_000).optional().nullable();

export const createAgentDelegationSchema = z.object({
  parentDelegationId: nullableUuidSchema,
  rootIssueId: nullableUuidSchema,
  linkedIssueId: nullableUuidSchema,
  delegatorAgentId: nullableUuidSchema,
  delegateAgentId: z.string().uuid(),
  title: z.string().min(1).max(300),
  brief: nullableTextSchema,
  acceptanceCriteria: nullableTextSchema,
  context: z.record(z.unknown()).optional().default({}),
  priority: z.enum(ISSUE_PRIORITIES).optional().default("medium"),
  dueAt: z.string().datetime().optional().nullable(),
  idempotencyKey: z.string().min(1).max(200).optional().nullable(),
  createMessage: z.boolean().optional().default(true),
});

export type CreateAgentDelegation = z.input<typeof createAgentDelegationSchema>;

export const updateAgentDelegationSchema = z.object({
  status: agentDelegationStatusSchema.optional(),
  title: z.string().min(1).max(300).optional(),
  brief: nullableTextSchema,
  acceptanceCriteria: nullableTextSchema,
  context: z.record(z.unknown()).optional(),
  result: nullableTextSchema,
  priority: z.enum(ISSUE_PRIORITIES).optional(),
  dueAt: z.string().datetime().optional().nullable(),
  linkedIssueId: nullableUuidSchema,
});

export type UpdateAgentDelegation = z.infer<typeof updateAgentDelegationSchema>;

export const reportAgentDelegationSchema = z.object({
  result: z.string().min(1).max(20_000),
  status: z.enum(["reported", "done", "blocked"]).optional().default("reported"),
  linkedIssueId: nullableUuidSchema,
});

export type ReportAgentDelegation = z.input<typeof reportAgentDelegationSchema>;
