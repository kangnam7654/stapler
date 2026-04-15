import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { workflowRoutes } from "../routes/workflows.js";
import { errorHandler } from "../middleware/index.js";

const mockWorkflowService = vi.hoisted(() => ({
  listCases: vi.fn(),
  createCase: vi.fn(),
  getCompanyCase: vi.fn(),
  getCase: vi.fn(),
  updateCase: vi.fn(),
  listArtifacts: vi.fn(),
  createArtifact: vi.fn(),
  listReviews: vi.fn(),
  submitReview: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
  listRouteRules: vi.fn(),
  upsertRouteRule: vi.fn(),
  updateRouteRule: vi.fn(),
}));

vi.mock("../services/index.js", () => ({
  workflowService: vi.fn(() => mockWorkflowService),
}));

function createApp(actor: Record<string, unknown>) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = actor;
    next();
  });
  app.use("/api", workflowRoutes({} as any));
  app.use(errorHandler);
  return app;
}

describe("workflow routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWorkflowService.listCases.mockResolvedValue([]);
    mockWorkflowService.createCase.mockResolvedValue({
      id: "case-1",
      companyId: "company-1",
      kind: "hiring_request",
      category: "hiring",
      status: "draft",
      title: "Hire Backend Engineer",
    });
    mockWorkflowService.getCompanyCase.mockResolvedValue({
      id: "case-1",
      companyId: "company-1",
      kind: "hiring_request",
      category: "hiring",
      status: "draft",
      title: "Hire Backend Engineer",
    });
    mockWorkflowService.getCase.mockResolvedValue({
      id: "case-1",
      companyId: "company-1",
      kind: "hiring_request",
      category: "hiring",
      status: "draft",
      title: "Hire Backend Engineer",
    });
    mockWorkflowService.listArtifacts.mockResolvedValue([]);
    mockWorkflowService.listReviews.mockResolvedValue([]);
    mockWorkflowService.approve.mockResolvedValue({
      id: "case-1",
      companyId: "company-1",
      kind: "hiring_request",
      category: "hiring",
      status: "approved",
      title: "Hire Backend Engineer",
    });
    mockWorkflowService.listRouteRules.mockResolvedValue([]);
    mockWorkflowService.upsertRouteRule.mockResolvedValue({
      id: "rule-1",
      companyId: "company-1",
      category: "engineering",
      primaryReviewerRole: "cto",
      secondaryReviewerRole: "ceo",
      finalApproverRole: "cto",
      boardApprovalRequired: false,
      executionTarget: "issue",
      isEnabled: true,
    });
  });

  it("creates a company-scoped workflow case", async () => {
    const app = createApp({
      type: "board",
      userId: "user-1",
      companyIds: ["company-1"],
      source: "session",
      isInstanceAdmin: false,
    });

    const res = await request(app)
      .post("/api/companies/company-1/workflow-cases")
      .send({
        kind: "hiring_request",
        category: "hiring",
        title: "Hire Backend Engineer",
        summary: "Need a backend engineer for the platform team",
        details: {
          role: "Backend Engineer",
          headcount: "1",
        },
      });

    expect(res.status).toBe(201);
    expect(mockWorkflowService.createCase).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({
        kind: "hiring_request",
        category: "hiring",
        title: "Hire Backend Engineer",
        details: expect.objectContaining({
          role: "Backend Engineer",
        }),
      }),
      expect.objectContaining({
        actorType: "user",
        actorId: "user-1",
        agentId: null,
      }),
    );
  });

  it("forwards workflow case filters including kind", async () => {
    const app = createApp({
      type: "board",
      userId: "user-1",
      companyIds: ["company-1"],
      source: "session",
      isInstanceAdmin: false,
    });

    const res = await request(app).get("/api/companies/company-1/workflow-cases?kind=hiring_request&category=hiring&status=draft");

    expect(res.status).toBe(200);
    expect(mockWorkflowService.listCases).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({
        kind: "hiring_request",
        category: "hiring",
        status: "draft",
      }),
    );
  });

  it("lists company route rules", async () => {
    const app = createApp({
      type: "board",
      userId: "user-1",
      companyIds: ["company-1"],
      source: "session",
      isInstanceAdmin: false,
    });

    const res = await request(app).get("/api/companies/company-1/workflow-route-rules");

    expect(res.status).toBe(200);
    expect(mockWorkflowService.listRouteRules).toHaveBeenCalledWith("company-1");
    expect(res.body).toEqual([]);
  });

  it("approves a workflow case from the board route", async () => {
    const app = createApp({
      type: "board",
      userId: "user-1",
      companyIds: ["company-1"],
      source: "session",
      isInstanceAdmin: false,
    });

    const res = await request(app)
      .post("/api/workflow-cases/case-1/approve")
      .send({ approverRole: "ceo", decisionNote: "approved" });

    expect(res.status).toBe(200);
    expect(mockWorkflowService.approve).toHaveBeenCalledWith(
      "case-1",
      { approverRole: "ceo", decisionNote: "approved" },
      expect.objectContaining({
        actorType: "user",
        actorId: "user-1",
        agentId: null,
      }),
    );
  });
});
