/**
 * Integration tests for POST /api/companies/:companyId/agents/bulk-apply
 *
 * Uses real embedded PGlite database — no DB mocks.
 * External services (secretsSvc, instanceSettings) are mocked.
 */
import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  activityLog,
  agents,
  companies,
  createDb,
} from "@paperclipai/db";
import { eq } from "drizzle-orm";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { errorHandler } from "../middleware/index.js";
import { bulkApplyRoutes } from "../routes/bulk-apply.js";

// ─── Embedded postgres guard ─────────────────────────────────────────────────

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping bulk-apply integration tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Mock secrets service: normalizeAdapterConfigForPersistence is a pass-through.
vi.mock("../services/secrets.js", () => ({
  secretService: () => ({
    normalizeAdapterConfigForPersistence: vi.fn(async (_companyId: string, config: Record<string, unknown>) => config),
    resolveAdapterConfigForRuntime: vi.fn(async (_companyId: string, config: Record<string, unknown>) => ({ config })),
  }),
}));

// Mock instance settings: return minimal general settings.
vi.mock("../services/instance-settings.js", () => ({
  instanceSettingsService: () => ({
    getGeneral: vi.fn(async () => ({ censorUsernameInLogs: false })),
  }),
}));

// Mock live events (no-op).
vi.mock("../services/live-events.js", () => ({
  publishLiveEvent: vi.fn(),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createApp(
  db: ReturnType<typeof createDb>,
  actor: Record<string, unknown> = {
    type: "board",
    userId: "user-1",
    source: "local_implicit",
    isInstanceAdmin: true,
  },
) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = actor;
    next();
  });
  app.use("/api", bulkApplyRoutes(db));
  app.use(errorHandler);
  return app;
}

function issuePrefix(companyId: string) {
  return `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describeEmbeddedPostgres("POST /api/companies/:companyId/agents/bulk-apply", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-bulk-apply-");
    db = createDb(tempDb.connectionString);
  }, 20_000);

  afterEach(async () => {
    await db.delete(activityLog);
    await db.delete(agents);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function seedCompany(overrides: Record<string, unknown> = {}) {
    const companyId = randomUUID();
    await db.insert(companies).values({
      id: companyId,
      name: "Test Co",
      issuePrefix: issuePrefix(companyId),
      requireBoardApprovalForNewAgents: false,
      ...overrides,
    });
    return companyId;
  }

  async function seedAgent(
    companyId: string,
    adapterType = "lm_studio_local",
    adapterConfig: Record<string, unknown> = { model: "old-model", baseUrl: "http://old" },
  ) {
    const agentId = randomUUID();
    await db.insert(agents).values({
      id: agentId,
      companyId,
      name: `Agent-${agentId.slice(0, 8)}`,
      role: "engineer",
      status: "idle",
      adapterType,
      adapterConfig,
      runtimeConfig: {},
      permissions: {},
    });
    return agentId;
  }

  async function getAgent(id: string) {
    return db.select().from(agents).where(eq(agents.id, id)).then((rows) => rows[0] ?? null);
  }

  async function getActivityLogs(companyId: string) {
    return db.select().from(activityLog).where(eq(activityLog.companyId, companyId));
  }

  // ── Mode: inherit ─────────────────────────────────────────────────────────

  describe("mode: inherit", () => {
    it("strips named fields from adapterConfig and leaves others intact", async () => {
      const companyId = await seedCompany();
      const agentId = await seedAgent(companyId, "lm_studio_local", {
        model: "old-model",
        baseUrl: "http://old",
        otherField: "keep-me",
      });

      const app = createApp(db);
      const res = await request(app)
        .post(`/api/companies/${companyId}/agents/bulk-apply`)
        .send({ mode: "inherit", agentIds: [agentId], fields: ["model", "baseUrl"] });

      expect(res.status).toBe(200);
      expect(res.body.data.mode).toBe("inherit");
      expect(res.body.data.updatedAgentIds).toEqual([agentId]);

      const updated = await getAgent(agentId);
      expect(updated?.adapterConfig).toEqual({ otherField: "keep-me" });
    });

    it("strips fields from multiple agents in a single call", async () => {
      const companyId = await seedCompany();
      const agentId1 = await seedAgent(companyId, "lm_studio_local", { model: "a", extra: "1" });
      const agentId2 = await seedAgent(companyId, "lm_studio_local", { model: "b", extra: "2" });

      const app = createApp(db);
      const res = await request(app)
        .post(`/api/companies/${companyId}/agents/bulk-apply`)
        .send({ mode: "inherit", agentIds: [agentId1, agentId2], fields: ["model"] });

      expect(res.status).toBe(200);

      const a1 = await getAgent(agentId1);
      const a2 = await getAgent(agentId2);
      expect(a1?.adapterConfig).toEqual({ extra: "1" });
      expect(a2?.adapterConfig).toEqual({ extra: "2" });
    });
  });

  // ── Mode: override ────────────────────────────────────────────────────────

  describe("mode: override", () => {
    it("sets specified fields and preserves unrelated fields", async () => {
      const companyId = await seedCompany();
      const agentId = await seedAgent(companyId, "lm_studio_local", {
        model: "old-model",
        baseUrl: "http://old",
        unrelated: "keep",
      });

      const app = createApp(db);
      const res = await request(app)
        .post(`/api/companies/${companyId}/agents/bulk-apply`)
        .send({
          mode: "override",
          agentIds: [agentId],
          fields: { model: "new-model", baseUrl: "http://new" },
        });

      expect(res.status).toBe(200);
      expect(res.body.data.mode).toBe("override");

      const updated = await getAgent(agentId);
      expect(updated?.adapterConfig).toEqual({
        model: "new-model",
        baseUrl: "http://new",
        unrelated: "keep",
      });
    });

    it("sets fields on multiple agents", async () => {
      const companyId = await seedCompany();
      const agentId1 = await seedAgent(companyId, "lm_studio_local", { model: "a" });
      const agentId2 = await seedAgent(companyId, "lm_studio_local", { model: "b" });

      const app = createApp(db);
      const res = await request(app)
        .post(`/api/companies/${companyId}/agents/bulk-apply`)
        .send({
          mode: "override",
          agentIds: [agentId1, agentId2],
          fields: { model: "shared-model" },
        });

      expect(res.status).toBe(200);

      const a1 = await getAgent(agentId1);
      const a2 = await getAgent(agentId2);
      expect(a1?.adapterConfig?.model).toBe("shared-model");
      expect(a2?.adapterConfig?.model).toBe("shared-model");
    });
  });

  // ── Mode: swap-adapter ────────────────────────────────────────────────────

  describe("mode: swap-adapter", () => {
    it("replaces adapterType and adapterConfig wholesale", async () => {
      const companyId = await seedCompany();
      const agentId = await seedAgent(companyId, "lm_studio_local", {
        model: "old-model",
        baseUrl: "http://old",
      });

      const app = createApp(db);
      const res = await request(app)
        .post(`/api/companies/${companyId}/agents/bulk-apply`)
        .send({
          mode: "swap-adapter",
          agentIds: [agentId],
          newAdapterType: "ollama_local",
          newAdapterConfig: { model: "llama3.2", baseUrl: "http://new-ollama" },
        });

      expect(res.status).toBe(200);
      expect(res.body.data.mode).toBe("swap-adapter");

      const updated = await getAgent(agentId);
      expect(updated?.adapterType).toBe("ollama_local");
      expect(updated?.adapterConfig).toEqual({
        model: "llama3.2",
        baseUrl: "http://new-ollama",
      });
    });

    it("replaces adapterType and adapterConfig for multiple agents", async () => {
      const companyId = await seedCompany();
      const agentId1 = await seedAgent(companyId, "lm_studio_local", { model: "a" });
      const agentId2 = await seedAgent(companyId, "lm_studio_local", { model: "b" });

      const app = createApp(db);
      const res = await request(app)
        .post(`/api/companies/${companyId}/agents/bulk-apply`)
        .send({
          mode: "swap-adapter",
          agentIds: [agentId1, agentId2],
          newAdapterType: "ollama_local",
          newAdapterConfig: { model: "new-model" },
        });

      expect(res.status).toBe(200);

      const a1 = await getAgent(agentId1);
      const a2 = await getAgent(agentId2);
      expect(a1?.adapterType).toBe("ollama_local");
      expect(a2?.adapterType).toBe("ollama_local");
      expect(a1?.adapterConfig?.model).toBe("new-model");
      expect(a2?.adapterConfig?.model).toBe("new-model");
    });
  });

  // ── Activity log ──────────────────────────────────────────────────────────

  describe("activity log", () => {
    it("records exactly 1 activity log entry with action 'agent.adapter_config.bulk_applied'", async () => {
      const companyId = await seedCompany();
      const agentId1 = await seedAgent(companyId);
      const agentId2 = await seedAgent(companyId);

      const app = createApp(db);
      await request(app)
        .post(`/api/companies/${companyId}/agents/bulk-apply`)
        .send({
          mode: "inherit",
          agentIds: [agentId1, agentId2],
          fields: ["model"],
        });

      const logs = await getActivityLogs(companyId);
      expect(logs).toHaveLength(1);
      expect(logs[0].action).toBe("agent.adapter_config.bulk_applied");
    });

    it("includes agentIds and mode in the log details", async () => {
      const companyId = await seedCompany();
      const agentId = await seedAgent(companyId);

      const app = createApp(db);
      await request(app)
        .post(`/api/companies/${companyId}/agents/bulk-apply`)
        .send({
          mode: "override",
          agentIds: [agentId],
          fields: { model: "x" },
        });

      const logs = await getActivityLogs(companyId);
      expect(logs).toHaveLength(1);
      expect(logs[0].details).toMatchObject({
        mode: "override",
        agentIds: [agentId],
      });
    });
  });

  // ── Cross-company 409 ─────────────────────────────────────────────────────

  describe("cross-company rejection", () => {
    it("returns 409 when an agentId belongs to a different company", async () => {
      const companyA = await seedCompany();
      const companyB = await seedCompany();
      const agentA = await seedAgent(companyA);
      const agentB = await seedAgent(companyB); // belongs to company B

      const app = createApp(db);
      const res = await request(app)
        .post(`/api/companies/${companyA}/agents/bulk-apply`)
        .send({
          mode: "inherit",
          agentIds: [agentA, agentB], // mix of companies
          fields: ["model"],
        });

      expect(res.status).toBe(409);
    });

    it("does not modify any agent when cross-company agent is included", async () => {
      const companyA = await seedCompany();
      const companyB = await seedCompany();
      const agentA = await seedAgent(companyA, "lm_studio_local", { model: "original" });
      const agentB = await seedAgent(companyB, "lm_studio_local", { model: "b-original" });

      const app = createApp(db);
      await request(app)
        .post(`/api/companies/${companyA}/agents/bulk-apply`)
        .send({
          mode: "inherit",
          agentIds: [agentA, agentB],
          fields: ["model"],
        });

      // Agent A should be unchanged because the request was rejected
      const a = await getAgent(agentA);
      expect(a?.adapterConfig?.model).toBe("original");
    });
  });

  // ── Authorization ─────────────────────────────────────────────────────────

  describe("authorization", () => {
    it("returns 403 when caller is an agent (non-board)", async () => {
      const companyId = await seedCompany();
      const agentId = await seedAgent(companyId);

      const agentActor = {
        type: "agent",
        agentId,
        companyId,
        runId: randomUUID(),
      };

      const app = createApp(db, agentActor);
      const res = await request(app)
        .post(`/api/companies/${companyId}/agents/bulk-apply`)
        .send({
          mode: "inherit",
          agentIds: [agentId],
          fields: ["model"],
        });

      expect(res.status).toBe(403);
    });
  });

  // ── Validation ────────────────────────────────────────────────────────────

  describe("validation", () => {
    it("returns 400 for invalid mode", async () => {
      const companyId = await seedCompany();

      const app = createApp(db);
      const res = await request(app)
        .post(`/api/companies/${companyId}/agents/bulk-apply`)
        .send({ mode: "invalid-mode", agentIds: [randomUUID()], fields: ["model"] });

      expect(res.status).toBe(400);
    });

    it("returns 400 for empty agentIds array", async () => {
      const companyId = await seedCompany();

      const app = createApp(db);
      const res = await request(app)
        .post(`/api/companies/${companyId}/agents/bulk-apply`)
        .send({ mode: "inherit", agentIds: [], fields: ["model"] });

      expect(res.status).toBe(400);
    });

    it("returns 400 for non-UUID agentId", async () => {
      const companyId = await seedCompany();

      const app = createApp(db);
      const res = await request(app)
        .post(`/api/companies/${companyId}/agents/bulk-apply`)
        .send({ mode: "inherit", agentIds: ["not-a-uuid"], fields: ["model"] });

      expect(res.status).toBe(400);
    });
  });

  // ── Not found ─────────────────────────────────────────────────────────────

  describe("not found", () => {
    it("returns 404 when an agentId does not exist", async () => {
      const companyId = await seedCompany();
      const nonExistentId = randomUUID();

      const app = createApp(db);
      const res = await request(app)
        .post(`/api/companies/${companyId}/agents/bulk-apply`)
        .send({
          mode: "inherit",
          agentIds: [nonExistentId],
          fields: ["model"],
        });

      expect(res.status).toBe(404);
    });
  });
});
