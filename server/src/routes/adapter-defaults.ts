import { Router } from "express";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { unprocessable } from "../errors.js";
import { logActivity } from "../services/activity-log.js";
import { adapterDefaultsService } from "../services/adapter-defaults.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";

// Accepts any provider-specific fields (model, temperature, env, etc.).
// Provider-level field semantics are the adapter's concern; the route only
// enforces that the body is a plain object (not an array or scalar).
// Secret handling (apiKey → secret_ref) happens in the service layer.
const adapterEndpointPayloadSchema = z.record(z.string(), z.unknown());

function parseEndpointPayload(body: unknown): Record<string, unknown> {
  const result = adapterEndpointPayloadSchema.safeParse(body);
  if (!result.success) {
    throw unprocessable("Invalid adapter endpoint payload", result.error.flatten().fieldErrors);
  }
  return result.data as Record<string, unknown>;
}

export function adapterDefaultsRoutes(db: Db) {
  const router = Router({ mergeParams: true });
  const svc = adapterDefaultsService(db);

  // GET /api/companies/:companyId/adapter-defaults
  router.get("/", async (req, res) => {
    const companyId = (req.params as Record<string, string>).companyId;
    assertBoard(req);
    assertCompanyAccess(req, companyId);

    const defaults = await svc.getAll(companyId);
    res.json(defaults);
  });

  // GET /api/companies/:companyId/adapter-defaults/:providerId
  router.get("/:providerId", async (req, res) => {
    const { companyId, providerId } = req.params as Record<string, string>;
    assertBoard(req);
    assertCompanyAccess(req, companyId);

    const entry = await svc.getOne(companyId, providerId);
    if (entry === null) {
      res.status(404).json({ error: `No adapter defaults set for provider: ${providerId}` });
      return;
    }
    res.json(entry);
  });

  // PUT /api/companies/:companyId/adapter-defaults/:providerId
  router.put("/:providerId", async (req, res) => {
    const { companyId, providerId } = req.params as Record<string, string>;
    assertBoard(req);
    assertCompanyAccess(req, companyId);

    const payload = parseEndpointPayload(req.body);
    const { updated, affectedAgentCount, changedFields } = await svc.putOne(
      companyId,
      providerId,
      payload,
    );

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "company.adapter_defaults.updated",
      entityType: "company",
      entityId: companyId,
      details: { providerId, changedFields, affectedAgentCount, operation: "put" },
    });

    res.json(updated);
  });

  // PATCH /api/companies/:companyId/adapter-defaults/:providerId
  router.patch("/:providerId", async (req, res) => {
    const { companyId, providerId } = req.params as Record<string, string>;
    assertBoard(req);
    assertCompanyAccess(req, companyId);

    const payload = parseEndpointPayload(req.body);
    const { merged, affectedAgentCount, changedFields } = await svc.patchOne(
      companyId,
      providerId,
      payload,
    );

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "company.adapter_defaults.updated",
      entityType: "company",
      entityId: companyId,
      details: { providerId, changedFields, affectedAgentCount, operation: "patch" },
    });

    res.json(merged);
  });

  // DELETE /api/companies/:companyId/adapter-defaults/:providerId
  router.delete("/:providerId", async (req, res) => {
    const { companyId, providerId } = req.params as Record<string, string>;
    assertBoard(req);
    assertCompanyAccess(req, companyId);

    const { affectedAgentCount } = await svc.deleteOne(companyId, providerId);

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "company.adapter_defaults.updated",
      entityType: "company",
      entityId: companyId,
      details: { providerId, affectedAgentCount, operation: "delete" },
    });

    res.status(204).end();
  });

  return router;
}
