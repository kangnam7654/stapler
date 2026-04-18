import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockProjectService = vi.hoisted(() => ({
  list: vi.fn(),
  getById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  createWorkspace: vi.fn(),
  listWorkspaces: vi.fn(),
  updateWorkspace: vi.fn(),
  removeWorkspace: vi.fn(),
  resolveByReference: vi.fn(),
}));

const mockCompanyService = vi.hoisted(() => ({
  getById: vi.fn(),
}));

const mockLogActivity = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("../services/index.js", () => ({
  projectService: () => mockProjectService,
  companyService: () => mockCompanyService,
  logActivity: mockLogActivity,
}));

import { projectRoutes } from "../routes/projects.js";
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
  app.use("/api", projectRoutes({} as any));
  app.use(errorHandler);
  return app;
}

function baseProject(overrides: Record<string, unknown> = {}) {
  return {
    id: "project-1",
    companyId: "company-1",
    name: "Calc",
    description: null,
    status: "backlog",
    workspacePathOverride: null,
    archivedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("projects — workspacePathOverride round-trip", () => {
  beforeEach(() => {
    Object.values(mockProjectService).forEach((fn) => fn.mockReset());
    mockLogActivity.mockReset().mockResolvedValue(undefined);
  });

  it("PATCH persists workspacePathOverride", async () => {
    mockProjectService.getById.mockResolvedValue(baseProject());
    mockProjectService.update.mockResolvedValue(baseProject({ workspacePathOverride: "/dev/legacy" }));
    const app = createApp();
    const res = await request(app).patch("/api/projects/project-1").send({
      workspacePathOverride: "/dev/legacy",
    });
    expect(res.status).toBe(200);
    expect(res.body.workspacePathOverride).toBe("/dev/legacy");
    expect(mockProjectService.update).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({ workspacePathOverride: "/dev/legacy" }),
    );
  });

  it("PATCH normalizes empty string to null", async () => {
    mockProjectService.getById.mockResolvedValue(baseProject({ workspacePathOverride: "/old" }));
    mockProjectService.update.mockResolvedValue(baseProject({ workspacePathOverride: null }));
    const app = createApp();
    const res = await request(app).patch("/api/projects/project-1").send({
      workspacePathOverride: "",
    });
    expect(res.status).toBe(200);
    expect(mockProjectService.update).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({ workspacePathOverride: null }),
    );
  });

  it("PATCH rejects relative path", async () => {
    mockProjectService.getById.mockResolvedValue(baseProject());
    const app = createApp();
    const res = await request(app).patch("/api/projects/project-1").send({
      workspacePathOverride: "relative",
    });
    expect([400, 422]).toContain(res.status);
  });

  it("POST accepts workspacePathOverride at create", async () => {
    mockProjectService.create.mockResolvedValue(baseProject({ workspacePathOverride: "~/dev/legacy" }));
    const app = createApp();
    const res = await request(app).post("/api/companies/company-1/projects").send({
      name: "Calc",
      workspacePathOverride: "~/dev/legacy",
    });
    expect(res.status).toBe(201);
    expect(res.body.workspacePathOverride).toBe("~/dev/legacy");
    expect(mockProjectService.create).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({ workspacePathOverride: "~/dev/legacy" }),
    );
  });

  it("PATCH by non-board agent with workspacePathOverride is rejected (board-only field)", async () => {
    // Use a valid UUIDv4 so router.param skips resolveByReference; getById returns a company-1 project
    const projectUuid = "550e8400-e29b-41d4-a716-446655440000";
    mockProjectService.getById.mockResolvedValue(baseProject({ id: projectUuid }));
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
    app.use("/api", projectRoutes({} as any));
    app.use(errorHandler);

    const res = await request(app).patch(`/api/projects/${projectUuid}`).send({
      workspacePathOverride: "/sneaky/path",
    });

    expect(res.status).toBe(403);
    expect(mockProjectService.update).not.toHaveBeenCalled();
  });

  it("POST by non-board agent with workspacePathOverride is rejected (board-only field)", async () => {
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
    app.use("/api", projectRoutes({} as any));
    app.use(errorHandler);

    const res = await request(app).post("/api/companies/company-1/projects").send({
      name: "Calc",
      workspacePathOverride: "/sneaky/path",
    });

    expect(res.status).toBe(403);
    expect(mockProjectService.create).not.toHaveBeenCalled();
  });
});
