import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { sendAgentMessageSchema } from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { assertBoard, assertCompanyAccess } from "./authz.js";
import { agentMessagingService, heartbeatService } from "../services/index.js";

export function agentMessageRoutes(db: Db) {
  const router = Router();
  const messaging = agentMessagingService(db);
  const heartbeat = heartbeatService(db);

  // Only delegation messages wake the recipient immediately.
  // Other types (direct, request, report) are picked up on the next scheduled heartbeat,
  // saving token costs by avoiding unnecessary wake cycles.
  async function wakeRecipient(agentId: string, messageId: string, senderAgentId: string, messageType: string) {
    if (messageType !== "delegation") return;
    await heartbeat.wakeup(agentId, {
      source: "on_demand",
      triggerDetail: "callback",
      reason: "message_received",
      payload: { messageId, senderAgentId, messageType },
      requestedByActorType: "agent",
      requestedByActorId: senderAgentId,
    });
  }

  // POST /api/companies/:companyId/agents/:agentId/messages — send a message
  router.post(
    "/companies/:companyId/agents/:agentId/messages",
    validate(sendAgentMessageSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const agentId = req.params.agentId as string;
      assertCompanyAccess(req, companyId);

      let senderAgentId: string;
      if (req.actor.type === "agent") {
        senderAgentId = req.actor.agentId!;
      } else {
        senderAgentId = agentId;
      }

      const message = await messaging.send(
        companyId,
        {
          senderAgentId,
          recipientAgentId: req.body.recipientAgentId,
          messageType: req.body.messageType,
          body: req.body.body,
          payload: req.body.payload,
          threadId: req.body.threadId,
        },
        wakeRecipient,
      );

      res.status(201).json(message);
    },
  );

  // GET /api/companies/:companyId/agents/:agentId/messages/inbox
  router.get("/companies/:companyId/agents/:agentId/messages/inbox", async (req, res) => {
    const companyId = req.params.companyId as string;
    const agentId = req.params.agentId as string;
    assertCompanyAccess(req, companyId);

    const messages = await messaging.listInbox(companyId, agentId, {
      status: req.query.status as string | undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      cursor: req.query.cursor as string | undefined,
    });

    res.json(messages);
  });

  // GET /api/companies/:companyId/agents/:agentId/messages/sent
  router.get("/companies/:companyId/agents/:agentId/messages/sent", async (req, res) => {
    const companyId = req.params.companyId as string;
    const agentId = req.params.agentId as string;
    assertCompanyAccess(req, companyId);

    const messages = await messaging.listSent(companyId, agentId, {
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      cursor: req.query.cursor as string | undefined,
    });

    res.json(messages);
  });

  // GET /api/companies/:companyId/messages/threads/:threadId
  router.get("/companies/:companyId/messages/threads/:threadId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const threadId = req.params.threadId as string;
    assertCompanyAccess(req, companyId);

    const messages = await messaging.listThread(threadId);
    res.json(messages);
  });

  // PATCH /api/companies/:companyId/messages/:messageId/read
  router.patch("/companies/:companyId/messages/:messageId/read", async (req, res) => {
    const companyId = req.params.companyId as string;
    const messageId = req.params.messageId as string;
    assertCompanyAccess(req, companyId);

    let agentId: string;
    if (req.actor.type === "agent") {
      agentId = req.actor.agentId!;
    } else {
      agentId = req.query.agentId as string;
      if (!agentId) {
        res.status(400).json({ error: "agentId query parameter required for board users" });
        return;
      }
    }

    const updated = await messaging.markRead(messageId, agentId);
    res.json(updated);
  });

  // GET /api/companies/:companyId/messages/timeline — Board-only company-wide message timeline
  router.get("/companies/:companyId/messages/timeline", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertBoard(req);
    assertCompanyAccess(req, companyId);

    const messages = await messaging.listCompanyTimeline(companyId, {
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      cursor: req.query.cursor as string | undefined,
      messageType: req.query.messageType as string | undefined,
    });

    res.json(messages);
  });

  // GET /api/companies/:companyId/agents/:agentId/messages/unread-count
  router.get("/companies/:companyId/agents/:agentId/messages/unread-count", async (req, res) => {
    const companyId = req.params.companyId as string;
    const agentId = req.params.agentId as string;
    assertCompanyAccess(req, companyId);

    const count = await messaging.countUnread(companyId, agentId);
    res.json({ count });
  });

  return router;
}
