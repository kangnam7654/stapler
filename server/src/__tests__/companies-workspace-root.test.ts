import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCompanyService = vi.hoisted(() => ({
  list: vi.fn(),
  stats: vi.fn(),
  getById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  archive: vi.fn(),
  remove: vi.fn(),
}));

const mockAgentService = vi.hoisted(() => ({
  getById: vi.fn(),
}));

const mockAccessService = vi.hoisted(() => ({
  ensureMembership: vi.fn().mockResolvedValue(undefined),
}));

const mockBudgetService = vi.hoisted(() => ({
  upsertPolicy: vi.fn().mockResolvedValue(undefined),
}));

const mockCompanyPortabilityService = vi.hoisted(() => ({
  exportBundle: vi.fn(),
  previewExport: vi.fn(),
  previewImport: vi.fn(),
  importBundle: vi.fn(),
}));

const mockLogActivity = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("../services/index.js", () => ({
  accessService: () => mockAccessService,
  agentService: () => mockAgentService,
  budgetService: () => mockBudgetService,
  companyPortabilityService: () => mockCompanyPortabilityService,
  companyService: () => mockCompanyService,
  logActivity: mockLogActivity,
}));

vi.mock("../services/company-docs.js", () => ({ ensureCompanyDocs: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../services/onboarding-progress.js", () => ({ getOnboardingProgress: vi.fn() }));

import { companyRoutes } from "../routes/companies.js";
import { errorHandler } from "../middleware/index.js";

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = {
      type: "board",
      userId: "user-1",
      source: "local_implicit",
      isInstanceAdmin: true,
    };
    next();
  });
  app.use("/api/companies", companyRoutes({} as any));
  app.use(errorHandler);
  return app;
}

function baseCompany(overrides: Record<string, unknown> = {}) {
  return {
    id: "company-1",
    name: "Acme",
    description: null,
    status: "active",
    pauseReason: null,
    pausedAt: null,
    issuePrefix: "ACM",
    issueCounter: 0,
    budgetMonthlyCents: 0,
    spentMonthlyCents: 0,
    requireBoardApprovalForNewAgents: true,
    brandColor: null,
    logoAssetId: null,
    logoUrl: null,
    adapterDefaults: null,
    workspaceRootPath: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("companies — workspaceRootPath round-trip", () => {
  beforeEach(() => {
    Object.values(mockCompanyService).forEach((fn) => fn.mockReset());
    mockLogActivity.mockReset().mockResolvedValue(undefined);
    mockAccessService.ensureMembership.mockReset().mockResolvedValue(undefined);
    mockBudgetService.upsertPolicy.mockReset().mockResolvedValue(undefined);
  });

  it("PATCH persists workspaceRootPath and returns it", async () => {
    const updated = baseCompany({ workspaceRootPath: "/work/acme" });
    mockCompanyService.update.mockResolvedValue(updated);
    const app = createApp();
    const res = await request(app).patch("/api/companies/company-1").send({
      workspaceRootPath: "/work/acme",
    });
    expect(res.status).toBe(200);
    expect(res.body.workspaceRootPath).toBe("/work/acme");
    expect(mockCompanyService.update).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({ workspaceRootPath: "/work/acme" }),
    );
  });

  it("PATCH normalizes empty string to null", async () => {
    const updated = baseCompany({ workspaceRootPath: null });
    mockCompanyService.update.mockResolvedValue(updated);
    const app = createApp();
    const res = await request(app).patch("/api/companies/company-1").send({
      workspaceRootPath: "",
    });
    expect(res.status).toBe(200);
    expect(mockCompanyService.update).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({ workspaceRootPath: null }),
    );
  });

  it("PATCH rejects relative path with 400/422", async () => {
    const app = createApp();
    const res = await request(app).patch("/api/companies/company-1").send({
      workspaceRootPath: "relative/path",
    });
    expect([400, 422]).toContain(res.status);
    expect(mockCompanyService.update).not.toHaveBeenCalled();
  });

  it("POST accepts workspaceRootPath at create time", async () => {
    const created = baseCompany({ workspaceRootPath: "~/work/acme" });
    mockCompanyService.create.mockResolvedValue(created);
    const app = createApp();
    const res = await request(app).post("/api/companies").send({
      name: "Acme",
      workspaceRootPath: "~/work/acme",
    });
    expect(res.status).toBe(201);
    expect(res.body.workspaceRootPath).toBe("~/work/acme");
    // Verify the route forwards the field to the service, not just echoing the mock
    expect(mockCompanyService.create).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceRootPath: "~/work/acme" }),
    );
  });

  it("PATCH by agent is rejected (board-only field — only CEO agents allowed, non-CEO gets 403)", async () => {
    // The PATCH /:companyId handler checks actor type:
    //   agent → calls agentService.getById; if not CEO → throw forbidden (403)
    //   board → uses updateCompanySchema which includes workspaceRootPath
    // mockAgentService.getById returns undefined by default → actorAgent is null → 403
    // This locks down that a generic agent cannot write workspaceRootPath.
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).actor = {
        type: "agent",
        agentId: "agent-1",
        companyId: "company-1",
      };
      next();
    });
    app.use("/api/companies", companyRoutes({} as any));
    app.use(errorHandler);

    const res = await request(app).patch("/api/companies/company-1").send({
      workspaceRootPath: "/sneaky/path",
      brandColor: "#ff0000",
    });

    // Non-CEO agent is forbidden; service.update must not be reached
    expect(res.status).toBe(403);
    expect(mockCompanyService.update).not.toHaveBeenCalled();
  });
});
