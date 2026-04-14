import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { companyRoutes } from "../routes/companies.js";
import { errorHandler } from "../middleware/index.js";

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
  ensureMembership: vi.fn(),
}));

const mockBudgetService = vi.hoisted(() => ({
  upsertPolicy: vi.fn(),
}));

const mockCompanyPortabilityService = vi.hoisted(() => ({
  exportBundle: vi.fn(),
  previewExport: vi.fn(),
  previewImport: vi.fn(),
  importBundle: vi.fn(),
}));

const mockLogActivity = vi.hoisted(() => vi.fn());

vi.mock("../services/index.js", () => ({
  accessService: () => mockAccessService,
  agentService: () => mockAgentService,
  budgetService: () => mockBudgetService,
  companyPortabilityService: () => mockCompanyPortabilityService,
  companyService: () => mockCompanyService,
  logActivity: mockLogActivity,
}));

function createBaseCompany(overrides: Record<string, unknown> = {}) {
  const now = new Date("2026-04-14T00:00:00.000Z");
  return {
    id: "company-1",
    name: "Test Co",
    description: null,
    status: "active",
    issuePrefix: "TST",
    issueCounter: 0,
    budgetMonthlyCents: 0,
    spentMonthlyCents: 0,
    requireBoardApprovalForNewAgents: true,
    brandColor: null,
    logoAssetId: null,
    logoUrl: null,
    adapterDefaults: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = {
      type: "board",
      userId: "user-1",
      source: "local_implicit",
    };
    next();
  });
  app.use("/api/companies", companyRoutes({} as any));
  app.use(errorHandler);
  return app;
}

describe("PATCH /api/companies/:companyId — adapterDefaults round-trip", () => {
  beforeEach(() => {
    mockCompanyService.create.mockReset();
    mockCompanyService.update.mockReset();
    mockLogActivity.mockReset();
    mockAccessService.ensureMembership.mockReset();
    mockBudgetService.upsertPolicy.mockReset();
  });

  it("persists adapterDefaults and returns them in the response", async () => {
    const adapterDefaults = {
      lm_studio_local: { baseUrl: "http://10.0.0.5:1234" },
      ollama_local: { baseUrl: "http://10.0.0.5:11434" },
    };
    const updatedCompany = createBaseCompany({ adapterDefaults });
    mockCompanyService.update.mockResolvedValue(updatedCompany);

    const app = createApp();
    const res = await request(app)
      .patch("/api/companies/company-1")
      .send({ adapterDefaults });

    expect(res.status).toBe(200);
    expect(res.body.adapterDefaults).toEqual(adapterDefaults);
    expect(mockCompanyService.update).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({ adapterDefaults }),
    );
  });

  it("clears adapterDefaults when sent as null", async () => {
    const updatedCompany = createBaseCompany({ adapterDefaults: null });
    mockCompanyService.update.mockResolvedValue(updatedCompany);

    const app = createApp();
    const res = await request(app)
      .patch("/api/companies/company-1")
      .send({ adapterDefaults: null });

    expect(res.status).toBe(200);
    expect(res.body.adapterDefaults).toBeNull();
    expect(mockCompanyService.update).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({ adapterDefaults: null }),
    );
  });
});
