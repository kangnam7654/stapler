import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../middleware/index.js";
import { executionWorkspaceRoutes } from "../routes/execution-workspaces.js";

const companyId = "22222222-2222-4222-8222-222222222222";
const workspaceId = "11111111-1111-4111-8111-111111111111";
const workspacePath = "/tmp/paperclip-workspace";

const mockExecutionWorkspaceService = vi.hoisted(() => ({
  list: vi.fn(),
  getById: vi.fn(),
  update: vi.fn(),
}));

const mockWorkspaceOperationService = vi.hoisted(() => ({
  createRecorder: vi.fn(),
}));

const mockOpenLocalDirectory = vi.hoisted(() => vi.fn());

vi.mock("../services/execution-workspaces.js", () => ({
  executionWorkspaceService: () => mockExecutionWorkspaceService,
}));

vi.mock("../services/workspace-operations.js", () => ({
  workspaceOperationService: () => mockWorkspaceOperationService,
}));

vi.mock("../services/activity-log.js", () => ({
  logActivity: vi.fn(),
}));

vi.mock("../services/local-path-opener.js", () => ({
  openLocalDirectory: mockOpenLocalDirectory,
}));

function createApp(actor: Record<string, unknown>) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = actor;
    next();
  });
  app.use("/api", executionWorkspaceRoutes({} as any));
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

const agentActor = {
  type: "agent",
  agentId: "33333333-3333-4333-8333-333333333333",
  companyId,
};

function buildWorkspace(overrides: Record<string, unknown> = {}) {
  return {
    id: workspaceId,
    companyId,
    projectId: "44444444-4444-4444-8444-444444444444",
    projectWorkspaceId: null,
    sourceIssueId: "55555555-5555-4555-8555-555555555555",
    mode: "isolated_workspace",
    strategyType: "git_worktree",
    name: "PAP-123-build-calculator",
    status: "active",
    cwd: workspacePath,
    repoUrl: null,
    baseRef: "HEAD",
    branchName: "PAP-123-build-calculator",
    providerType: "git_worktree",
    providerRef: null,
    derivedFromExecutionWorkspaceId: null,
    lastUsedAt: new Date().toISOString(),
    openedAt: new Date().toISOString(),
    closedAt: null,
    cleanupEligibleAt: null,
    cleanupReason: null,
    metadata: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("execution workspace routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecutionWorkspaceService.getById.mockResolvedValue(buildWorkspace());
  });

  it("opens a persisted workspace path for board users", async () => {
    const res = await request(createApp(boardActor))
      .post(`/api/execution-workspaces/${workspaceId}/open`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ path: workspacePath });
    expect(mockOpenLocalDirectory).toHaveBeenCalledWith(workspacePath);
  });

  it("prefers providerRef when opening a workspace", async () => {
    mockExecutionWorkspaceService.getById.mockResolvedValue(
      buildWorkspace({ providerRef: "/tmp/paperclip-worktree" }),
    );

    const res = await request(createApp(boardActor))
      .post(`/api/execution-workspaces/${workspaceId}/open`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ path: "/tmp/paperclip-worktree" });
    expect(mockOpenLocalDirectory).toHaveBeenCalledWith("/tmp/paperclip-worktree");
  });

  it("rejects agent attempts to open local filesystem paths", async () => {
    const res = await request(createApp(agentActor))
      .post(`/api/execution-workspaces/${workspaceId}/open`)
      .send({});

    expect(res.status).toBe(403);
    expect(mockExecutionWorkspaceService.getById).not.toHaveBeenCalled();
    expect(mockOpenLocalDirectory).not.toHaveBeenCalled();
  });

  it("rejects workspaces without a local path", async () => {
    mockExecutionWorkspaceService.getById.mockResolvedValue(
      buildWorkspace({ cwd: null, providerRef: null }),
    );

    const res = await request(createApp(boardActor))
      .post(`/api/execution-workspaces/${workspaceId}/open`)
      .send({});

    expect(res.status).toBe(422);
    expect(res.body.error).toContain("does not have a local path");
    expect(mockOpenLocalDirectory).not.toHaveBeenCalled();
  });
});
