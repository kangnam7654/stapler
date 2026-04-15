import { pgTable, uuid, text, timestamp, integer, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { workflowIntakes } from "./workflow_intakes.js";
import { agents } from "./agents.js";

export const workflowBriefs = pgTable(
  "workflow_briefs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    intakeId: uuid("intake_id").notNull().references(() => workflowIntakes.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    executionTarget: text("execution_target").notNull().default("issue"),
    authorAgentId: uuid("author_agent_id").references(() => agents.id),
    authorUserId: text("author_user_id"),
    supersedesBriefId: uuid("supersedes_brief_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    legacyArtifactId: uuid("legacy_artifact_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    caseVersionUq: uniqueIndex("workflow_briefs_intake_version_uq").on(table.intakeId, table.version),
    companyIntakeVersionIdx: index("workflow_briefs_company_intake_version_idx").on(
      table.companyId,
      table.intakeId,
      table.version,
    ),
    companyAuthorIdx: index("workflow_briefs_company_author_idx").on(
      table.companyId,
      table.authorAgentId,
      table.createdAt,
    ),
    legacyArtifactIdx: index("workflow_briefs_legacy_artifact_idx").on(table.companyId, table.legacyArtifactId),
  }),
);
