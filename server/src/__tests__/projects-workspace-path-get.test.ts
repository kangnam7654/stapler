import express from "express";
import request from "supertest";
import { describe, expect, it, vi, beforeEach } from "vitest";

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

type Actor = Record<string, unknown>;

const defaultActor: Actor = {
  type: "board",
  userId: "user-1",
  source: "local_implicit",
  isInstanceAdmin: true,
};

function createApp(actor: Actor = defaultActor) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = actor;
    next();
  });
  app.use("/api", projectRoutes({} as any));
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  Object.values(mockProjectService).forEach((fn) => (fn as ReturnType<typeof vi.fn>).mockReset());
  mockCompanyService.getById.mockReset();
  mockLogActivity.mockReset().mockResolvedValue(undefined);
  vi.stubEnv("STAPLER_WORKSPACE_ROOT", "");
});

describe("GET /api/projects/:id/workspace-path", () => {
  it("returns project_override when set", async () => {
    mockProjectService.getById.mockResolvedValue({
      id: "550e8400-e29b-41d4-a716-446655440001",
      companyId: "c1",
      name: "Calc",
      workspacePathOverride: "/dev/legacy",
    });
    mockCompanyService.getById.mockResolvedValue({
      id: "c1",
      name: "Acme",
      workspaceRootPath: "/work/acme",
    });
    const res = await request(createApp()).get(
      "/api/projects/550e8400-e29b-41d4-a716-446655440001/workspace-path",
    );
    expect(res.status).toBe(200);
    expect(res.body.resolvedAbsolutePath).toBe("/dev/legacy");
    expect(res.body.source).toBe("project_override");
  });

  it("returns company_root when override null", async () => {
    mockProjectService.getById.mockResolvedValue({
      id: "550e8400-e29b-41d4-a716-446655440002",
      companyId: "c1",
      name: "Calc",
      workspacePathOverride: null,
    });
    mockCompanyService.getById.mockResolvedValue({
      id: "c1",
      name: "Acme",
      workspaceRootPath: "/work/acme",
    });
    const res = await request(createApp()).get(
      "/api/projects/550e8400-e29b-41d4-a716-446655440002/workspace-path",
    );
    expect(res.status).toBe(200);
    expect(res.body.resolvedAbsolutePath).toBe("/work/acme/calc");
    expect(res.body.source).toBe("company_root");
  });

  it("returns system_default when both null", async () => {
    mockProjectService.getById.mockResolvedValue({
      id: "550e8400-e29b-41d4-a716-446655440003",
      companyId: "c1",
      name: "Calc",
      workspacePathOverride: null,
    });
    mockCompanyService.getById.mockResolvedValue({
      id: "c1",
      name: "Acme",
      workspaceRootPath: null,
    });
    const res = await request(createApp()).get(
      "/api/projects/550e8400-e29b-41d4-a716-446655440003/workspace-path",
    );
    expect(res.status).toBe(200);
    expect(res.body.source).toBe("system_default");
    expect(res.body.resolvedAbsolutePath).toMatch(/\/Stapler\/acme\/calc$/);
  });

  it("404 when project not found", async () => {
    mockProjectService.getById.mockResolvedValue(null);
    const res = await request(createApp()).get(
      "/api/projects/550e8400-e29b-41d4-a716-446655440004/workspace-path",
    );
    expect(res.status).toBe(404);
  });

  it("403 when agent actor belongs to a different company", async () => {
    mockProjectService.getById.mockResolvedValue({
      id: "550e8400-e29b-41d4-a716-446655440005",
      companyId: "c1",
      name: "Calc",
      workspacePathOverride: null,
    });
    const agentActor: Actor = {
      type: "agent",
      agentId: "agent-1",
      companyId: "c2",
      source: "api_key",
    };
    const res = await request(createApp(agentActor)).get(
      "/api/projects/550e8400-e29b-41d4-a716-446655440005/workspace-path",
    );
    expect(res.status).toBe(403);
  });

  it("expands ~ in project_override to absolute home path", async () => {
    // Regression: GET /workspace-path must return a usable absolute path so
    // the UI clipboard / Finder / IDE openers don't see a literal "~/...".
    mockProjectService.getById.mockResolvedValue({
      id: "550e8400-e29b-41d4-a716-446655440007",
      companyId: "c1",
      name: "Calc",
      workspacePathOverride: "~/dev/legacy",
    });
    mockCompanyService.getById.mockResolvedValue({
      id: "c1",
      name: "Acme",
      workspaceRootPath: null,
    });
    const res = await request(createApp()).get(
      "/api/projects/550e8400-e29b-41d4-a716-446655440007/workspace-path",
    );
    expect(res.status).toBe(200);
    expect(res.body.source).toBe("project_override");
    expect(res.body.resolvedAbsolutePath.startsWith("~")).toBe(false);
    expect(res.body.resolvedAbsolutePath.endsWith("/dev/legacy")).toBe(true);
  });

  it("404 when company not found", async () => {
    mockProjectService.getById.mockResolvedValue({
      id: "550e8400-e29b-41d4-a716-446655440006",
      companyId: "c1",
      name: "Calc",
      workspacePathOverride: null,
    });
    mockCompanyService.getById.mockResolvedValue(null);
    const res = await request(createApp()).get(
      "/api/projects/550e8400-e29b-41d4-a716-446655440006/workspace-path",
    );
    expect(res.status).toBe(404);
    expect(res.body.error).toBeTruthy();
  });
});
