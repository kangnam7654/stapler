import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adapterDefaultsRoutes } from "../routes/adapter-defaults.js";
import { errorHandler } from "../middleware/index.js";

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockGetAll = vi.hoisted(() => vi.fn());
const mockGetOne = vi.hoisted(() => vi.fn());
const mockPutOne = vi.hoisted(() => vi.fn());
const mockPatchOne = vi.hoisted(() => vi.fn());
const mockDeleteOne = vi.hoisted(() => vi.fn());

vi.mock("../services/adapter-defaults.js", () => ({
  adapterDefaultsService: () => ({
    getAll: mockGetAll,
    getOne: mockGetOne,
    putOne: mockPutOne,
    patchOne: mockPatchOne,
    deleteOne: mockDeleteOne,
  }),
}));

const mockLogActivity = vi.hoisted(() => vi.fn());

vi.mock("../services/activity-log.js", () => ({
  logActivity: mockLogActivity,
}));

// ── Fixtures ───────────────────────────────────────────────────────────────

const COMPANY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_COMPANY_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PROVIDER_ID = "ollama_local";

const boardActor = {
  type: "board",
  userId: "user-1",
  source: "local_implicit",
  isInstanceAdmin: true,
};

const crossCompanyActor = {
  type: "board",
  userId: "user-2",
  source: "session",
  isInstanceAdmin: false,
  companyIds: [OTHER_COMPANY_ID],
};

const agentActor = {
  type: "agent",
  agentId: "agent-1",
  companyId: OTHER_COMPANY_ID,
};

// ── App factory ────────────────────────────────────────────────────────────

function createApp(actor: Record<string, unknown>) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = actor;
    next();
  });
  // Mount with mergeParams so :companyId is visible inside the sub-router.
  app.use(
    "/api/companies/:companyId/adapter-defaults",
    adapterDefaultsRoutes({} as any),
  );
  app.use(errorHandler);
  return app;
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("GET /api/companies/:companyId/adapter-defaults", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty object when no defaults are set", async () => {
    mockGetAll.mockResolvedValue({});

    const res = await request(createApp(boardActor))
      .get(`/api/companies/${COMPANY_ID}/adapter-defaults`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
    expect(mockGetAll).toHaveBeenCalledWith(COMPANY_ID);
  });

  it("returns the full defaults map when populated", async () => {
    const defaults = {
      ollama_local: { baseUrl: "http://10.0.0.1:11434" },
      lm_studio_local: { baseUrl: "http://10.0.0.1:1234" },
    };
    mockGetAll.mockResolvedValue(defaults);

    const res = await request(createApp(boardActor))
      .get(`/api/companies/${COMPANY_ID}/adapter-defaults`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(defaults);
  });

  it("returns 403 for a board user without access to the company", async () => {
    const res = await request(createApp(crossCompanyActor))
      .get(`/api/companies/${COMPANY_ID}/adapter-defaults`);

    expect(res.status).toBe(403);
    expect(mockGetAll).not.toHaveBeenCalled();
  });

  it("returns 403 for agent actors (board-only endpoint)", async () => {
    const res = await request(createApp(agentActor))
      .get(`/api/companies/${COMPANY_ID}/adapter-defaults`);

    expect(res.status).toBe(403);
    expect(mockGetAll).not.toHaveBeenCalled();
  });
});

describe("GET /api/companies/:companyId/adapter-defaults/:providerId", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns the provider config when set", async () => {
    const config = { baseUrl: "http://10.0.0.1:11434" };
    mockGetOne.mockResolvedValue(config);

    const res = await request(createApp(boardActor))
      .get(`/api/companies/${COMPANY_ID}/adapter-defaults/${PROVIDER_ID}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(config);
    expect(mockGetOne).toHaveBeenCalledWith(COMPANY_ID, PROVIDER_ID);
  });

  it("returns 404 when the provider entry is not set", async () => {
    mockGetOne.mockResolvedValue(null);

    const res = await request(createApp(boardActor))
      .get(`/api/companies/${COMPANY_ID}/adapter-defaults/${PROVIDER_ID}`);

    expect(res.status).toBe(404);
  });
});

describe("PUT /api/companies/:companyId/adapter-defaults/:providerId", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("replaces the provider config and writes one activity log entry", async () => {
    const payload = { baseUrl: "http://10.0.0.1:11434" };
    mockPutOne.mockResolvedValue({
      updated: payload,
      affectedAgentCount: 2,
      changedFields: ["baseUrl"],
    });
    mockLogActivity.mockResolvedValue(undefined);

    const res = await request(createApp(boardActor))
      .put(`/api/companies/${COMPANY_ID}/adapter-defaults/${PROVIDER_ID}`)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(payload);
    expect(mockPutOne).toHaveBeenCalledWith(COMPANY_ID, PROVIDER_ID, payload);

    // Exactly one activity log entry.
    expect(mockLogActivity).toHaveBeenCalledTimes(1);
    const logCall = mockLogActivity.mock.calls[0][1];
    expect(logCall.action).toBe("company.adapter_defaults.updated");
    expect(logCall.companyId).toBe(COMPANY_ID);
    expect(logCall.details.providerId).toBe(PROVIDER_ID);
    expect(logCall.details.operation).toBe("put");
  });

  it("normalizes apiKey in payload — service controls persistence; route passes payload through", async () => {
    // The route delegates normalization to the service; here we verify the raw payload
    // reaches the service. In a real integration test the service would transform apiKey
    // to a secret_ref, but that is tested in the service unit tests.
    const payload = { apiKey: "sk-live-abc123" };
    mockPutOne.mockResolvedValue({
      updated: { apiKey: { type: "secret_ref", secretId: "sec-1", version: "latest" } },
      affectedAgentCount: 0,
      changedFields: ["apiKey"],
    });
    mockLogActivity.mockResolvedValue(undefined);

    const res = await request(createApp(boardActor))
      .put(`/api/companies/${COMPANY_ID}/adapter-defaults/${PROVIDER_ID}`)
      .send(payload);

    expect(res.status).toBe(200);
    // Service returned a secret_ref; that is what the route returns.
    expect(res.body.apiKey).toMatchObject({ type: "secret_ref" });
    expect(mockPutOne).toHaveBeenCalledWith(COMPANY_ID, PROVIDER_ID, payload);
  });

  it("accepts provider-specific fields beyond baseUrl/apiKey (schema is open)", async () => {
    // Phase 7: schema was loosened from .strict() to z.record(z.string(), z.unknown())
    // so provider-specific fields like model, temperature, env pass through to the service.
    const payload = { baseUrl: "http://localhost", model: "llama3.2", temperature: 0.7 };
    mockPutOne.mockResolvedValue({
      updated: payload,
      affectedAgentCount: 0,
      changedFields: ["baseUrl", "model", "temperature"],
    });
    mockLogActivity.mockResolvedValue(undefined);

    const res = await request(createApp(boardActor))
      .put(`/api/companies/${COMPANY_ID}/adapter-defaults/${PROVIDER_ID}`)
      .send(payload);

    expect(res.status).toBe(200);
    expect(mockPutOne).toHaveBeenCalledWith(COMPANY_ID, PROVIDER_ID, payload);
  });

  it("returns 403 for cross-company board user", async () => {
    const res = await request(createApp(crossCompanyActor))
      .put(`/api/companies/${COMPANY_ID}/adapter-defaults/${PROVIDER_ID}`)
      .send({ baseUrl: "http://10.0.0.1:11434" });

    expect(res.status).toBe(403);
    expect(mockPutOne).not.toHaveBeenCalled();
    expect(mockLogActivity).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/companies/:companyId/adapter-defaults/:providerId", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("merges the provider config deeply and writes one activity log entry", async () => {
    const payload = { apiKey: "sk-new" };
    const merged = { baseUrl: "http://10.0.0.1:11434", apiKey: "sk-new" };
    mockPatchOne.mockResolvedValue({
      merged,
      affectedAgentCount: 1,
      changedFields: ["apiKey"],
    });
    mockLogActivity.mockResolvedValue(undefined);

    const res = await request(createApp(boardActor))
      .patch(`/api/companies/${COMPANY_ID}/adapter-defaults/${PROVIDER_ID}`)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(merged);
    expect(mockPatchOne).toHaveBeenCalledWith(COMPANY_ID, PROVIDER_ID, payload);

    expect(mockLogActivity).toHaveBeenCalledTimes(1);
    const logCall = mockLogActivity.mock.calls[0][1];
    expect(logCall.action).toBe("company.adapter_defaults.updated");
    expect(logCall.companyId).toBe(COMPANY_ID);
    expect(logCall.details.operation).toBe("patch");
  });

  it("accepts provider-specific fields in PATCH payload (schema is open)", async () => {
    // Phase 7: schema was loosened; any object keys are forwarded to the service.
    const payload = { model: "qwen2.5-coder" };
    const merged = { baseUrl: "http://10.0.0.1:11434", model: "qwen2.5-coder" };
    mockPatchOne.mockResolvedValue({
      merged,
      affectedAgentCount: 0,
      changedFields: ["model"],
    });
    mockLogActivity.mockResolvedValue(undefined);

    const res = await request(createApp(boardActor))
      .patch(`/api/companies/${COMPANY_ID}/adapter-defaults/${PROVIDER_ID}`)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(merged);
    expect(mockPatchOne).toHaveBeenCalledWith(COMPANY_ID, PROVIDER_ID, payload);
  });
});

describe("DELETE /api/companies/:companyId/adapter-defaults/:providerId", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("removes only the specified provider and writes one activity log entry", async () => {
    mockDeleteOne.mockResolvedValue({ affectedAgentCount: 3 });
    mockLogActivity.mockResolvedValue(undefined);

    const res = await request(createApp(boardActor))
      .delete(`/api/companies/${COMPANY_ID}/adapter-defaults/${PROVIDER_ID}`);

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
    expect(mockDeleteOne).toHaveBeenCalledWith(COMPANY_ID, PROVIDER_ID);

    expect(mockLogActivity).toHaveBeenCalledTimes(1);
    const logCall = mockLogActivity.mock.calls[0][1];
    expect(logCall.action).toBe("company.adapter_defaults.updated");
    expect(logCall.companyId).toBe(COMPANY_ID);
    expect(logCall.details.operation).toBe("delete");
    expect(logCall.details.providerId).toBe(PROVIDER_ID);
  });

  it("returns 403 for cross-company board user", async () => {
    const res = await request(createApp(crossCompanyActor))
      .delete(`/api/companies/${COMPANY_ID}/adapter-defaults/${PROVIDER_ID}`);

    expect(res.status).toBe(403);
    expect(mockDeleteOne).not.toHaveBeenCalled();
    expect(mockLogActivity).not.toHaveBeenCalled();
  });

  it("returns 403 for agent actors (board-only endpoint)", async () => {
    const res = await request(createApp(agentActor))
      .delete(`/api/companies/${COMPANY_ID}/adapter-defaults/${PROVIDER_ID}`);

    expect(res.status).toBe(403);
    expect(mockDeleteOne).not.toHaveBeenCalled();
  });
});
