import {
  type AnyPgColumn,
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";

export const teams = pgTable(
  "teams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("product_squad"),
    parentTeamId: uuid("parent_team_id").references((): AnyPgColumn => teams.id, { onDelete: "set null" }),
    leadAgentId: uuid("lead_agent_id").references(() => agents.id, { onDelete: "set null" }),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyStatusIdx: index("teams_company_status_idx").on(table.companyId, table.status),
    companyParentIdx: index("teams_company_parent_idx").on(table.companyId, table.parentTeamId),
    companyLeadIdx: index("teams_company_lead_idx").on(table.companyId, table.leadAgentId),
  }),
);

export const agentTeamMemberships = pgTable(
  "agent_team_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
    roleInTeam: text("role_in_team").notNull().default("member"),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyTeamIdx: index("agent_team_memberships_company_team_idx").on(table.companyId, table.teamId),
    companyAgentIdx: index("agent_team_memberships_company_agent_idx").on(table.companyId, table.agentId),
    uniqueAgentTeamIdx: uniqueIndex("agent_team_memberships_agent_team_idx").on(table.agentId, table.teamId),
  }),
);
