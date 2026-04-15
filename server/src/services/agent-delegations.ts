import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agentDelegations, agents, issues } from "@paperclipai/db";
import type {
  AgentDelegation,
  AgentDelegationStatus,
  CreateAgentDelegation,
  IssuePriority,
  ReportAgentDelegation,
  UpdateAgentDelegation,
} from "@paperclipai/shared";
import { AGENT_DELEGATION_STATUSES } from "@paperclipai/shared";
import { conflict, forbidden, notFound, unprocessable } from "../errors.js";
import { logActivity } from "./activity-log.js";
import { agentMessagingService } from "./agent-messaging.js";

export interface AgentDelegationActor {
  actorType: "agent" | "user";
  actorId: string;
  agentId: string | null;
  runId: string | null;
}

type AgentDelegationRow = typeof agentDelegations.$inferSelect;

function normalizeDelegationRow(row: AgentDelegationRow): AgentDelegation {
  return {
    ...row,
    status: row.status as AgentDelegationStatus,
    priority: row.priority as IssuePriority,
    context: row.context ?? {},
  };
}

function normalizeOptionalText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeOptionalDate(value: string | null | undefined) {
  return value ? new Date(value) : null;
}

function isAgentDelegationStatus(value: string): value is AgentDelegationStatus {
  return (AGENT_DELEGATION_STATUSES as readonly string[]).includes(value);
}

export function agentDelegationService(db: Db) {
  const messaging = agentMessagingService(db);

  async function getDelegationRowOrThrow(delegationId: string) {
    const row = await db
      .select()
      .from(agentDelegations)
      .where(eq(agentDelegations.id, delegationId))
      .then((rows) => rows[0] ?? null);
    if (!row) throw notFound("Delegation not found");
    return row;
  }

  async function assertAgentBelongsToCompany(companyId: string, agentId: string, label: string) {
    const agent = await db
      .select({ id: agents.id, companyId: agents.companyId, status: agents.status })
      .from(agents)
      .where(eq(agents.id, agentId))
      .then((rows) => rows[0] ?? null);
    if (!agent || agent.companyId !== companyId) {
      throw notFound(`${label} agent not found`);
    }
    if (agent.status === "pending_approval") {
      throw conflict(`Cannot delegate work to pending approval ${label.toLowerCase()} agents`);
    }
    if (agent.status === "terminated") {
      throw conflict(`Cannot delegate work to terminated ${label.toLowerCase()} agents`);
    }
    return agent;
  }

  async function assertIssueBelongsToCompany(companyId: string, issueId: string, label: string) {
    const issue = await db
      .select({ id: issues.id, companyId: issues.companyId })
      .from(issues)
      .where(eq(issues.id, issueId))
      .then((rows) => rows[0] ?? null);
    if (!issue || issue.companyId !== companyId) {
      throw notFound(`${label} issue not found`);
    }
  }

  async function assertParentDelegation(companyId: string, parentDelegationId: string | null | undefined) {
    if (!parentDelegationId) return null;
    const parent = await db
      .select()
      .from(agentDelegations)
      .where(and(eq(agentDelegations.id, parentDelegationId), eq(agentDelegations.companyId, companyId)))
      .then((rows) => rows[0] ?? null);
    if (!parent) throw notFound("Parent delegation not found");
    if (["done", "cancelled", "failed"].includes(parent.status)) {
      throw conflict("Cannot create child delegations under a terminal delegation");
    }
    return parent;
  }

  async function listDelegations(
    companyId: string,
    filters?: {
      status?: string;
      statuses?: string[];
      delegatorAgentId?: string;
      delegateAgentId?: string;
      parentDelegationId?: string;
      rootIssueId?: string;
      linkedIssueId?: string;
      limit?: number;
    },
  ) {
    const conditions = [eq(agentDelegations.companyId, companyId)];
    if (filters?.status) conditions.push(eq(agentDelegations.status, filters.status));
    const statuses = filters?.statuses?.filter(isAgentDelegationStatus) ?? [];
    if (statuses.length > 0) {
      conditions.push(inArray(agentDelegations.status, statuses));
    }
    if (filters?.delegatorAgentId) conditions.push(eq(agentDelegations.delegatorAgentId, filters.delegatorAgentId));
    if (filters?.delegateAgentId) conditions.push(eq(agentDelegations.delegateAgentId, filters.delegateAgentId));
    if (filters?.parentDelegationId) conditions.push(eq(agentDelegations.parentDelegationId, filters.parentDelegationId));
    if (filters?.rootIssueId) conditions.push(eq(agentDelegations.rootIssueId, filters.rootIssueId));
    if (filters?.linkedIssueId) conditions.push(eq(agentDelegations.linkedIssueId, filters.linkedIssueId));

    const limit = Math.min(Math.max(filters?.limit ?? 100, 1), 200);
    const rows = await db
      .select()
      .from(agentDelegations)
      .where(and(...conditions))
      .orderBy(desc(agentDelegations.updatedAt))
      .limit(limit);
    return rows.map(normalizeDelegationRow);
  }

  async function getDelegation(delegationId: string) {
    return normalizeDelegationRow(await getDelegationRowOrThrow(delegationId));
  }

  async function getCompanyDelegation(companyId: string, delegationId: string) {
    const row = await db
      .select()
      .from(agentDelegations)
      .where(and(eq(agentDelegations.id, delegationId), eq(agentDelegations.companyId, companyId)))
      .then((rows) => rows[0] ?? null);
    if (!row) throw notFound("Delegation not found");
    return normalizeDelegationRow(row);
  }

  async function create(companyId: string, input: CreateAgentDelegation, actor: AgentDelegationActor) {
    if (actor.actorType === "agent" && input.delegatorAgentId && input.delegatorAgentId !== actor.agentId) {
      throw forbidden("Agents cannot create delegations on behalf of another delegator");
    }
    const delegatorAgentId = actor.actorType === "agent" ? actor.agentId : input.delegatorAgentId;
    if (!delegatorAgentId) {
      throw unprocessable("delegatorAgentId is required when a board user creates a delegation");
    }

    if (input.idempotencyKey) {
      const existing = await db
        .select()
        .from(agentDelegations)
        .where(and(eq(agentDelegations.companyId, companyId), eq(agentDelegations.idempotencyKey, input.idempotencyKey)))
        .then((rows) => rows[0] ?? null);
      if (existing) return normalizeDelegationRow(existing);
    }

    const [delegator, delegate, parent] = await Promise.all([
      assertAgentBelongsToCompany(companyId, delegatorAgentId, "Delegator"),
      assertAgentBelongsToCompany(companyId, input.delegateAgentId, "Delegate"),
      assertParentDelegation(companyId, input.parentDelegationId),
    ]);
    if (delegator.id === delegate.id) {
      throw conflict("Delegator and delegate must be different agents");
    }

    const linkedIssueId = input.linkedIssueId ?? null;
    const rootIssueId = input.rootIssueId ?? parent?.rootIssueId ?? linkedIssueId ?? null;
    await Promise.all([
      rootIssueId ? assertIssueBelongsToCompany(companyId, rootIssueId, "Root") : Promise.resolve(),
      linkedIssueId ? assertIssueBelongsToCompany(companyId, linkedIssueId, "Linked") : Promise.resolve(),
    ]);

    const now = new Date();
    const [created] = await db
      .insert(agentDelegations)
      .values({
        companyId,
        parentDelegationId: input.parentDelegationId ?? null,
        rootIssueId,
        linkedIssueId,
        sourceMessageId: null,
        delegatorAgentId,
        delegateAgentId: input.delegateAgentId,
        status: "queued",
        title: input.title.trim(),
        brief: normalizeOptionalText(input.brief),
        acceptanceCriteria: normalizeOptionalText(input.acceptanceCriteria),
        context: input.context ?? {},
        result: null,
        priority: input.priority ?? "medium",
        dueAt: normalizeOptionalDate(input.dueAt),
        idempotencyKey: normalizeOptionalText(input.idempotencyKey),
        createdRunId: actor.runId,
        claimedRunId: null,
        completedRunId: null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    void logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "agent_delegation.created",
      entityType: "agent_delegation",
      entityId: created.id,
      details: {
        delegatorAgentId,
        delegateAgentId: input.delegateAgentId,
        parentDelegationId: input.parentDelegationId ?? null,
        rootIssueId,
        linkedIssueId,
      },
    });

    return normalizeDelegationRow(created);
  }

  async function createSourceMessage(delegationId: string) {
    const delegation = await getDelegationRowOrThrow(delegationId);
    if (delegation.sourceMessageId) return normalizeDelegationRow(delegation);

    const body = [
      `Delegation: ${delegation.title}`,
      delegation.brief,
      delegation.acceptanceCriteria ? `Acceptance criteria:\n${delegation.acceptanceCriteria}` : null,
      delegation.linkedIssueId ? `Linked issue: ${delegation.linkedIssueId}` : null,
      delegation.rootIssueId && delegation.rootIssueId !== delegation.linkedIssueId
        ? `Root issue: ${delegation.rootIssueId}`
        : null,
    ].filter(Boolean).join("\n\n");

    const message = await messaging.send(delegation.companyId, {
      senderAgentId: delegation.delegatorAgentId,
      recipientAgentId: delegation.delegateAgentId,
      messageType: "delegation",
      body,
      payload: {
        delegationId: delegation.id,
        parentDelegationId: delegation.parentDelegationId,
        rootIssueId: delegation.rootIssueId,
        linkedIssueId: delegation.linkedIssueId,
      },
    });

    const [updated] = await db
      .update(agentDelegations)
      .set({ sourceMessageId: message.id, updatedAt: new Date() })
      .where(eq(agentDelegations.id, delegation.id))
      .returning();
    return normalizeDelegationRow(updated ?? delegation);
  }

  async function update(delegationId: string, input: UpdateAgentDelegation, actor: AgentDelegationActor) {
    const current = await getDelegationRowOrThrow(delegationId);
    if (input.linkedIssueId) {
      await assertIssueBelongsToCompany(current.companyId, input.linkedIssueId, "Linked");
    }

    const now = new Date();
    const nextStatus = input.status ?? current.status;
    const patch: Partial<typeof agentDelegations.$inferInsert> = {
      updatedAt: now,
    };
    if (input.status) {
      patch.status = input.status;
      if (input.status === "claimed" && !current.claimedAt) patch.claimedAt = now;
      if (input.status === "in_progress" && !current.startedAt) patch.startedAt = now;
      if (input.status === "reported" && !current.reportedAt) patch.reportedAt = now;
      if (input.status === "done" && !current.completedAt) patch.completedAt = now;
      if (input.status === "cancelled" && !current.cancelledAt) patch.cancelledAt = now;
    }
    if (input.title !== undefined) patch.title = input.title.trim();
    if (input.brief !== undefined) patch.brief = normalizeOptionalText(input.brief);
    if (input.acceptanceCriteria !== undefined) patch.acceptanceCriteria = normalizeOptionalText(input.acceptanceCriteria);
    if (input.context !== undefined) patch.context = input.context;
    if (input.result !== undefined) patch.result = normalizeOptionalText(input.result);
    if (input.priority !== undefined) patch.priority = input.priority;
    if (input.dueAt !== undefined) patch.dueAt = normalizeOptionalDate(input.dueAt);
    if (input.linkedIssueId !== undefined) patch.linkedIssueId = input.linkedIssueId ?? null;
    if (nextStatus === "done" || nextStatus === "reported") {
      patch.completedRunId = actor.runId;
    }

    const [updated] = await db
      .update(agentDelegations)
      .set(patch)
      .where(eq(agentDelegations.id, delegationId))
      .returning();
    if (!updated) throw notFound("Delegation not found");

    void logActivity(db, {
      companyId: updated.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "agent_delegation.updated",
      entityType: "agent_delegation",
      entityId: updated.id,
      details: { status: updated.status },
    });

    return normalizeDelegationRow(updated);
  }

  async function claim(delegationId: string, actor: AgentDelegationActor) {
    const current = await getDelegationRowOrThrow(delegationId);
    const now = new Date();
    const [updated] = await db
      .update(agentDelegations)
      .set({
        status: current.status === "queued" ? "claimed" : current.status,
        claimedAt: current.claimedAt ?? now,
        claimedRunId: actor.runId,
        updatedAt: now,
      })
      .where(eq(agentDelegations.id, delegationId))
      .returning();
    if (!updated) throw notFound("Delegation not found");

    void logActivity(db, {
      companyId: updated.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "agent_delegation.claimed",
      entityType: "agent_delegation",
      entityId: updated.id,
      details: {},
    });

    return normalizeDelegationRow(updated);
  }

  async function report(delegationId: string, input: ReportAgentDelegation, actor: AgentDelegationActor) {
    const current = await getDelegationRowOrThrow(delegationId);
    if (input.linkedIssueId) {
      await assertIssueBelongsToCompany(current.companyId, input.linkedIssueId, "Linked");
    }
    const now = new Date();
    const status = input.status ?? "reported";
    const [updated] = await db
      .update(agentDelegations)
      .set({
        status,
        result: input.result.trim(),
        linkedIssueId: input.linkedIssueId === undefined ? current.linkedIssueId : input.linkedIssueId,
        reportedAt: now,
        completedAt: status === "done" ? now : current.completedAt,
        completedRunId: actor.runId,
        updatedAt: now,
      })
      .where(eq(agentDelegations.id, delegationId))
      .returning();
    if (!updated) throw notFound("Delegation not found");

    void logActivity(db, {
      companyId: updated.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "agent_delegation.reported",
      entityType: "agent_delegation",
      entityId: updated.id,
      details: { status: updated.status },
    });

    return normalizeDelegationRow(updated);
  }

  async function cancel(delegationId: string, actor: AgentDelegationActor) {
    const now = new Date();
    const [updated] = await db
      .update(agentDelegations)
      .set({
        status: "cancelled",
        cancelledAt: now,
        updatedAt: now,
      })
      .where(eq(agentDelegations.id, delegationId))
      .returning();
    if (!updated) throw notFound("Delegation not found");

    void logActivity(db, {
      companyId: updated.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "agent_delegation.cancelled",
      entityType: "agent_delegation",
      entityId: updated.id,
      details: {},
    });

    return normalizeDelegationRow(updated);
  }

  return {
    listDelegations,
    getDelegation,
    getCompanyDelegation,
    create,
    createSourceMessage,
    update,
    claim,
    report,
    cancel,
  };
}
