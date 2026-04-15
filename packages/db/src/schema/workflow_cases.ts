import { pgTable, uuid, text, timestamp, boolean, jsonb, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";
import { issues } from "./issues.js";
import { approvals } from "./approvals.js";

export const workflowCases = pgTable(
  "workflow_cases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    kind: text("kind").notNull(),
    category: text("category").notNull(),
    status: text("status").notNull().default("draft"),
    title: text("title").notNull(),
    summary: text("summary"),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    requestedByAgentId: uuid("requested_by_agent_id").references(() => agents.id),
    requestedByUserId: text("requested_by_user_id"),
    requestedFromIssueId: uuid("requested_from_issue_id").references(() => issues.id, { onDelete: "set null" }),
    linkedIssueId: uuid("linked_issue_id").references(() => issues.id, { onDelete: "set null" }),
    linkedApprovalId: uuid("linked_approval_id").references(() => approvals.id, { onDelete: "set null" }),
    primaryReviewerRole: text("primary_reviewer_role").notNull(),
    secondaryReviewerRole: text("secondary_reviewer_role"),
    finalApproverRole: text("final_approver_role").notNull(),
    boardApprovalRequired: boolean("board_approval_required").notNull().default(false),
    executionTarget: text("execution_target").notNull().default("issue"),
    priority: text("priority").notNull().default("medium"),
    routeRuleSnapshot: jsonb("route_rule_snapshot").$type<Record<string, unknown>>().notNull().default({}),
    dueAt: timestamp("due_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyStatusCategoryIdx: index("workflow_cases_company_status_category_idx").on(
      table.companyId,
      table.status,
      table.category,
    ),
    companyRequestedByAgentIdx: index("workflow_cases_company_requested_by_agent_idx").on(
      table.companyId,
      table.requestedByAgentId,
      table.status,
    ),
    companyLinkedIssueIdx: index("workflow_cases_company_linked_issue_idx").on(table.companyId, table.linkedIssueId),
    companyLinkedApprovalIdx: index("workflow_cases_company_linked_approval_idx").on(
      table.companyId,
      table.linkedApprovalId,
    ),
  }),
);
