import { pgTable, uuid, text, timestamp, jsonb, integer, index, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { workflowCases } from "./workflow_cases.js";
import { agents } from "./agents.js";

export const workflowCaseArtifacts = pgTable(
  "workflow_case_artifacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    workflowCaseId: uuid("workflow_case_id").notNull().references(() => workflowCases.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    authorAgentId: uuid("author_agent_id").references(() => agents.id),
    authorUserId: text("author_user_id"),
    supersedesArtifactId: uuid("supersedes_artifact_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    caseVersionUq: uniqueIndex("workflow_case_artifacts_case_version_uq").on(
      table.workflowCaseId,
      table.version,
    ),
    companyCaseVersionIdx: index("workflow_case_artifacts_company_case_version_idx").on(
      table.companyId,
      table.workflowCaseId,
      table.version,
    ),
    companyAuthorIdx: index("workflow_case_artifacts_company_author_idx").on(
      table.companyId,
      table.authorAgentId,
      table.createdAt,
    ),
  }),
);
