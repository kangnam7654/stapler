import { type AnyPgColumn, pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";
import { issues } from "./issues.js";
import { agentMessages } from "./agent_messages.js";
import { heartbeatRuns } from "./heartbeat_runs.js";

export const agentDelegations = pgTable(
  "agent_delegations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    parentDelegationId: uuid("parent_delegation_id").references((): AnyPgColumn => agentDelegations.id, {
      onDelete: "set null",
    }),
    rootIssueId: uuid("root_issue_id").references(() => issues.id, { onDelete: "set null" }),
    linkedIssueId: uuid("linked_issue_id").references(() => issues.id, { onDelete: "set null" }),
    sourceMessageId: uuid("source_message_id").references(() => agentMessages.id, { onDelete: "set null" }),
    delegatorAgentId: uuid("delegator_agent_id").notNull().references(() => agents.id),
    delegateAgentId: uuid("delegate_agent_id").notNull().references(() => agents.id),
    status: text("status").notNull().default("queued"),
    title: text("title").notNull(),
    brief: text("brief"),
    acceptanceCriteria: text("acceptance_criteria"),
    context: jsonb("context").$type<Record<string, unknown>>().notNull().default({}),
    result: text("result"),
    priority: text("priority").notNull().default("medium"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    idempotencyKey: text("idempotency_key"),
    createdRunId: uuid("created_run_id").references(() => heartbeatRuns.id, { onDelete: "set null" }),
    claimedRunId: uuid("claimed_run_id").references(() => heartbeatRuns.id, { onDelete: "set null" }),
    completedRunId: uuid("completed_run_id").references(() => heartbeatRuns.id, { onDelete: "set null" }),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    reportedAt: timestamp("reported_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyStatusIdx: index("agent_delegations_company_status_idx").on(table.companyId, table.status, table.updatedAt),
    delegateStatusIdx: index("agent_delegations_delegate_status_idx").on(
      table.companyId,
      table.delegateAgentId,
      table.status,
      table.updatedAt,
    ),
    delegatorStatusIdx: index("agent_delegations_delegator_status_idx").on(
      table.companyId,
      table.delegatorAgentId,
      table.status,
      table.updatedAt,
    ),
    parentIdx: index("agent_delegations_parent_idx").on(table.companyId, table.parentDelegationId),
    rootIssueIdx: index("agent_delegations_root_issue_idx").on(table.companyId, table.rootIssueId),
    linkedIssueIdx: index("agent_delegations_linked_issue_idx").on(table.companyId, table.linkedIssueId),
    idempotencyIdx: index("agent_delegations_idempotency_idx").on(table.companyId, table.idempotencyKey),
  }),
);
