import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { workflowIntakes } from "./workflow_intakes.js";
import { workflowBriefs } from "./workflow_briefs.js";
import { agents } from "./agents.js";

export const workflowReviews = pgTable(
  "workflow_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    intakeId: uuid("intake_id").notNull().references(() => workflowIntakes.id, { onDelete: "cascade" }),
    briefId: uuid("brief_id").references(() => workflowBriefs.id, { onDelete: "set null" }),
    reviewerRole: text("reviewer_role").notNull(),
    reviewerAgentId: uuid("reviewer_agent_id").references(() => agents.id),
    reviewerUserId: text("reviewer_user_id"),
    status: text("status").notNull(),
    decisionNote: text("decision_note"),
    reviewSummary: text("review_summary"),
    legacyReviewId: uuid("legacy_review_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIntakeCreatedIdx: index("workflow_reviews_company_intake_created_idx").on(
      table.companyId,
      table.intakeId,
      table.createdAt,
    ),
    companyRoleStatusIdx: index("workflow_reviews_company_role_status_idx").on(
      table.companyId,
      table.reviewerRole,
      table.status,
    ),
    legacyReviewIdx: index("workflow_reviews_legacy_review_idx").on(table.companyId, table.legacyReviewId),
  }),
);
