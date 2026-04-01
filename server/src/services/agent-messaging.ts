import { and, asc, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agentMessages, agents } from "@paperclipai/db";
import { unprocessable, notFound, forbidden } from "../errors.js";
import { publishLiveEvent } from "./live-events.js";
import { logActivity } from "./activity-log.js";

type AgentMessageRow = typeof agentMessages.$inferSelect;

export interface SendMessageInput {
  senderAgentId: string;
  recipientAgentId: string;
  messageType?: string;
  body: string;
  payload?: Record<string, unknown>;
  threadId?: string | null;
}

interface ListOpts {
  status?: string;
  limit?: number;
  cursor?: string;
}

interface TimelineOpts {
  limit?: number;
  cursor?: string;
  messageType?: string;
}

export function agentMessagingService(db: Db) {
  async function send(
    companyId: string,
    input: SendMessageInput,
    wakeRecipient?: (agentId: string, messageId: string, senderAgentId: string, messageType: string) => Promise<void>,
  ): Promise<AgentMessageRow> {
    // Validate sender
    const sender = await db
      .select({ id: agents.id, companyId: agents.companyId, status: agents.status })
      .from(agents)
      .where(eq(agents.id, input.senderAgentId))
      .then((rows) => rows[0] ?? null);
    if (!sender || sender.companyId !== companyId) {
      throw notFound("Sender agent not found");
    }
    if (sender.status === "terminated") {
      throw forbidden("Terminated agents cannot send messages");
    }

    // Validate recipient
    const recipient = await db
      .select({ id: agents.id, companyId: agents.companyId, status: agents.status })
      .from(agents)
      .where(eq(agents.id, input.recipientAgentId))
      .then((rows) => rows[0] ?? null);
    if (!recipient || recipient.companyId !== companyId) {
      throw notFound("Recipient agent not found");
    }
    if (recipient.status === "terminated") {
      throw unprocessable("Cannot send messages to terminated agents");
    }

    // Validate thread
    let threadId: string | null = input.threadId ?? null;
    if (threadId) {
      const root = await db
        .select({ id: agentMessages.id, threadId: agentMessages.threadId })
        .from(agentMessages)
        .where(eq(agentMessages.id, threadId))
        .then((rows) => rows[0] ?? null);
      if (!root) {
        throw notFound("Thread not found");
      }
      if (root.threadId !== null) {
        throw unprocessable("threadId must reference a root message (threadId must be null)");
      }
    }

    const messageType = input.messageType ?? "direct";

    const [message] = await db
      .insert(agentMessages)
      .values({
        companyId,
        threadId,
        senderAgentId: input.senderAgentId,
        recipientAgentId: input.recipientAgentId,
        messageType,
        body: input.body,
        payload: input.payload ?? {},
        status: "sent",
      })
      .returning();

    // Publish live event
    publishLiveEvent({
      companyId,
      type: "agent.message.received",
      payload: {
        messageId: message.id,
        threadId: message.threadId,
        senderAgentId: input.senderAgentId,
        recipientAgentId: input.recipientAgentId,
        messageType,
      },
    });

    // Log activity
    void logActivity(db, {
      companyId,
      actorType: "agent",
      actorId: input.senderAgentId,
      action: "agent.message_sent",
      entityType: "agent_message",
      entityId: message.id,
      agentId: input.senderAgentId,
      details: {
        recipientAgentId: input.recipientAgentId,
        messageType,
        threadId,
      },
    });

    // Wake recipient
    if (wakeRecipient) {
      void wakeRecipient(input.recipientAgentId, message.id, input.senderAgentId, messageType).catch(() => {});
    }

    return message;
  }

  async function listInbox(companyId: string, agentId: string, opts?: ListOpts) {
    const conditions = [
      eq(agentMessages.companyId, companyId),
      eq(agentMessages.recipientAgentId, agentId),
    ];

    if (opts?.status) {
      conditions.push(eq(agentMessages.status, opts.status));
    }

    if (opts?.cursor) {
      conditions.push(lt(agentMessages.createdAt, new Date(opts.cursor)));
    }

    const limit = opts?.limit ?? 50;

    return db
      .select()
      .from(agentMessages)
      .where(and(...conditions))
      .orderBy(desc(agentMessages.createdAt))
      .limit(limit);
  }

  async function listSent(companyId: string, agentId: string, opts?: ListOpts) {
    const conditions = [
      eq(agentMessages.companyId, companyId),
      eq(agentMessages.senderAgentId, agentId),
    ];

    if (opts?.cursor) {
      conditions.push(lt(agentMessages.createdAt, new Date(opts.cursor)));
    }

    const limit = opts?.limit ?? 50;

    return db
      .select()
      .from(agentMessages)
      .where(and(...conditions))
      .orderBy(desc(agentMessages.createdAt))
      .limit(limit);
  }

  async function listThread(threadId: string) {
    return db
      .select()
      .from(agentMessages)
      .where(
        or(eq(agentMessages.id, threadId), eq(agentMessages.threadId, threadId)),
      )
      .orderBy(asc(agentMessages.createdAt));
  }

  async function markRead(messageId: string, agentId: string) {
    const now = new Date();
    const [updated] = await db
      .update(agentMessages)
      .set({ status: "read", readAt: now, updatedAt: now })
      .where(
        and(eq(agentMessages.id, messageId), eq(agentMessages.recipientAgentId, agentId)),
      )
      .returning();
    if (!updated) throw notFound("Message not found");
    return updated;
  }

  async function markThreadRead(threadId: string, agentId: string) {
    const now = new Date();
    const result = await db
      .update(agentMessages)
      .set({ status: "read", readAt: now, updatedAt: now })
      .where(
        and(
          or(eq(agentMessages.id, threadId), eq(agentMessages.threadId, threadId)),
          eq(agentMessages.recipientAgentId, agentId),
          eq(agentMessages.status, "sent"),
        ),
      )
      .returning();
    return result.length;
  }

  async function listCompanyTimeline(companyId: string, opts?: TimelineOpts) {
    const conditions = [eq(agentMessages.companyId, companyId)];

    if (opts?.messageType) {
      conditions.push(eq(agentMessages.messageType, opts.messageType));
    }

    if (opts?.cursor) {
      conditions.push(lt(agentMessages.createdAt, new Date(opts.cursor)));
    }

    const limit = opts?.limit ?? 50;

    return db
      .select()
      .from(agentMessages)
      .where(and(...conditions))
      .orderBy(desc(agentMessages.createdAt))
      .limit(limit);
  }

  async function countUnread(companyId: string, agentId: string) {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(agentMessages)
      .where(
        and(
          eq(agentMessages.companyId, companyId),
          eq(agentMessages.recipientAgentId, agentId),
          eq(agentMessages.status, "sent"),
        ),
      );
    return row?.count ?? 0;
  }

  return {
    send,
    listInbox,
    listSent,
    listThread,
    listCompanyTimeline,
    markRead,
    markThreadRead,
    countUnread,
  };
}
