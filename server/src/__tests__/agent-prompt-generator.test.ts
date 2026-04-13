import express from "express";
import request from "supertest";
import { createServer } from "node:http";
import { AddressInfo } from "node:net";
import {
  beforeAll,
  afterAll,
  describe,
  expect,
  it,
  vi,
  beforeEach,
} from "vitest";
import { errorHandler } from "../middleware/index.js";
import { agentPromptGeneratorRoutes } from "../routes/agent-prompt-generator.js";

const companyId = "22222222-2222-4222-8222-222222222222";

// Ollama-compatible mock streaming server
let mockServer: ReturnType<typeof createServer>;
let mockUrl = "";

beforeAll(async () => {
  mockServer = createServer((req, res) => {
    // Drain the request body before responding (Ollama adapter POSTs JSON).
    req.on("data", () => {});
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write(`data: {"choices":[{"delta":{"content":"draft"}}]}\n\n`);
      res.write(`data: {"choices":[{"delta":{"content":"-template"}}]}\n\n`);
      res.write(`data: [DONE]\n\n`);
      res.end();
    });
  });
  await new Promise<void>((r) => mockServer.listen(0, "127.0.0.1", r));
  const { port } = mockServer.address() as AddressInfo;
  mockUrl = `http://127.0.0.1:${port}`;
});

afterAll(() => {
  mockServer.close();
});

const mockCompanyService = vi.hoisted(() => ({
  getById: vi.fn(),
}));

const mockAgentService = vi.hoisted(() => ({
  list: vi.fn(),
}));

vi.mock("../services/index.js", () => ({
  companyService: () => mockCompanyService,
  agentService: () => mockAgentService,
}));

function createApp(actor: Record<string, unknown>) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = actor;
    next();
  });
  app.use("/api", agentPromptGeneratorRoutes({} as any));
  app.use(errorHandler);
  return app;
}

describe("POST /api/companies/:id/agents/draft-prompt-template", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCompanyService.getById.mockResolvedValue({
      id: companyId,
      name: "Acme",
      description: null,
    });
    mockAgentService.list.mockResolvedValue([]);
  });

  it("streams SSE deltas then done", async () => {
    const app = createApp({
      type: "board",
      userId: "board-user",
      source: "session",
      isInstanceAdmin: true,
      companyIds: [companyId],
    });

    const response = await request(app)
      .post(`/api/companies/${companyId}/agents/draft-prompt-template`)
      .set("Content-Type", "application/json")
      .send({
        adapterType: "ollama_local",
        adapterConfig: { baseUrl: mockUrl, model: "llama3" },
        name: "CTO",
        role: "cto",
        title: "Chief Technology Officer",
      })
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => cb(null, Buffer.concat(chunks).toString("utf8")));
      });

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");
    const body = response.body as string;
    expect(body).toContain('"kind":"delta"');
    expect(body).toContain('"delta":"draft"');
    expect(body).toContain('"delta":"-template"');
    expect(body).toContain('"kind":"done"');
  });

  it("returns 400 for adapter without draftText (process)", async () => {
    const app = createApp({
      type: "board",
      userId: "board-user",
      source: "session",
      isInstanceAdmin: true,
      companyIds: [companyId],
    });

    const response = await request(app)
      .post(`/api/companies/${companyId}/agents/draft-prompt-template`)
      .send({
        adapterType: "process",
        adapterConfig: {},
        name: "X",
        role: "general",
      });
    expect(response.status).toBe(400);
  });

  it("returns 404 when company not found", async () => {
    mockCompanyService.getById.mockResolvedValue(null);
    const app = createApp({
      type: "board",
      userId: "board-user",
      source: "session",
      isInstanceAdmin: true,
      companyIds: [companyId],
    });

    const response = await request(app)
      .post(`/api/companies/${companyId}/agents/draft-prompt-template`)
      .send({
        adapterType: "ollama_local",
        adapterConfig: { baseUrl: mockUrl, model: "llama3" },
        name: "X",
        role: "cto",
      });
    expect(response.status).toBe(404);
  });
});
