import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  workflowCases,
  workflowIntakes,
  workflowBriefs,
  workflowReviews,
  workflowDecisions,
  workflowHandoffs,
  workflowCaseArtifacts,
  workflowCaseReviews,
  workflowRouteRules,
} from "@paperclipai/db";
import type {
  CreateWorkflowArtifact,
  CreateWorkflowCase,
  CreateWorkflowRouteRule,
  ResolveWorkflowCase,
  SubmitWorkflowReview,
  UpdateWorkflowCase,
  UpdateWorkflowRouteRule,
  WorkflowCategory,
  WorkflowExecutionTarget,
} from "@paperclipai/shared";
import { notFound, unprocessable } from "../errors.js";
import { agentService } from "./agents.js";
import { approvalService } from "./approvals.js";
import { issueService } from "./issues.js";
import { logActivity } from "./activity-log.js";

type ActorInfo = {
  actorType: "agent" | "user";
  actorId: string;
  agentId: string | null;
  runId: string | null;
};

type DefaultRouteRule = {
  primaryReviewerRole: string;
  secondaryReviewerRole: string | null;
  finalApproverRole: string;
  boardApprovalRequired: boolean;
  executionTarget: WorkflowExecutionTarget;
};

const DEFAULT_ROUTE_RULES: Record<WorkflowCategory, DefaultRouteRule> = {
  engineering: {
    primaryReviewerRole: "cto",
    secondaryReviewerRole: "ceo",
    finalApproverRole: "cto",
    boardApprovalRequired: false,
    executionTarget: "issue",
  },
  hiring: {
    primaryReviewerRole: "chro",
    secondaryReviewerRole: "cto",
    finalApproverRole: "ceo",
    boardApprovalRequired: false,
    executionTarget: "agent_hire",
  },
  budget: {
    primaryReviewerRole: "cfo",
    secondaryReviewerRole: "ceo",
    finalApproverRole: "ceo",
    boardApprovalRequired: true,
    executionTarget: "approval",
  },
  product_planning: {
    primaryReviewerRole: "pm",
    secondaryReviewerRole: "cto",
    finalApproverRole: "ceo",
    boardApprovalRequired: false,
    executionTarget: "issue",
  },
  strategy_planning: {
    primaryReviewerRole: "ceo",
    secondaryReviewerRole: "cfo",
    finalApproverRole: "ceo",
    boardApprovalRequired: true,
    executionTarget: "approval",
  },
  execution_planning: {
    primaryReviewerRole: "cmo",
    secondaryReviewerRole: "cto",
    finalApproverRole: "ceo",
    boardApprovalRequired: false,
    executionTarget: "issue",
  },
  tech_planning: {
    primaryReviewerRole: "cto",
    secondaryReviewerRole: "ceo",
    finalApproverRole: "cto",
    boardApprovalRequired: false,
    executionTarget: "issue",
  },
  marketing: {
    primaryReviewerRole: "cmo",
    secondaryReviewerRole: "ceo",
    finalApproverRole: "ceo",
    boardApprovalRequired: false,
    executionTarget: "issue",
  },
  operations: {
    primaryReviewerRole: "cfo",
    secondaryReviewerRole: "chro",
    finalApproverRole: "ceo",
    boardApprovalRequired: false,
    executionTarget: "issue",
  },
  governance: {
    primaryReviewerRole: "ceo",
    secondaryReviewerRole: "cfo",
    finalApproverRole: "ceo",
    boardApprovalRequired: true,
    executionTarget: "approval",
  },
  general: {
    primaryReviewerRole: "ceo",
    secondaryReviewerRole: "cto",
    finalApproverRole: "ceo",
    boardApprovalRequired: false,
    executionTarget: "issue",
  },
};

function getDefaultRouteRule(category: WorkflowCategory): DefaultRouteRule {
  return DEFAULT_ROUTE_RULES[category];
}

function normalizeRouteRule(row: typeof workflowRouteRules.$inferSelect) {
  return {
    ...row,
    boardApprovalRequired: Boolean(row.boardApprovalRequired),
    isEnabled: Boolean(row.isEnabled),
  };
}

function normalizeCaseRow(row: typeof workflowCases.$inferSelect) {
  return {
    ...row,
    details: (row.details ?? {}) as Record<string, unknown>,
    boardApprovalRequired: Boolean(row.boardApprovalRequired),
    dueAt: row.dueAt ?? null,
    startedAt: row.startedAt ?? null,
    completedAt: row.completedAt ?? null,
    cancelledAt: row.cancelledAt ?? null,
  };
}

function normalizeIntakeRow(row: typeof workflowIntakes.$inferSelect) {
  return {
    ...row,
    details: (row.details ?? {}) as Record<string, unknown>,
    routeRuleSnapshot: (row.routeRuleSnapshot ?? {}) as Record<string, unknown>,
    dueAt: row.dueAt ?? null,
    startedAt: row.startedAt ?? null,
    completedAt: row.completedAt ?? null,
    cancelledAt: row.cancelledAt ?? null,
  };
}

function normalizeBriefRow(row: typeof workflowBriefs.$inferSelect) {
  return {
    ...row,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
  };
}

function normalizeDecisionRow(row: typeof workflowDecisions.$inferSelect) {
  return {
    ...row,
    routeRuleSnapshot: (row.routeRuleSnapshot ?? {}) as Record<string, unknown>,
  };
}

function normalizeHandoffRow(row: typeof workflowHandoffs.$inferSelect) {
  return {
    ...row,
  };
}

function serializeWorkflowDetailValue(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatWorkflowCaseDetails(details: Record<string, unknown>) {
  const lines = Object.entries(details)
    .map(([key, value]) => {
      const serialized = serializeWorkflowDetailValue(value);
      return serialized ? `- ${key}: ${serialized}` : null;
    })
    .filter((line): line is string => Boolean(line));
  if (lines.length === 0) return null;
  return ["Details:", ...lines].join("\n");
}

function formatWorkflowBriefBody(caseRow: {
  summary: string | null;
  details: Record<string, unknown>;
}) {
  const detailsText = formatWorkflowCaseDetails(caseRow.details);
  return [caseRow.summary, detailsText].filter(Boolean).join("\n\n") || "";
}

function normalizeArtifactRow(row: typeof workflowCaseArtifacts.$inferSelect) {
  return {
    ...row,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
  };
}

function normalizeReviewRow(row: typeof workflowCaseReviews.$inferSelect) {
  return row;
}

function assertKnownCategory(category: string): asserts category is WorkflowCategory {
  if (!(category in DEFAULT_ROUTE_RULES)) {
    throw unprocessable(`Unknown workflow category: ${category}`);
  }
}

export function workflowService(db: Db) {
  const agents = agentService(db);
  const issues = issueService(db);
  const approvalSvc = approvalService(db);

  async function assertAgentBelongsToCompany(companyId: string, agentId: string | null | undefined) {
    if (!agentId) return;
    const agent = await agents.getById(agentId);
    if (!agent || agent.companyId !== companyId) {
      throw unprocessable("Referenced agent must belong to the same company");
    }
  }

  async function getCaseOrThrow(caseId: string) {
    const row = await db
      .select()
      .from(workflowCases)
      .where(eq(workflowCases.id, caseId))
      .then((rows) => rows[0] ?? null);
    if (!row) throw notFound("Workflow case not found");
    return row;
  }

  async function getCompanyCaseOrThrow(companyId: string, caseId: string) {
    const row = await db
      .select()
      .from(workflowCases)
      .where(and(eq(workflowCases.id, caseId), eq(workflowCases.companyId, companyId)))
      .then((rows) => rows[0] ?? null);
    if (!row) throw notFound("Workflow case not found");
    return row;
  }

  async function getIntakeByLegacyCaseId(caseId: string) {
    return db
      .select()
      .from(workflowIntakes)
      .where(eq(workflowIntakes.legacyWorkflowCaseId, caseId))
      .then((rows) => rows[0] ?? null);
  }

  async function getBriefsByIntakeId(intakeId: string) {
    const rows = await db
      .select()
      .from(workflowBriefs)
      .where(eq(workflowBriefs.intakeId, intakeId));
    return rows.sort((a, b) => {
      if (a.version !== b.version) return b.version - a.version;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }

  async function getLatestBriefForIntake(intakeId: string) {
    return getBriefsByIntakeId(intakeId).then((rows) => rows[0] ?? null);
  }

  async function upsertIntakeMirror(caseRow: typeof workflowCases.$inferSelect, now = new Date()) {
    const current = await getIntakeByLegacyCaseId(caseRow.id);
    const payload = {
      companyId: caseRow.companyId,
      kind: caseRow.kind,
      category: caseRow.category,
      status: caseRow.status,
      title: caseRow.title,
      summary: caseRow.summary,
      details: caseRow.details ?? {},
      delegationTargetAgentId: null,
      delegationMode: null,
      requestedByAgentId: caseRow.requestedByAgentId,
      requestedByUserId: caseRow.requestedByUserId,
      requestedFromIssueId: caseRow.requestedFromIssueId,
      priority: caseRow.priority,
      routeRuleSnapshot: caseRow.routeRuleSnapshot ?? {},
      dueAt: caseRow.dueAt,
      startedAt: caseRow.startedAt,
      completedAt: caseRow.completedAt,
      cancelledAt: caseRow.cancelledAt,
      legacyWorkflowCaseId: caseRow.id,
      updatedAt: now,
    };
    if (current) {
      const [updated] = await db
        .update(workflowIntakes)
        .set(payload)
        .where(eq(workflowIntakes.id, current.id))
        .returning();
      return updated ?? current;
    }
    const [created] = await db
      .insert(workflowIntakes)
      .values({
        ...payload,
        createdAt: now,
      })
      .returning();
    return created;
  }

  async function syncBriefMirror(
    caseRow: typeof workflowCases.$inferSelect,
    actor: ActorInfo,
    intakeRow?: typeof workflowIntakes.$inferSelect | null,
    now = new Date(),
  ) {
    const resolvedIntake = intakeRow ?? (await getIntakeByLegacyCaseId(caseRow.id));
    if (!resolvedIntake) return null;
    const title = caseRow.title;
    const body = formatWorkflowBriefBody(caseRow);
    const existing = await getLatestBriefForIntake(resolvedIntake.id);
    if (existing && existing.title === title && existing.body === body && existing.executionTarget === caseRow.executionTarget) {
      return existing;
    }
    const nextVersion = existing ? existing.version + 1 : 1;
    const [created] = await db
      .insert(workflowBriefs)
      .values({
        companyId: caseRow.companyId,
        intakeId: resolvedIntake.id,
        version: nextVersion,
        title,
        body,
        executionTarget: caseRow.executionTarget,
        authorAgentId: actor.agentId,
        authorUserId: actor.actorType === "user" ? actor.actorId : null,
        supersedesBriefId: existing?.id ?? null,
        metadata: {
          kind: caseRow.kind,
          category: caseRow.category,
          priority: caseRow.priority,
          routeRuleSnapshot: caseRow.routeRuleSnapshot ?? {},
        },
        legacyArtifactId: null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return created ?? null;
  }

  async function syncReviewMirror(
    caseRow: typeof workflowCases.$inferSelect,
    reviewRow: typeof workflowCaseReviews.$inferSelect,
    intakeRow?: typeof workflowIntakes.$inferSelect | null,
    now = new Date(),
  ) {
    const resolvedIntake = intakeRow ?? (await getIntakeByLegacyCaseId(caseRow.id));
    if (!resolvedIntake) return null;
    const latestBrief = await getLatestBriefForIntake(resolvedIntake.id);
    const [created] = await db
      .insert(workflowReviews)
      .values({
        companyId: caseRow.companyId,
        intakeId: resolvedIntake.id,
        briefId: latestBrief?.id ?? null,
        reviewerRole: reviewRow.reviewerRole,
        reviewerAgentId: reviewRow.reviewerAgentId,
        reviewerUserId: reviewRow.reviewerUserId,
        status: reviewRow.status,
        decisionNote: reviewRow.decisionNote,
        reviewSummary: reviewRow.reviewSummary,
        legacyReviewId: reviewRow.id,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return created ?? null;
  }

  async function syncDecisionMirror(
    caseRow: typeof workflowCases.$inferSelect,
    actor: ActorInfo,
    decision: string,
    decisionNote: string | null,
    intakeRow?: typeof workflowIntakes.$inferSelect | null,
    now = new Date(),
  ) {
    const resolvedIntake = intakeRow ?? (await getIntakeByLegacyCaseId(caseRow.id));
    if (!resolvedIntake) return null;
    const [created] = await db
      .insert(workflowDecisions)
      .values({
        companyId: caseRow.companyId,
        intakeId: resolvedIntake.id,
        decision,
        decidedByAgentId: actor.agentId,
        decidedByUserId: actor.actorType === "user" ? actor.actorId : null,
        decisionNote,
        routeRuleSnapshot: caseRow.routeRuleSnapshot ?? {},
        decidedAt: now,
        legacyWorkflowCaseId: caseRow.id,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return created ?? null;
  }

  async function syncHandoffMirror(
    caseRow: typeof workflowCases.$inferSelect,
    linkedIssueId: string | null,
    linkedApprovalId: string | null,
    status: string,
    decisionRow?: typeof workflowDecisions.$inferSelect | null,
    intakeRow?: typeof workflowIntakes.$inferSelect | null,
    now = new Date(),
  ) {
    const resolvedIntake = intakeRow ?? (await getIntakeByLegacyCaseId(caseRow.id));
    if (!resolvedIntake) return null;
    const [created] = await db
      .insert(workflowHandoffs)
      .values({
        companyId: caseRow.companyId,
        intakeId: resolvedIntake.id,
        decisionId: decisionRow?.id ?? null,
        executionTarget: caseRow.executionTarget,
        linkedIssueId,
        linkedApprovalId,
        status,
        startedAt: now,
        completedAt: now,
        legacyWorkflowCaseId: caseRow.id,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return created ?? null;
  }

  async function getRouteRule(companyId: string, category: WorkflowCategory) {
    const existing = await db
      .select()
      .from(workflowRouteRules)
      .where(and(eq(workflowRouteRules.companyId, companyId), eq(workflowRouteRules.category, category), eq(workflowRouteRules.isEnabled, true)))
      .then((rows) => rows[0] ?? null);
    if (existing) return normalizeRouteRule(existing);
    return getDefaultRouteRule(category);
  }

  async function createDownstreamApproval(
    caseRow: typeof workflowCases.$inferSelect,
    actor: ActorInfo,
    approvalType: "hire_agent" | "approve_ceo_strategy" | "budget_override_required",
  ) {
    const payload = {
      workflowCaseId: caseRow.id,
      category: caseRow.category,
      kind: caseRow.kind,
      title: caseRow.title,
      summary: caseRow.summary,
      details: caseRow.details,
      requestedFromIssueId: caseRow.requestedFromIssueId,
      requestedByAgentId: caseRow.requestedByAgentId,
      requestedByUserId: caseRow.requestedByUserId,
      primaryReviewerRole: caseRow.primaryReviewerRole,
      secondaryReviewerRole: caseRow.secondaryReviewerRole,
      finalApproverRole: caseRow.finalApproverRole,
      executionTarget: caseRow.executionTarget,
    };
    const approval = await approvalSvc.create(caseRow.companyId, {
      type: approvalType,
      requestedByAgentId: actor.agentId,
      requestedByUserId: actor.actorType === "user" ? actor.actorId : null,
      status: "pending",
      payload,
      decisionNote: null,
      decidedByUserId: null,
      decidedAt: null,
      updatedAt: new Date(),
    });
    return approval;
  }

  async function executeApprovedCase(
    caseRow: typeof workflowCases.$inferSelect,
    actor: ActorInfo,
    intakeRow?: typeof workflowIntakes.$inferSelect | null,
    decisionRow?: typeof workflowDecisions.$inferSelect | null,
  ) {
    if (caseRow.linkedIssueId || caseRow.linkedApprovalId) {
      return { caseRow, linkedIssueId: caseRow.linkedIssueId, linkedApprovalId: caseRow.linkedApprovalId };
    }

    if (caseRow.executionTarget === "issue") {
      const detailsText = formatWorkflowCaseDetails(caseRow.details);
      const description = [caseRow.summary, detailsText].filter(Boolean).join("\n\n") || null;
      const created = await issues.create(caseRow.companyId, {
        title: caseRow.title,
        description,
        status: "todo",
        priority: caseRow.priority as "critical" | "high" | "medium" | "low",
        assigneeAgentId: caseRow.requestedByAgentId,
        assigneeUserId: null,
        requestDepth: 0,
        billingCode: null,
        executionWorkspaceId: null,
        executionWorkspacePreference: null,
        executionWorkspaceSettings: null,
        createdByAgentId: actor.agentId,
        createdByUserId: actor.actorType === "user" ? actor.actorId : null,
        originKind: "manual",
        originId: caseRow.id,
        originRunId: null,
        parentId: caseRow.requestedFromIssueId,
      });

      await db
        .update(workflowCases)
        .set({
          linkedIssueId: created.id,
          status: "done",
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(workflowCases.id, caseRow.id));

      await logActivity(db, {
        companyId: caseRow.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "workflow_case.executed",
        entityType: "workflow_case",
        entityId: caseRow.id,
        details: { executionTarget: "issue", linkedIssueId: created.id },
      });

      if (intakeRow) {
        await db
          .update(workflowIntakes)
          .set({
            status: "done",
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(workflowIntakes.id, intakeRow.id));
      }
      await syncHandoffMirror(caseRow, created.id, null, "done", decisionRow, intakeRow);

      return { caseRow: { ...caseRow, linkedIssueId: created.id, status: "done" as const }, linkedIssueId: created.id, linkedApprovalId: null };
    }

    const approvalType =
      caseRow.executionTarget === "agent_hire"
        ? "hire_agent"
        : caseRow.category === "budget"
          ? "budget_override_required"
          : "approve_ceo_strategy";
    const approval = await createDownstreamApproval(caseRow, actor, approvalType);

    await db
      .update(workflowCases)
      .set({
        linkedApprovalId: approval.id,
        status: "done",
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(workflowCases.id, caseRow.id));

    await logActivity(db, {
      companyId: caseRow.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "workflow_case.executed",
      entityType: "workflow_case",
      entityId: caseRow.id,
      details: { executionTarget: caseRow.executionTarget, linkedApprovalId: approval.id, approvalType },
    });

    if (intakeRow) {
      await db
        .update(workflowIntakes)
        .set({
          status: "done",
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(workflowIntakes.id, intakeRow.id));
    }
    await syncHandoffMirror(caseRow, null, approval.id, "done", decisionRow, intakeRow);

    return { caseRow: { ...caseRow, linkedApprovalId: approval.id, status: "done" as const }, linkedIssueId: null, linkedApprovalId: approval.id };
  }

  return {
    getDefaultRouteRule,

    listCases: async (
      companyId: string,
      filters?: {
        status?: string;
        category?: string;
        kind?: string;
        requestedByAgentId?: string;
        linkedIssueId?: string;
        linkedApprovalId?: string;
      },
    ) => {
      const conditions = [eq(workflowCases.companyId, companyId)];
      if (filters?.status) conditions.push(eq(workflowCases.status, filters.status));
      if (filters?.category) conditions.push(eq(workflowCases.category, filters.category));
      if (filters?.kind) conditions.push(eq(workflowCases.kind, filters.kind));
      if (filters?.requestedByAgentId) conditions.push(eq(workflowCases.requestedByAgentId, filters.requestedByAgentId));
      if (filters?.linkedIssueId) conditions.push(eq(workflowCases.linkedIssueId, filters.linkedIssueId));
      if (filters?.linkedApprovalId) conditions.push(eq(workflowCases.linkedApprovalId, filters.linkedApprovalId));
      const rows = await db
        .select()
        .from(workflowCases)
        .where(and(...conditions))
        .orderBy(desc(workflowCases.updatedAt));
      return rows.map(normalizeCaseRow);
    },

    getCase: async (caseId: string) => {
      const row = await getCaseOrThrow(caseId);
      return normalizeCaseRow(row);
    },

    getCompanyCase: async (companyId: string, caseId: string) => {
      const row = await getCompanyCaseOrThrow(companyId, caseId);
      return normalizeCaseRow(row);
    },

    createCase: async (companyId: string, input: CreateWorkflowCase, actor: ActorInfo) => {
      assertKnownCategory(input.category);
      await assertAgentBelongsToCompany(companyId, input.requestedByAgentId ?? actor.agentId);
      const routeRule = await getRouteRule(companyId, input.category);
      const now = new Date();
      const [created] = await db
        .insert(workflowCases)
        .values({
          companyId,
          kind: input.kind,
          category: input.category,
          status: "draft",
          title: input.title,
          summary: input.summary ?? null,
          details: input.details ?? {},
          requestedByAgentId: input.requestedByAgentId ?? actor.agentId,
          requestedByUserId: input.requestedByUserId ?? (actor.actorType === "user" ? actor.actorId : null),
          requestedFromIssueId: input.requestedFromIssueId ?? null,
          linkedIssueId: null,
          linkedApprovalId: null,
          primaryReviewerRole: input.primaryReviewerRole ?? routeRule.primaryReviewerRole,
          secondaryReviewerRole:
            input.secondaryReviewerRole === undefined ? routeRule.secondaryReviewerRole : input.secondaryReviewerRole,
          finalApproverRole: input.finalApproverRole ?? routeRule.finalApproverRole,
          boardApprovalRequired: input.boardApprovalRequired ?? routeRule.boardApprovalRequired,
          executionTarget: input.executionTarget ?? routeRule.executionTarget,
          priority: input.priority ?? "medium",
          dueAt: input.dueAt ? new Date(input.dueAt) : null,
          startedAt: null,
          completedAt: null,
          cancelledAt: null,
          routeRuleSnapshot: routeRule,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      const intake = await upsertIntakeMirror(created, now);
      await syncBriefMirror(created, actor, intake, now);

      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "workflow_case.created",
        entityType: "workflow_case",
        entityId: created.id,
        details: {
          category: created.category,
          kind: created.kind,
          executionTarget: created.executionTarget,
        },
      });

      return normalizeCaseRow(created);
    },

    updateCase: async (caseId: string, input: UpdateWorkflowCase, actor: ActorInfo) => {
      const current = await getCaseOrThrow(caseId);
      if (input.category) assertKnownCategory(input.category);
      const now = new Date();
      const nextStatus = input.status ?? current.status;
      const nextCategory: WorkflowCategory = input.category
        ? (input.category as WorkflowCategory)
        : (current.category as WorkflowCategory);
      const nextRouteRule = input.category ? await getRouteRule(current.companyId, nextCategory) : current.routeRuleSnapshot;
      const patch: Partial<typeof workflowCases.$inferInsert> = {
        title: input.title ?? current.title,
        summary: input.summary ?? current.summary,
        details: input.details ?? current.details,
        category: nextCategory,
        kind: input.kind ?? current.kind,
        requestedByAgentId: input.requestedByAgentId ?? current.requestedByAgentId,
        requestedByUserId: input.requestedByUserId ?? current.requestedByUserId,
        requestedFromIssueId: input.requestedFromIssueId ?? current.requestedFromIssueId,
        primaryReviewerRole: input.primaryReviewerRole ?? current.primaryReviewerRole,
        secondaryReviewerRole: input.secondaryReviewerRole ?? current.secondaryReviewerRole,
        finalApproverRole: input.finalApproverRole ?? current.finalApproverRole,
        boardApprovalRequired: input.boardApprovalRequired ?? current.boardApprovalRequired,
        executionTarget: input.executionTarget ?? current.executionTarget,
        priority: input.priority ?? current.priority,
        dueAt: input.dueAt ? new Date(input.dueAt) : current.dueAt,
        routeRuleSnapshot: nextRouteRule as Record<string, unknown>,
        status: nextStatus,
        updatedAt: now,
      };
      if (nextStatus === "draft" && !current.startedAt) {
        patch.startedAt = null;
      }
      if (nextStatus === "in_review" && !current.startedAt) {
        patch.startedAt = now;
      }
      if (nextStatus === "approved" && !current.startedAt) {
        patch.startedAt = now;
      }
      if (nextStatus === "approved" && !current.completedAt) {
        patch.completedAt = now;
      }
      if (nextStatus === "done" && !current.completedAt) {
        patch.completedAt = now;
      }
      if (nextStatus === "cancelled" && !current.cancelledAt) {
        patch.cancelledAt = now;
      }
      await db
        .update(workflowCases)
        .set(patch)
        .where(eq(workflowCases.id, caseId));

      const updatedCaseRow = { ...current, ...patch } as typeof workflowCases.$inferSelect;
      const intake = await upsertIntakeMirror(updatedCaseRow, now);
      const contentChanged =
        input.title !== undefined ||
        input.summary !== undefined ||
        input.details !== undefined ||
        input.kind !== undefined ||
        input.category !== undefined ||
        input.executionTarget !== undefined ||
        input.priority !== undefined ||
        input.requestedByAgentId !== undefined ||
        input.requestedByUserId !== undefined ||
        input.requestedFromIssueId !== undefined ||
        input.dueAt !== undefined;
      if (contentChanged) {
        await syncBriefMirror(updatedCaseRow, actor, intake, now);
      }

      await logActivity(db, {
        companyId: current.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "workflow_case.updated",
        entityType: "workflow_case",
        entityId: current.id,
        details: {
          status: nextStatus,
        },
      });

      return normalizeCaseRow({ ...current, ...patch });
    },

    listRouteRules: async (companyId: string) => {
      const rows = await db
        .select()
        .from(workflowRouteRules)
        .where(eq(workflowRouteRules.companyId, companyId))
        .orderBy(desc(workflowRouteRules.updatedAt));
      return rows.map(normalizeRouteRule);
    },

    getRouteRuleById: async (ruleId: string) => {
      const row = await db
        .select()
        .from(workflowRouteRules)
        .where(eq(workflowRouteRules.id, ruleId))
        .then((rows) => rows[0] ?? null);
      if (!row) throw notFound("Workflow route rule not found");
      return normalizeRouteRule(row);
    },

    upsertRouteRule: async (companyId: string, input: CreateWorkflowRouteRule, actor: ActorInfo) => {
      assertKnownCategory(input.category as WorkflowCategory);
      const now = new Date();
      const defaults = getDefaultRouteRule(input.category as WorkflowCategory);
      const [row] = await db
        .insert(workflowRouteRules)
        .values({
          companyId,
          category: input.category,
          primaryReviewerRole: input.primaryReviewerRole ?? defaults.primaryReviewerRole,
          secondaryReviewerRole:
            input.secondaryReviewerRole === undefined
              ? defaults.secondaryReviewerRole
              : input.secondaryReviewerRole,
          finalApproverRole: input.finalApproverRole ?? defaults.finalApproverRole,
          boardApprovalRequired:
            input.boardApprovalRequired ?? defaults.boardApprovalRequired,
          executionTarget: input.executionTarget ?? defaults.executionTarget,
          isEnabled: input.isEnabled ?? true,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [workflowRouteRules.companyId, workflowRouteRules.category],
          set: {
            primaryReviewerRole: input.primaryReviewerRole,
            secondaryReviewerRole: input.secondaryReviewerRole ?? null,
            finalApproverRole: input.finalApproverRole,
            boardApprovalRequired: input.boardApprovalRequired,
            executionTarget: input.executionTarget,
            isEnabled: input.isEnabled,
            updatedAt: now,
          },
        })
        .returning();

      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "workflow_route_rule.updated",
        entityType: "workflow_route_rule",
        entityId: row.id,
        details: { category: row.category },
      });

      return normalizeRouteRule(row);
    },

    updateRouteRule: async (
      ruleId: string,
      input: UpdateWorkflowRouteRule,
      actor: ActorInfo,
    ) => {
      const current = await db
        .select()
        .from(workflowRouteRules)
        .where(eq(workflowRouteRules.id, ruleId))
        .then((rows) => rows[0] ?? null);
      if (!current) throw notFound("Workflow route rule not found");
      const defaults = getDefaultRouteRule(current.category as WorkflowCategory);
      const category = (input.category ?? current.category) as WorkflowCategory;
      assertKnownCategory(category);
      const now = new Date();
      const [row] = await db
        .update(workflowRouteRules)
        .set({
          category,
          primaryReviewerRole: input.primaryReviewerRole ?? current.primaryReviewerRole ?? defaults.primaryReviewerRole,
          secondaryReviewerRole:
            input.secondaryReviewerRole === undefined
              ? current.secondaryReviewerRole ?? defaults.secondaryReviewerRole
              : input.secondaryReviewerRole,
          finalApproverRole: input.finalApproverRole ?? current.finalApproverRole ?? defaults.finalApproverRole,
          boardApprovalRequired:
            input.boardApprovalRequired ?? current.boardApprovalRequired ?? defaults.boardApprovalRequired,
          executionTarget: input.executionTarget ?? current.executionTarget ?? defaults.executionTarget,
          isEnabled: input.isEnabled ?? current.isEnabled,
          updatedAt: now,
        })
        .where(eq(workflowRouteRules.id, ruleId))
        .returning();

      await logActivity(db, {
        companyId: current.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: row.isEnabled ? "workflow_route_rule.updated" : "workflow_route_rule.disabled",
        entityType: "workflow_route_rule",
        entityId: row.id,
        details: { category: row.category },
      });

      return normalizeRouteRule(row);
    },

    listArtifacts: async (caseId: string) => {
      const rows = await db
        .select()
        .from(workflowCaseArtifacts)
        .where(eq(workflowCaseArtifacts.workflowCaseId, caseId))
        .orderBy(desc(workflowCaseArtifacts.version), desc(workflowCaseArtifacts.createdAt));
      return rows.map(normalizeArtifactRow);
    },

    createArtifact: async (caseId: string, input: CreateWorkflowArtifact, actor: ActorInfo) => {
      const caseRow = await getCaseOrThrow(caseId);
      const nextVersion = await db
        .select({ maxVersion: sql<number>`coalesce(max(${workflowCaseArtifacts.version}), 0)` })
        .from(workflowCaseArtifacts)
        .where(eq(workflowCaseArtifacts.workflowCaseId, caseId))
        .then((rows) => Number(rows[0]?.maxVersion ?? 0) + 1);
      const now = new Date();
      const [created] = await db
        .insert(workflowCaseArtifacts)
        .values({
          companyId: caseRow.companyId,
          workflowCaseId: caseId,
          kind: input.kind,
          version: nextVersion,
          title: input.title,
          body: input.body,
          authorAgentId: actor.agentId,
          authorUserId: actor.actorType === "user" ? actor.actorId : null,
          supersedesArtifactId: input.supersedesArtifactId ?? null,
          metadata: input.metadata ?? {},
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      await db
        .update(workflowCases)
        .set({
          status: "in_review",
          startedAt: caseRow.startedAt ?? now,
          updatedAt: now,
        })
        .where(eq(workflowCases.id, caseId));

      await logActivity(db, {
        companyId: caseRow.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "workflow_case.artifact_created",
        entityType: "workflow_case",
        entityId: caseId,
        details: { artifactId: created.id, kind: created.kind, version: created.version },
      });

      return normalizeArtifactRow(created);
    },

    listReviews: async (caseId: string) => {
      const rows = await db
        .select()
        .from(workflowCaseReviews)
        .where(eq(workflowCaseReviews.workflowCaseId, caseId))
        .orderBy(desc(workflowCaseReviews.createdAt));
      return rows.map(normalizeReviewRow);
    },

    submitReview: async (caseId: string, input: SubmitWorkflowReview, actor: ActorInfo) => {
      const caseRow = await getCaseOrThrow(caseId);
      if (input.reviewerAgentId) {
        await assertAgentBelongsToCompany(caseRow.companyId, input.reviewerAgentId);
      }
      const now = new Date();
      const [created] = await db
        .insert(workflowCaseReviews)
        .values({
          companyId: caseRow.companyId,
          workflowCaseId: caseId,
          artifactId: input.artifactId ?? null,
          reviewerRole: input.reviewerRole,
          reviewerAgentId: input.reviewerAgentId ?? actor.agentId,
          reviewerUserId: input.reviewerUserId ?? (actor.actorType === "user" ? actor.actorId : null),
          status: input.status,
          decisionNote: input.decisionNote ?? null,
          reviewSummary: input.reviewSummary ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      await syncReviewMirror(caseRow, created, undefined, now);

      const nextStatus =
        input.status === "approved"
          ? "approved"
          : input.status === "revision_requested"
            ? "revision_requested"
            : "rejected";
      await db
        .update(workflowCases)
        .set({
          status: nextStatus,
          startedAt: caseRow.startedAt ?? now,
          completedAt: nextStatus === "approved" || nextStatus === "rejected" ? now : caseRow.completedAt,
          updatedAt: now,
        })
        .where(eq(workflowCases.id, caseId));

      const intake = await getIntakeByLegacyCaseId(caseId);
      if (intake) {
        await db
          .update(workflowIntakes)
          .set({
            status: nextStatus,
            startedAt: intake.startedAt ?? now,
            completedAt: nextStatus === "approved" || nextStatus === "rejected" ? now : intake.completedAt,
            updatedAt: now,
          })
          .where(eq(workflowIntakes.id, intake.id));
      }

      await logActivity(db, {
        companyId: caseRow.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: input.status === "revision_requested" ? "workflow_case.revision_requested" : "workflow_case.review_submitted",
        entityType: "workflow_case",
        entityId: caseId,
        details: {
          reviewId: created.id,
          status: created.status,
          reviewerRole: created.reviewerRole,
          artifactId: created.artifactId,
        },
      });

      return normalizeReviewRow(created);
    },

    approve: async (caseId: string, input: ResolveWorkflowCase, actor: ActorInfo) => {
      const caseRow = await getCaseOrThrow(caseId);
      const now = new Date();
      const intake = await getIntakeByLegacyCaseId(caseId);
      const decision = await syncDecisionMirror(caseRow, actor, "approved", input.decisionNote ?? null, intake, now);
      await db
        .update(workflowCases)
        .set({
          status: "approved",
          startedAt: caseRow.startedAt ?? now,
          completedAt: caseRow.completedAt ?? now,
          updatedAt: now,
        })
        .where(eq(workflowCases.id, caseId));

      await logActivity(db, {
        companyId: caseRow.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "workflow_case.approved",
        entityType: "workflow_case",
        entityId: caseId,
        details: { approverRole: input.approverRole },
      });

      const updated = await getCaseOrThrow(caseId);
      await executeApprovedCase(updated, actor, intake, decision);
      return normalizeCaseRow(await getCaseOrThrow(caseId));
    },

    reject: async (caseId: string, input: ResolveWorkflowCase, actor: ActorInfo) => {
      const caseRow = await getCaseOrThrow(caseId);
      const now = new Date();
      const intake = await getIntakeByLegacyCaseId(caseId);
      await syncDecisionMirror(caseRow, actor, "rejected", input.decisionNote ?? null, intake, now);
      await db
        .update(workflowCases)
        .set({
          status: "rejected",
          completedAt: now,
          updatedAt: now,
        })
        .where(eq(workflowCases.id, caseId));

      if (intake) {
        await db
          .update(workflowIntakes)
          .set({
            status: "rejected",
            completedAt: now,
            updatedAt: now,
          })
          .where(eq(workflowIntakes.id, intake.id));
      }

      await logActivity(db, {
        companyId: caseRow.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "workflow_case.rejected",
        entityType: "workflow_case",
        entityId: caseId,
        details: { approverRole: input.approverRole, decisionNote: input.decisionNote ?? null },
      });

      return normalizeCaseRow({ ...caseRow, status: "rejected", completedAt: now, updatedAt: now });
    },
  };
}
