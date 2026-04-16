import { Router, type Request } from "express";
import type { Db } from "@paperclipai/db";
import {
  createAgentDelegationSchema,
  reportAgentDelegationSchema,
  updateAgentDelegationSchema,
  type AgentDelegation,
} from "@paperclipai/shared";
import { forbidden } from "../errors.js";
import { validate } from "../middleware/validate.js";
import { agentDelegationService, heartbeatService } from "../services/index.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";

function isAgentParticipant(req: Request, delegation: AgentDelegation) {
  if (req.actor.type !== "agent") return true;
  return req.actor.agentId === delegation.delegatorAgentId || req.actor.agentId === delegation.delegateAgentId;
}

function assertCanClaimOrReport(req: Request, delegation: AgentDelegation) {
  if (req.actor.type !== "agent") return;
  if (req.actor.agentId !== delegation.delegateAgentId) {
    throw forbidden("Only the delegate can claim or report this delegation");
  }
}

function assertCanUpdate(req: Request, delegation: AgentDelegation) {
  if (isAgentParticipant(req, delegation)) return;
  throw forbidden("Only delegation participants can update this delegation");
}

function assertCanCancel(req: Request, delegation: AgentDelegation) {
  if (req.actor.type !== "agent") return;
  if (req.actor.agentId !== delegation.delegatorAgentId) {
    throw forbidden("Only the delegator can cancel this delegation");
  }
}

function delegationWakeContext(delegation: AgentDelegation, reason: string) {
  return {
    delegationId: delegation.id,
    parentDelegationId: delegation.parentDelegationId,
    rootIssueId: delegation.rootIssueId,
    linkedIssueId: delegation.linkedIssueId,
    wakeReason: reason,
    source: "agent.delegation",
  };
}

export function agentDelegationRoutes(db: Db) {
  const router = Router();
  const delegations = agentDelegationService(db);
  const heartbeat = heartbeatService(db);

  async function wakeAgentForDelegation(agentId: string, delegation: AgentDelegation, reason: string, req: Request) {
    await heartbeat.wakeup(agentId, {
      source: "assignment",
      triggerDetail: "system",
      reason,
      payload: delegationWakeContext(delegation, reason),
      contextSnapshot: delegationWakeContext(delegation, reason),
      requestedByActorType: req.actor.type === "agent" ? "agent" : "user",
      requestedByActorId: req.actor.type === "agent" ? req.actor.agentId ?? null : req.actor.userId ?? null,
    });
  }

  router.get("/companies/:companyId/delegations", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const statuses = typeof req.query.statuses === "string"
      ? req.query.statuses.split(",").map((value) => value.trim()).filter(Boolean)
      : undefined;
    const rows = await delegations.listDelegations(companyId, {
      status: req.query.status as string | undefined,
      statuses,
      delegatorAgentId: req.query.delegatorAgentId as string | undefined,
      delegateAgentId: req.query.delegateAgentId as string | undefined,
      parentDelegationId: req.query.parentDelegationId as string | undefined,
      rootIssueId: req.query.rootIssueId as string | undefined,
      linkedIssueId: req.query.linkedIssueId as string | undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.json(rows);
  });

  router.post("/companies/:companyId/delegations", validate(createAgentDelegationSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const actor = getActorInfo(req);
    const created = await delegations.create(companyId, req.body, actor);
    const withMessage = req.body.createMessage === false ? created : await delegations.createSourceMessage(created.id);

    void wakeAgentForDelegation(withMessage.delegateAgentId, withMessage, "delegation_assigned", req).catch(() => {});
    res.status(201).json(withMessage);
  });

  router.get("/companies/:companyId/delegations/:delegationId", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const delegation = await delegations.getCompanyDelegation(companyId, req.params.delegationId as string);
    res.json(delegation);
  });

  router.get("/delegations/:delegationId", async (req, res) => {
    const delegation = await delegations.getDelegation(req.params.delegationId as string);
    assertCompanyAccess(req, delegation.companyId);
    res.json(delegation);
  });

  router.patch("/delegations/:delegationId", validate(updateAgentDelegationSchema), async (req, res) => {
    const current = await delegations.getDelegation(req.params.delegationId as string);
    assertCompanyAccess(req, current.companyId);
    assertCanUpdate(req, current);
    const updated = await delegations.update(current.id, req.body, getActorInfo(req));
    res.json(updated);
  });

  router.post("/delegations/:delegationId/claim", async (req, res) => {
    const current = await delegations.getDelegation(req.params.delegationId as string);
    assertCompanyAccess(req, current.companyId);
    assertCanClaimOrReport(req, current);
    const updated = await delegations.claim(current.id, getActorInfo(req));
    res.json(updated);
  });

  router.post("/delegations/:delegationId/report", validate(reportAgentDelegationSchema), async (req, res) => {
    const current = await delegations.getDelegation(req.params.delegationId as string);
    assertCompanyAccess(req, current.companyId);
    assertCanClaimOrReport(req, current);
    const updated = await delegations.report(current.id, req.body, getActorInfo(req));
    const withMessage = await delegations.createReportMessage(updated.id);
    void wakeAgentForDelegation(withMessage.delegatorAgentId, withMessage, "delegation_reported", req).catch(() => {});
    res.json(withMessage);
  });

  router.post("/delegations/:delegationId/cancel", async (req, res) => {
    const current = await delegations.getDelegation(req.params.delegationId as string);
    assertCompanyAccess(req, current.companyId);
    assertCanCancel(req, current);
    const updated = await delegations.cancel(current.id, getActorInfo(req));
    res.json(updated);
  });

  return router;
}
