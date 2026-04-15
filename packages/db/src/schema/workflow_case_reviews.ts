import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { workflowCases } from "./workflow_cases.js";
import { workflowCaseArtifacts } from "./workflow_case_artifacts.js";
import { agents } from "./agents.js";

export const workflowCaseReviews = pgTable(
  "workflow_case_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    workflowCaseId: uuid("workflow_case_id").notNull().references(() => workflowCases.id, { onDelete: "cascade" }),
    artifactId: uuid("artifact_id").references(() => workflowCaseArtifacts.id, { onDelete: "set null" }),
    reviewerRole: text("reviewer_role").notNull(),
    reviewerAgentId: uuid("reviewer_agent_id").references(() => agents.id),
    reviewerUserId: text("reviewer_user_id"),
    status: text("status").notNull(),
    decisionNote: text("decision_note"),
    reviewSummary: text("review_summary"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyCaseCreatedIdx: index("workflow_case_reviews_company_case_created_idx").on(
      table.companyId,
      table.workflowCaseId,
      table.createdAt,
    ),
    companyRoleStatusIdx: index("workflow_case_reviews_company_role_status_idx").on(
      table.companyId,
      table.reviewerRole,
      table.status,
    ),
  }),
);
