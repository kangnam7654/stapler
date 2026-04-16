import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { agentDelegationRoutes } from "../routes/agent-delegations.js";
import { errorHandler } from "../middleware/index.js";

const companyId = "22222222-2222-4222-8222-222222222222";
const delegatorAgentId = "11111111-1111-4111-8111-111111111111";
const delegateAgentId = "33333333-3333-4333-8333-333333333333";
const delegationId = "44444444-4444-4444-8444-444444444444";
const rootIssueId = "55555555-5555-4555-8555-555555555555";

const mockListDelegations = vi.fn();
const mockGetDelegation = vi.fn();
const mockGetCompanyDelegation = vi.fn();
const mockCreate = vi.fn();
const mockCreateSourceMessage = vi.fn();
const mockCreateReportMessage = vi.fn();
const mockUpdate = vi.fn();
const mockClaim = vi.fn();
const mockReport = vi.fn();
const mockCancel = vi.fn();
const mockWakeup = vi.fn();

vi.mock("../services/index.js", () => ({
  agentDelegationService: () => ({
    listDelegations: mockListDelegations,
    getDelegation: mockGetDelegation,
    getCompanyDelegation: mockGetCompanyDelegation,
    create: mockCreate,
    createSourceMessage: mockCreateSourceMessage,
    createReportMessage: mockCreateReportMessage,
    update: mockUpdate,
    claim: mockClaim,
    report: mockReport,
    cancel: mockCancel,
  }),
  heartbeatService: () => ({
    wakeup: mockWakeup,
  }),
}));

function createApp(actor: Record<string, unknown>) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = actor;
    next();
  });
  app.use("/api", agentDelegationRoutes({} as any));
  app.use(errorHandler);
  return app;
}

const boardActor = {
  type: "board",
  source: "local_implicit",
  userId: "user-1",
  companyIds: [companyId],
  isInstanceAdmin: true,
};

const delegateActor = {
  type: "agent",
  agentId: delegateAgentId,
  companyId,
  runId: "66666666-6666-4666-8666-666666666666",
};

const baseDelegation = {
  id: delegationId,
  companyId,
  parentDelegationId: null,
  rootIssueId,
  linkedIssueId: null,
  sourceMessageId: null,
  delegatorAgentId,
  delegateAgentId,
  status: "queued",
  title: "Break work into engineering tasks",
  brief: "Split this into child work.",
  acceptanceCriteria: null,
  context: {},
  result: null,
  priority: "medium",
  dueAt: null,
  idempotencyKey: null,
  createdRunId: null,
  claimedRunId: null,
  completedRunId: null,
  claimedAt: null,
  startedAt: null,
  reportedAt: null,
  completedAt: null,
  cancelledAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("agent delegation routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists company delegations", async () => {
    mockListDelegations.mockResolvedValue([baseDelegation]);

    const app = createApp(boardActor);
    const res = await request(app)
      .get(`/api/companies/${companyId}/delegations`)
      .query({ statuses: "queued,in_progress" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(mockListDelegations).toHaveBeenCalledWith(companyId, expect.objectContaining({
      statuses: ["queued", "in_progress"],
    }));
  });

  it("creates a delegation, source message, and delegate wakeup", async () => {
    mockCreate.mockResolvedValue(baseDelegation);
    mockCreateSourceMessage.mockResolvedValue({ ...baseDelegation, sourceMessageId: "77777777-7777-4777-8777-777777777777" });

    const app = createApp(boardActor);
    const res = await request(app)
      .post(`/api/companies/${companyId}/delegations`)
      .send({
        delegatorAgentId,
        delegateAgentId,
        title: "Break work into engineering tasks",
        brief: "Split this into child work.",
        rootIssueId,
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(delegationId);
    expect(mockCreate).toHaveBeenCalledWith(companyId, expect.objectContaining({
      delegatorAgentId,
      delegateAgentId,
    }), expect.objectContaining({ actorType: "user" }));
    expect(mockCreateSourceMessage).toHaveBeenCalledWith(delegationId);
    expect(mockWakeup).toHaveBeenCalledWith(delegateAgentId, expect.objectContaining({
      reason: "delegation_assigned",
      contextSnapshot: expect.objectContaining({ delegationId, rootIssueId }),
    }));
  });

  it("reports a delegation and wakes the delegator", async () => {
    mockGetDelegation.mockResolvedValue({ ...baseDelegation, status: "in_progress" });
    mockReport.mockResolvedValue({ ...baseDelegation, status: "reported", result: "Done with split." });
    mockCreateReportMessage.mockResolvedValue({ ...baseDelegation, status: "reported", result: "Done with split." });

    const app = createApp(delegateActor);
    const res = await request(app)
      .post(`/api/delegations/${delegationId}/report`)
      .send({ result: "Done with split." });

    expect(res.status).toBe(200);
    expect(mockReport).toHaveBeenCalledWith(delegationId, expect.objectContaining({
      result: "Done with split.",
    }), expect.objectContaining({ actorType: "agent", agentId: delegateAgentId }));
    expect(mockCreateReportMessage).toHaveBeenCalledWith(delegationId);
    expect(mockWakeup).toHaveBeenCalledWith(delegatorAgentId, expect.objectContaining({
      reason: "delegation_reported",
      contextSnapshot: expect.objectContaining({ delegationId }),
    }));
  });

  it("prevents non-delegate agents from reporting", async () => {
    mockGetDelegation.mockResolvedValue(baseDelegation);

    const app = createApp({ ...delegateActor, agentId: delegatorAgentId });
    const res = await request(app)
      .post(`/api/delegations/${delegationId}/report`)
      .send({ result: "Nope" });

    expect(res.status).toBe(403);
    expect(mockReport).not.toHaveBeenCalled();
  });
});
