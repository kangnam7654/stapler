import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";
import { issues } from "./issues.js";

export const workflowIntakes = pgTable(
  "workflow_intakes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    kind: text("kind").notNull(),
    category: text("category").notNull(),
    status: text("status").notNull().default("draft"),
    title: text("title").notNull(),
    summary: text("summary"),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    delegationTargetAgentId: uuid("delegation_target_agent_id").references(() => agents.id),
    delegationMode: text("delegation_mode"),
    requestedByAgentId: uuid("requested_by_agent_id").references(() => agents.id),
    requestedByUserId: text("requested_by_user_id"),
    requestedFromIssueId: uuid("requested_from_issue_id").references(() => issues.id, { onDelete: "set null" }),
    priority: text("priority").notNull().default("medium"),
    routeRuleSnapshot: jsonb("route_rule_snapshot").$type<Record<string, unknown>>().notNull().default({}),
    dueAt: timestamp("due_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    legacyWorkflowCaseId: uuid("legacy_workflow_case_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyStatusCategoryIdx: index("workflow_intakes_company_status_category_idx").on(
      table.companyId,
      table.status,
      table.category,
    ),
    companyRequestedByAgentIdx: index("workflow_intakes_company_requested_by_agent_idx").on(
      table.companyId,
      table.requestedByAgentId,
      table.status,
    ),
    legacyWorkflowCaseIdx: index("workflow_intakes_legacy_workflow_case_idx").on(
      table.companyId,
      table.legacyWorkflowCaseId,
    ),
  }),
);
