import { type AnyPgColumn, pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";

export const agentMessages = pgTable(
  "agent_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    threadId: uuid("thread_id").references((): AnyPgColumn => agentMessages.id),
    senderAgentId: uuid("sender_agent_id").notNull().references(() => agents.id),
    recipientAgentId: uuid("recipient_agent_id").notNull().references(() => agents.id),
    messageType: text("message_type").notNull().default("direct"),
    body: text("body").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status").notNull().default("sent"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    recipientIdx: index("agent_messages_recipient_idx").on(
      table.companyId,
      table.recipientAgentId,
      table.status,
      table.createdAt,
    ),
    senderIdx: index("agent_messages_sender_idx").on(
      table.companyId,
      table.senderAgentId,
      table.createdAt,
    ),
    threadIdx: index("agent_messages_thread_idx").on(table.threadId, table.createdAt),
  }),
);
