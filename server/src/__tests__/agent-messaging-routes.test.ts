import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { agentMessageRoutes } from "../routes/agent-messages.js";
import { errorHandler } from "../middleware/index.js";

const companyId = "22222222-2222-4222-8222-222222222222";
const senderAgentId = "11111111-1111-4111-8111-111111111111";
const recipientAgentId = "33333333-3333-4333-8333-333333333333";
const messageId = "44444444-4444-4444-8444-444444444444";

const mockSend = vi.fn();
const mockListInbox = vi.fn();
const mockListSent = vi.fn();
const mockListThread = vi.fn();
const mockMarkRead = vi.fn();
const mockMarkThreadRead = vi.fn();
const mockCountUnread = vi.fn();
const mockWakeup = vi.fn();

vi.mock("../services/index.js", () => ({
  agentMessagingService: () => ({
    send: mockSend,
    listInbox: mockListInbox,
    listSent: mockListSent,
    listThread: mockListThread,
    markRead: mockMarkRead,
    markThreadRead: mockMarkThreadRead,
    countUnread: mockCountUnread,
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
  app.use("/api", agentMessageRoutes({} as any));
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
  agentId: senderAgentId,
  companyId,
};

describe("agent message routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/companies/:companyId/agents/:agentId/messages", () => {
    it("sends a message as board user", async () => {
      const createdMessage = {
        id: messageId,
        companyId,
        threadId: null,
        senderAgentId,
        recipientAgentId,
        messageType: "direct",
        body: "Hello from CEO",
        payload: {},
        status: "sent",
        readAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      mockSend.mockResolvedValue(createdMessage);

      const app = createApp(boardActor);
      const res = await request(app)
        .post(`/api/companies/${companyId}/agents/${senderAgentId}/messages`)
        .send({
          recipientAgentId,
          body: "Hello from CEO",
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe(messageId);
      expect(mockSend).toHaveBeenCalledWith(
        companyId,
        expect.objectContaining({
          senderAgentId,
          recipientAgentId,
          body: "Hello from CEO",
        }),
        expect.any(Function),
      );
    });

    it("sends a delegation message", async () => {
      const createdMessage = {
        id: messageId,
        companyId,
        threadId: null,
        senderAgentId,
        recipientAgentId,
        messageType: "delegation",
        body: "Hire 3 senior engineers",
        payload: { priority: "high" },
        status: "sent",
        readAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      mockSend.mockResolvedValue(createdMessage);

      const app = createApp(boardActor);
      const res = await request(app)
        .post(`/api/companies/${companyId}/agents/${senderAgentId}/messages`)
        .send({
          recipientAgentId,
          messageType: "delegation",
          body: "Hire 3 senior engineers",
          payload: { priority: "high" },
        });

      expect(res.status).toBe(201);
      expect(res.body.messageType).toBe("delegation");
    });

    it("rejects empty body", async () => {
      const app = createApp(boardActor);
      const res = await request(app)
        .post(`/api/companies/${companyId}/agents/${senderAgentId}/messages`)
        .send({
          recipientAgentId,
          body: "",
        });

      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/companies/:companyId/agents/:agentId/messages/inbox", () => {
    it("lists inbox messages", async () => {
      const messages = [
        { id: messageId, body: "Hello", status: "sent", senderAgentId, recipientAgentId },
      ];
      mockListInbox.mockResolvedValue(messages);

      const app = createApp(boardActor);
      const res = await request(app)
        .get(`/api/companies/${companyId}/agents/${recipientAgentId}/messages/inbox`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(mockListInbox).toHaveBeenCalledWith(companyId, recipientAgentId, expect.any(Object));
    });
  });

  describe("GET /api/companies/:companyId/agents/:agentId/messages/sent", () => {
    it("lists sent messages", async () => {
      mockListSent.mockResolvedValue([]);

      const app = createApp(boardActor);
      const res = await request(app)
        .get(`/api/companies/${companyId}/agents/${senderAgentId}/messages/sent`);

      expect(res.status).toBe(200);
      expect(mockListSent).toHaveBeenCalledWith(companyId, senderAgentId, expect.any(Object));
    });
  });

  describe("GET /api/companies/:companyId/messages/threads/:threadId", () => {
    it("lists thread messages", async () => {
      const threadMessages = [
        { id: messageId, threadId: null, body: "Original" },
        { id: "reply-1", threadId: messageId, body: "Reply" },
      ];
      mockListThread.mockResolvedValue(threadMessages);

      const app = createApp(boardActor);
      const res = await request(app)
        .get(`/api/companies/${companyId}/messages/threads/${messageId}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
    });
  });

  describe("PATCH /api/companies/:companyId/messages/threads/:threadId/read", () => {
    it("marks thread as read for board users", async () => {
      mockMarkThreadRead.mockResolvedValue(2);

      const app = createApp(boardActor);
      const res = await request(app)
        .patch(`/api/companies/${companyId}/messages/threads/${messageId}/read`)
        .query({ agentId: recipientAgentId });

      expect(res.status).toBe(200);
      expect(res.body.updated).toBe(2);
      expect(mockMarkThreadRead).toHaveBeenCalledWith(messageId, recipientAgentId);
    });
  });

  describe("PATCH /api/companies/:companyId/messages/:messageId/read", () => {
    it("marks message as read (agent auth)", async () => {
      const updated = { id: messageId, status: "read", readAt: new Date().toISOString() };
      mockMarkRead.mockResolvedValue(updated);

      const app = createApp(agentActor);
      const res = await request(app)
        .patch(`/api/companies/${companyId}/messages/${messageId}/read`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("read");
      expect(mockMarkRead).toHaveBeenCalledWith(messageId, senderAgentId);
    });

    it("requires agentId query param for board users", async () => {
      const app = createApp(boardActor);
      const res = await request(app)
        .patch(`/api/companies/${companyId}/messages/${messageId}/read`);

      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/companies/:companyId/agents/:agentId/messages/unread-count", () => {
    it("returns unread count", async () => {
      mockCountUnread.mockResolvedValue(5);

      const app = createApp(boardActor);
      const res = await request(app)
        .get(`/api/companies/${companyId}/agents/${recipientAgentId}/messages/unread-count`);

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(5);
    });
  });
});
