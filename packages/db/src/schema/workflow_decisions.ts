import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { workflowIntakes } from "./workflow_intakes.js";
import { agents } from "./agents.js";

export const workflowDecisions = pgTable(
  "workflow_decisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    intakeId: uuid("intake_id").notNull().references(() => workflowIntakes.id, { onDelete: "cascade" }),
    decision: text("decision").notNull(),
    decidedByAgentId: uuid("decided_by_agent_id").references(() => agents.id),
    decidedByUserId: text("decided_by_user_id"),
    decisionNote: text("decision_note"),
    routeRuleSnapshot: jsonb("route_rule_snapshot").$type<Record<string, unknown>>().notNull().default({}),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    legacyWorkflowCaseId: uuid("legacy_workflow_case_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIntakeIdx: index("workflow_decisions_company_intake_idx").on(table.companyId, table.intakeId),
    companyDecisionIdx: index("workflow_decisions_company_decision_idx").on(table.companyId, table.decision),
    legacyWorkflowCaseIdx: index("workflow_decisions_legacy_workflow_case_idx").on(
      table.companyId,
      table.legacyWorkflowCaseId,
    ),
  }),
);
