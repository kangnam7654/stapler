import { pgTable, uuid, text, timestamp, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const workflowRouteRules = pgTable(
  "workflow_route_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    category: text("category").notNull(),
    primaryReviewerRole: text("primary_reviewer_role").notNull(),
    secondaryReviewerRole: text("secondary_reviewer_role"),
    finalApproverRole: text("final_approver_role").notNull(),
    boardApprovalRequired: boolean("board_approval_required").notNull().default(false),
    executionTarget: text("execution_target").notNull().default("issue"),
    isEnabled: boolean("is_enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyCategoryUq: uniqueIndex("workflow_route_rules_company_category_uq").on(
      table.companyId,
      table.category,
    ),
    companyEnabledCategoryIdx: index("workflow_route_rules_company_enabled_category_idx").on(
      table.companyId,
      table.isEnabled,
      table.category,
    ),
  }),
);
