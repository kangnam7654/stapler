import { beforeEach, describe, expect, it, vi } from "vitest";
import { workflowService } from "../services/workflows.js";

const mockAgentService = vi.hoisted(() => ({
  getById: vi.fn(),
}));

const mockIssueService = vi.hoisted(() => ({
  create: vi.fn(),
}));

const mockApprovalService = vi.hoisted(() => ({
  create: vi.fn(),
}));

const mockLogActivity = vi.hoisted(() => vi.fn());

vi.mock("../services/agents.js", () => ({
  agentService: vi.fn(() => mockAgentService),
}));

vi.mock("../services/issues.js", () => ({
  issueService: vi.fn(() => mockIssueService),
}));

vi.mock("../services/approvals.js", () => ({
  approvalService: vi.fn(() => mockApprovalService),
}));

vi.mock("../services/activity-log.js", () => ({
  logActivity: mockLogActivity,
}));

type SelectResult = Record<string, unknown>[];
type UpdateResult = Record<string, unknown>[];
type InsertResult = Record<string, unknown>[];

function createDbStub(
  selectResults: SelectResult[],
  updateResults: UpdateResult[],
  insertResults: InsertResult[],
  stickySelect = false,
) {
  const pendingSelectResults = [...selectResults];
  const pendingUpdateResults = [...updateResults];
  const pendingInsertResults = [...insertResults];
  let lastSelectResult: SelectResult = [];

  const selectWhere = vi.fn(async () => {
    const next = pendingSelectResults.shift();
    if (next !== undefined) {
      lastSelectResult = next;
      return next;
    }
    if (stickySelect) return lastSelectResult;
    return [];
  });
  const from = vi.fn(() => ({ where: selectWhere }));
  const select = vi.fn(() => ({ from }));

  const updateReturning = vi.fn(async () => pendingUpdateResults.shift() ?? []);
  const updateWhere = vi.fn(() => ({ returning: updateReturning }));
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));

  const insertReturning = vi.fn(async () => pendingInsertResults.shift() ?? []);
  const insertValues = vi.fn(() => ({ returning: insertReturning }));
  const insert = vi.fn(() => ({ values: insertValues }));

  return {
    db: { select, update, insert },
    selectWhere,
    updateReturning,
    insertReturning,
  };
}

describe("workflowService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAgentService.getById.mockResolvedValue(null);
    mockIssueService.create.mockResolvedValue({ id: "issue-1" });
    mockApprovalService.create.mockResolvedValue({ id: "approval-1" });
    mockLogActivity.mockResolvedValue(undefined);
  });

  it("uses the default route rule for a new workflow case", async () => {
    const dbStub = createDbStub(
      [[], [], []],
      [],
      [[{
        id: "case-1",
        companyId: "company-1",
        kind: "engineering_change",
        category: "engineering",
        status: "draft",
        title: "Improve workflow routing",
        summary: null,
        details: {
          component: "WorkflowInbox",
          rollbackPlan: "Revert the form switch",
        },
        requestedByAgentId: null,
        requestedByUserId: "user-1",
        requestedFromIssueId: null,
        linkedIssueId: null,
        linkedApprovalId: null,
        primaryReviewerRole: "cto",
        secondaryReviewerRole: "ceo",
        finalApproverRole: "cto",
        boardApprovalRequired: false,
        executionTarget: "issue",
        priority: "medium",
        dueAt: null,
        startedAt: null,
        completedAt: null,
        cancelledAt: null,
        routeRuleSnapshot: {},
        createdAt: new Date("2026-04-15T00:00:00.000Z"),
        updatedAt: new Date("2026-04-15T00:00:00.000Z"),
      }], [{
        id: "intake-1",
        companyId: "company-1",
        kind: "engineering_change",
        category: "engineering",
        status: "draft",
        title: "Improve workflow routing",
        summary: null,
        details: {
          component: "WorkflowInbox",
          rollbackPlan: "Revert the form switch",
        },
        delegationTargetAgentId: null,
        delegationMode: null,
        requestedByAgentId: null,
        requestedByUserId: "user-1",
        requestedFromIssueId: null,
        priority: "medium",
        routeRuleSnapshot: {},
        dueAt: null,
        startedAt: null,
        completedAt: null,
        cancelledAt: null,
        legacyWorkflowCaseId: "case-1",
        createdAt: new Date("2026-04-15T00:00:00.000Z"),
        updatedAt: new Date("2026-04-15T00:00:00.000Z"),
      }], [{
        id: "brief-1",
        companyId: "company-1",
        intakeId: "intake-1",
        version: 1,
        title: "Improve workflow routing",
        body: "Details:\n- component: WorkflowInbox\n- rollbackPlan: Revert the form switch",
        executionTarget: "issue",
        authorAgentId: null,
        authorUserId: "user-1",
        supersedesBriefId: null,
        metadata: {},
        legacyArtifactId: null,
        createdAt: new Date("2026-04-15T00:00:00.000Z"),
        updatedAt: new Date("2026-04-15T00:00:00.000Z"),
      }]],
    );

    const svc = workflowService(dbStub.db as any);
    const created = await svc.createCase(
      "company-1",
      {
        kind: "engineering_change",
        category: "engineering",
        title: "Improve workflow routing",
        summary: null,
        details: {
          component: "WorkflowInbox",
          rollbackPlan: "Revert the form switch",
        },
      } as any,
      { actorType: "user", actorId: "user-1", agentId: null, runId: null },
    );

    expect(created.primaryReviewerRole).toBe("cto");
    expect(created.finalApproverRole).toBe("cto");
    expect(created.executionTarget).toBe("issue");
    expect(created.details).toMatchObject({
      component: "WorkflowInbox",
    });
  });

  it("hands approved issue-target workflow cases off to issues", async () => {
    const caseRow = {
      id: "case-1",
      companyId: "company-1",
      kind: "hiring_request",
      category: "hiring",
      status: "draft",
      title: "Hire Backend Engineer",
      summary: "Need one more backend engineer",
      details: {
        role: "Backend Engineer",
        headcount: "1",
      },
      requestedByAgentId: "agent-1",
      requestedByUserId: null,
      requestedFromIssueId: "issue-parent",
      linkedIssueId: null,
      linkedApprovalId: null,
      primaryReviewerRole: "chro",
      secondaryReviewerRole: "cto",
      finalApproverRole: "ceo",
      boardApprovalRequired: false,
      executionTarget: "issue",
      priority: "high",
      dueAt: null,
      startedAt: null,
      completedAt: null,
      cancelledAt: null,
      routeRuleSnapshot: {},
      createdAt: new Date("2026-04-15T00:00:00.000Z"),
      updatedAt: new Date("2026-04-15T00:00:00.000Z"),
    };
    const approvedCase = { ...caseRow, status: "approved", completedAt: new Date("2026-04-15T00:10:00.000Z"), updatedAt: new Date("2026-04-15T00:10:00.000Z") };

    const dbStub = createDbStub(
      [
        [caseRow],
        [{
          id: "intake-1",
          companyId: "company-1",
          kind: "hiring_request",
          category: "hiring",
          status: "draft",
          title: "Hire Backend Engineer",
          summary: "Need one more backend engineer",
          details: {
            role: "Backend Engineer",
            headcount: "1",
          },
          delegationTargetAgentId: null,
          delegationMode: null,
          requestedByAgentId: "agent-1",
          requestedByUserId: null,
          requestedFromIssueId: "issue-parent",
          priority: "high",
          routeRuleSnapshot: {},
          dueAt: null,
          startedAt: null,
          completedAt: null,
          cancelledAt: null,
          legacyWorkflowCaseId: "case-1",
          createdAt: new Date("2026-04-15T00:00:00.000Z"),
          updatedAt: new Date("2026-04-15T00:00:00.000Z"),
        }],
        [approvedCase],
        [{ ...approvedCase, linkedIssueId: "issue-1", status: "done" }],
      ],
      [],
      [[{
        id: "decision-1",
        companyId: "company-1",
        intakeId: "intake-1",
        decision: "approved",
        decidedByAgentId: null,
        decidedByUserId: "user-1",
        decisionNote: "ship it",
        routeRuleSnapshot: {},
        decidedAt: new Date("2026-04-15T00:05:00.000Z"),
        legacyWorkflowCaseId: "case-1",
        createdAt: new Date("2026-04-15T00:05:00.000Z"),
        updatedAt: new Date("2026-04-15T00:05:00.000Z"),
      }], [{
        id: "handoff-1",
        companyId: "company-1",
        intakeId: "intake-1",
        decisionId: "decision-1",
        executionTarget: "issue",
        linkedIssueId: "issue-1",
        linkedApprovalId: null,
        status: "done",
        startedAt: new Date("2026-04-15T00:05:00.000Z"),
        completedAt: new Date("2026-04-15T00:05:00.000Z"),
        legacyWorkflowCaseId: "case-1",
        createdAt: new Date("2026-04-15T00:05:00.000Z"),
        updatedAt: new Date("2026-04-15T00:05:00.000Z"),
      }]],
    );

    const svc = workflowService(dbStub.db as any);
    const result = await svc.approve("case-1", { approverRole: "ceo", decisionNote: "ship it" }, { actorType: "user", actorId: "user-1", agentId: null, runId: null });

    expect(mockIssueService.create).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({
        title: "Hire Backend Engineer",
        description: expect.stringContaining("role: Backend Engineer"),
        status: "todo",
        priority: "high",
        assigneeAgentId: "agent-1",
        parentId: "issue-parent",
      }),
    );
    expect(result.linkedIssueId).toBe("issue-1");
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "workflow_case.executed",
        entityType: "workflow_case",
      }),
    );
  });

  it("hands approval-target workflow cases off to approvals", async () => {
    const caseRow = {
      id: "case-2",
      companyId: "company-1",
      kind: "budget_request",
      category: "budget",
      status: "draft",
      title: "Increase budget",
      summary: "Need a monthly budget bump",
      requestedByAgentId: "agent-1",
      requestedByUserId: null,
      requestedFromIssueId: null,
      linkedIssueId: null,
      linkedApprovalId: null,
      primaryReviewerRole: "cfo",
      secondaryReviewerRole: "ceo",
      finalApproverRole: "ceo",
      boardApprovalRequired: true,
      executionTarget: "approval",
      priority: "medium",
      dueAt: null,
      startedAt: null,
      completedAt: null,
      cancelledAt: null,
      routeRuleSnapshot: {},
      createdAt: new Date("2026-04-15T00:00:00.000Z"),
      updatedAt: new Date("2026-04-15T00:00:00.000Z"),
    };
    const approvedCase = { ...caseRow, status: "approved", completedAt: new Date("2026-04-15T00:10:00.000Z"), updatedAt: new Date("2026-04-15T00:10:00.000Z") };

    const dbStub = createDbStub(
      [
        [caseRow],
        [{
          id: "intake-2",
          companyId: "company-1",
          kind: "budget_request",
          category: "budget",
          status: "draft",
          title: "Increase budget",
          summary: "Need a monthly budget bump",
          details: {},
          delegationTargetAgentId: null,
          delegationMode: null,
          requestedByAgentId: "agent-1",
          requestedByUserId: null,
          requestedFromIssueId: null,
          priority: "medium",
          routeRuleSnapshot: {},
          dueAt: null,
          startedAt: null,
          completedAt: null,
          cancelledAt: null,
          legacyWorkflowCaseId: "case-2",
          createdAt: new Date("2026-04-15T00:00:00.000Z"),
          updatedAt: new Date("2026-04-15T00:00:00.000Z"),
        }],
        [approvedCase],
        [{ ...approvedCase, linkedApprovalId: "approval-1", status: "done" }],
      ],
      [],
      [[{
        id: "decision-2",
        companyId: "company-1",
        intakeId: "intake-2",
        decision: "approved",
        decidedByAgentId: null,
        decidedByUserId: "user-1",
        decisionNote: "approved",
        routeRuleSnapshot: {},
        decidedAt: new Date("2026-04-15T00:05:00.000Z"),
        legacyWorkflowCaseId: "case-2",
        createdAt: new Date("2026-04-15T00:05:00.000Z"),
        updatedAt: new Date("2026-04-15T00:05:00.000Z"),
      }], [{
        id: "handoff-2",
        companyId: "company-1",
        intakeId: "intake-2",
        decisionId: "decision-2",
        executionTarget: "approval",
        linkedIssueId: null,
        linkedApprovalId: "approval-1",
        status: "done",
        startedAt: new Date("2026-04-15T00:05:00.000Z"),
        completedAt: new Date("2026-04-15T00:05:00.000Z"),
        legacyWorkflowCaseId: "case-2",
        createdAt: new Date("2026-04-15T00:05:00.000Z"),
        updatedAt: new Date("2026-04-15T00:05:00.000Z"),
      }]],
    );

    const svc = workflowService(dbStub.db as any);
    const result = await svc.approve("case-2", { approverRole: "ceo", decisionNote: "approved" }, { actorType: "user", actorId: "user-1", agentId: null, runId: null });

    expect(mockApprovalService.create).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({
        type: "budget_override_required",
        payload: expect.objectContaining({
          workflowCaseId: "case-2",
          category: "budget",
        }),
      }),
    );
    expect(result.linkedApprovalId).toBe("approval-1");
  });

  it("runs an issue-target workflow from intake through approval and issue handoff", async () => {
    const actor = { actorType: "user", actorId: "user-1", agentId: null, runId: null } as const;
    const companyId = "company-1";
    const requestedByAgentId = "agent-1";
    const issueParentId = "issue-parent";
    const caseId = "case-1";
    const intakeId = "intake-1";
    const briefId = "brief-1";
    const artifactId = "artifact-1";
    const reviewId = "review-1";
    const reviewMirrorId = "workflow-review-1";
    const decisionId = "decision-1";
    const handoffId = "handoff-1";
    const issueId = "issue-1";

    const routeTime = new Date("2026-04-15T00:00:00.000Z");
    const artifactTime = new Date("2026-04-15T00:02:00.000Z");
    const reviewTime = new Date("2026-04-15T00:05:00.000Z");
    const approveTime = new Date("2026-04-15T00:10:00.000Z");

    const baseCase = {
      id: caseId,
      companyId,
      kind: "engineering_change",
      category: "engineering",
      status: "draft",
      title: "Improve workflow routing",
      summary: "Make workflow progression easier to verify",
      details: {
        component: "WorkflowInbox",
        rollbackPlan: "Revert the form switch",
      },
      requestedByAgentId,
      requestedByUserId: null,
      requestedFromIssueId: issueParentId,
      linkedIssueId: null,
      linkedApprovalId: null,
      primaryReviewerRole: "cto",
      secondaryReviewerRole: "ceo",
      finalApproverRole: "cto",
      boardApprovalRequired: false,
      executionTarget: "issue",
      priority: "high",
      dueAt: null,
      startedAt: null,
      completedAt: null,
      cancelledAt: null,
      routeRuleSnapshot: {},
      createdAt: routeTime,
      updatedAt: routeTime,
    };

    const intakeDraft = {
      id: intakeId,
      companyId,
      kind: "engineering_change",
      category: "engineering",
      status: "draft",
      title: "Improve workflow routing",
      summary: "Make workflow progression easier to verify",
      details: {
        component: "WorkflowInbox",
        rollbackPlan: "Revert the form switch",
      },
      delegationTargetAgentId: null,
      delegationMode: null,
      requestedByAgentId,
      requestedByUserId: null,
      requestedFromIssueId: issueParentId,
      priority: "high",
      routeRuleSnapshot: {},
      dueAt: null,
      startedAt: null,
      completedAt: null,
      cancelledAt: null,
      legacyWorkflowCaseId: caseId,
      createdAt: routeTime,
      updatedAt: routeTime,
    };

    const briefDraft = {
      id: briefId,
      companyId,
      intakeId,
      version: 1,
      title: "Improve workflow routing",
      body: "Make workflow progression easier to verify\n\nDetails:\n- component: WorkflowInbox\n- rollbackPlan: Revert the form switch",
      executionTarget: "issue",
      authorAgentId: requestedByAgentId,
      authorUserId: actor.actorId,
      supersedesBriefId: null,
      metadata: {
        kind: "engineering_change",
        category: "engineering",
        priority: "high",
        routeRuleSnapshot: {},
      },
      legacyArtifactId: null,
      createdAt: routeTime,
      updatedAt: routeTime,
    };

    const artifactCreated = {
      id: artifactId,
      companyId,
      workflowCaseId: caseId,
      kind: "brief",
      version: 2,
      title: "Improve workflow routing",
      body: "Keep the workflow path visible in the UI.",
      authorAgentId: requestedByAgentId,
      authorUserId: actor.actorId,
      supersedesArtifactId: null,
      metadata: { focus: "workflow smoke test" },
      createdAt: artifactTime,
      updatedAt: artifactTime,
    };

    const caseAfterArtifact = {
      ...baseCase,
      status: "in_review",
      startedAt: artifactTime,
      updatedAt: artifactTime,
    };

    const reviewCreated = {
      id: reviewId,
      companyId,
      workflowCaseId: caseId,
      artifactId,
      reviewerRole: "cto",
      reviewerAgentId: requestedByAgentId,
      reviewerUserId: actor.actorId,
      status: "approved",
      decisionNote: "Looks good",
      reviewSummary: "The path is clear and the handoff is easy to follow.",
      createdAt: reviewTime,
      updatedAt: reviewTime,
    };

    const reviewMirror = {
      id: reviewMirrorId,
      companyId,
      intakeId,
      briefId,
      reviewerRole: "cto",
      reviewerAgentId: requestedByAgentId,
      reviewerUserId: actor.actorId,
      status: "approved",
      decisionNote: "Looks good",
      reviewSummary: "The path is clear and the handoff is easy to follow.",
      legacyReviewId: reviewId,
      createdAt: reviewTime,
      updatedAt: reviewTime,
    };

    const caseAfterReview = {
      ...baseCase,
      status: "approved",
      startedAt: artifactTime,
      completedAt: reviewTime,
      updatedAt: reviewTime,
    };

    const intakeAfterReview = {
      ...intakeDraft,
      status: "approved",
      startedAt: artifactTime,
      completedAt: reviewTime,
      updatedAt: reviewTime,
    };

    const decisionCreated = {
      id: decisionId,
      companyId,
      intakeId,
      decision: "approved",
      decidedByAgentId: null,
      decidedByUserId: actor.actorId,
      decisionNote: "Proceed",
      routeRuleSnapshot: {},
      decidedAt: approveTime,
      legacyWorkflowCaseId: caseId,
      createdAt: approveTime,
      updatedAt: approveTime,
    };

    const handoffCreated = {
      id: handoffId,
      companyId,
      intakeId,
      decisionId,
      executionTarget: "issue",
      linkedIssueId: issueId,
      linkedApprovalId: null,
      status: "done",
      startedAt: approveTime,
      completedAt: approveTime,
      legacyWorkflowCaseId: caseId,
      createdAt: approveTime,
      updatedAt: approveTime,
    };

    const caseAfterExecution = {
      ...baseCase,
      status: "done",
      linkedIssueId: issueId,
      startedAt: artifactTime,
      completedAt: reviewTime,
      updatedAt: approveTime,
    };

    mockAgentService.getById.mockResolvedValue({ id: requestedByAgentId, companyId });

    const createSvc = workflowService(
      createDbStub(
        [
          [], // route rule lookup during createCase
          [], // legacy intake lookup during createCase
          [], // latest brief lookup during createCase
        ],
        [],
        [[baseCase], [intakeDraft], [briefDraft]],
      ).db as any,
    );
    const created = await createSvc.createCase(
      companyId,
      {
        kind: "engineering_change",
        category: "engineering",
        title: "Improve workflow routing",
        summary: "Make workflow progression easier to verify",
        details: {
          component: "WorkflowInbox",
          rollbackPlan: "Revert the form switch",
        },
        requestedByAgentId,
        requestedFromIssueId: issueParentId,
        executionTarget: "issue",
        priority: "high",
      } as any,
      actor,
    );
    expect(created.status).toBe("draft");
    expect(created.requestedByAgentId).toBe(requestedByAgentId);

    const artifactSvc = workflowService(
      createDbStub(
        [
          [created], // getCaseOrThrow during createArtifact
          [{ maxVersion: 1 }], // max artifact version lookup
        ],
        [],
        [[artifactCreated]],
      ).db as any,
    );
    const artifact = await artifactSvc.createArtifact(caseId, {
      kind: "brief",
      title: "Improve workflow routing",
      body: "Keep the workflow path visible in the UI.",
      metadata: { focus: "workflow smoke test" },
    } as any, actor);
    expect(artifact.version).toBe(2);

    const reviewSvc = workflowService(
      createDbStub(
        [
          [caseAfterArtifact], // getCaseOrThrow during submitReview
          [intakeDraft], // intake mirror lookup during submitReview
          [briefDraft], // latest brief lookup during submitReview
        ],
        [],
        [[reviewCreated], [reviewMirror]],
      ).db as any,
    );
    const review = await reviewSvc.submitReview(
      caseId,
      {
        reviewerRole: "cto",
        reviewerAgentId: requestedByAgentId,
        artifactId,
        status: "approved",
        decisionNote: "Looks good",
        reviewSummary: "The path is clear and the handoff is easy to follow.",
      } as any,
      actor,
    );
    expect(review.status).toBe("approved");

    const approveSvc = workflowService(
      createDbStub(
        [
          [caseAfterReview], // getCaseOrThrow before approve
          [intakeAfterReview], // intake mirror lookup before approve
          [caseAfterReview], // getCaseOrThrow after status update, before issue handoff
          [caseAfterExecution], // final getCaseOrThrow after issue handoff
        ],
        [],
        [[decisionCreated], [handoffCreated]],
      ).db as any,
    );
    const result = await approveSvc.approve(
      caseId,
      { approverRole: "cto", decisionNote: "Proceed" },
      actor,
    );

    expect(mockIssueService.create).toHaveBeenCalledWith(
      companyId,
      expect.objectContaining({
        title: "Improve workflow routing",
        description: expect.stringContaining("rollbackPlan: Revert the form switch"),
        status: "todo",
        priority: "high",
        assigneeAgentId: requestedByAgentId,
        parentId: issueParentId,
      }),
    );
    expect(result.status).toBe("done");
    expect(result.linkedIssueId).toBe(issueId);
    expect(mockLogActivity.mock.calls.map(([, entry]) => (entry as any).action)).toEqual([
      "workflow_case.created",
      "workflow_case.artifact_created",
      "workflow_case.review_submitted",
      "workflow_case.approved",
      "workflow_case.executed",
    ]);
  });
});
