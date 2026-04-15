import type { AgentDelegationStatus, IssuePriority } from "../constants.js";

export interface AgentDelegation {
  id: string;
  companyId: string;
  parentDelegationId: string | null;
  rootIssueId: string | null;
  linkedIssueId: string | null;
  sourceMessageId: string | null;
  delegatorAgentId: string;
  delegateAgentId: string;
  status: AgentDelegationStatus;
  title: string;
  brief: string | null;
  acceptanceCriteria: string | null;
  context: Record<string, unknown>;
  result: string | null;
  priority: IssuePriority;
  dueAt: Date | null;
  idempotencyKey: string | null;
  createdRunId: string | null;
  claimedRunId: string | null;
  completedRunId: string | null;
  claimedAt: Date | null;
  startedAt: Date | null;
  reportedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
