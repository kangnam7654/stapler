import { Router } from "express";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { validate } from "../middleware/validate.js";
import { bulkApplyService } from "../services/bulk-apply.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";

// ─── Request schemas ──────────────────────────────────────────────────────────

const bulkApplyInheritSchema = z.object({
  mode: z.literal("inherit"),
  agentIds: z.array(z.string().uuid()).min(1),
  fields: z.array(z.string().min(1)).min(1),
});

const bulkApplyOverrideSchema = z.object({
  mode: z.literal("override"),
  agentIds: z.array(z.string().uuid()).min(1),
  fields: z.record(z.unknown()),
});

const bulkApplySwapAdapterSchema = z.object({
  mode: z.literal("swap-adapter"),
  agentIds: z.array(z.string().uuid()).min(1),
  newAdapterType: z.string().min(1),
  newAdapterConfig: z.record(z.unknown()),
});

const bulkApplySchema = z.discriminatedUnion("mode", [
  bulkApplyInheritSchema,
  bulkApplyOverrideSchema,
  bulkApplySwapAdapterSchema,
]);

// ─── Router factory ───────────────────────────────────────────────────────────

export function bulkApplyRoutes(db: Db) {
  const router = Router();
  const svc = bulkApplyService(db);

  /**
   * POST /api/companies/:companyId/agents/bulk-apply
   *
   * Board-only. Applies a config change to multiple agents at once.
   * Three modes:
   *   - inherit: strip named fields so agents inherit from company defaults
   *   - override: set named fields on each agent's adapterConfig
   *   - swap-adapter: replace adapterType + adapterConfig wholesale
   *
   * All updates run in a single Drizzle transaction — all or nothing.
   */
  router.post(
    "/companies/:companyId/agents/bulk-apply",
    validate(bulkApplySchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertBoard(req);
      assertCompanyAccess(req, companyId);

      const actor = getActorInfo(req);
      const result = await svc.apply(
        companyId,
        req.body,
        actor.actorType,
        actor.actorId,
        actor.agentId,
        actor.runId,
      );

      res.status(200).json({ data: result });
    },
  );

  return router;
}
