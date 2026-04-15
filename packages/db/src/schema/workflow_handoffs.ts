import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { workflowIntakes } from "./workflow_intakes.js";
import { workflowDecisions } from "./workflow_decisions.js";
import { issues } from "./issues.js";
import { approvals } from "./approvals.js";

export const workflowHandoffs = pgTable(
  "workflow_handoffs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    intakeId: uuid("intake_id").notNull().references(() => workflowIntakes.id, { onDelete: "cascade" }),
    decisionId: uuid("decision_id").references(() => workflowDecisions.id, { onDelete: "set null" }),
    executionTarget: text("execution_target").notNull(),
    linkedIssueId: uuid("linked_issue_id").references(() => issues.id, { onDelete: "set null" }),
    linkedApprovalId: uuid("linked_approval_id").references(() => approvals.id, { onDelete: "set null" }),
    status: text("status").notNull().default("queued"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    legacyWorkflowCaseId: uuid("legacy_workflow_case_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIntakeIdx: index("workflow_handoffs_company_intake_idx").on(table.companyId, table.intakeId),
    companyStatusIdx: index("workflow_handoffs_company_status_idx").on(table.companyId, table.status),
    legacyWorkflowCaseIdx: index("workflow_handoffs_legacy_workflow_case_idx").on(table.companyId, table.legacyWorkflowCaseId),
  }),
);
