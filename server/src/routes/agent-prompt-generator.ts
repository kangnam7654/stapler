import { Router } from "express";
import {
  draftPromptTemplateRequestSchema,
  type AgentRole,
} from "@paperclipai/shared";
import type { Db } from "@paperclipai/db";
import { validate } from "../middleware/validate.js";
import { assertCompanyAccess } from "./authz.js";
import { getServerAdapter } from "../adapters/registry.js";
import { buildMetaPrompt } from "../services/prompt-template-generator.js";
import { companyService, agentService } from "../services/index.js";

export function agentPromptGeneratorRoutes(db: Db): Router {
  const router = Router();
  const companiesSvc = companyService(db);
  const agentsSvc = agentService(db);

  router.post(
    "/companies/:companyId/agents/draft-prompt-template",
    validate(draftPromptTemplateRequestSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);

      const body = req.body as {
        adapterType: string;
        adapterConfig: Record<string, unknown>;
        name: string;
        role: AgentRole;
        title?: string | null;
        reportsTo?: string | null;
        hint?: string;
      };

      const adapter = getServerAdapter(body.adapterType);
      if (!adapter.draftText) {
        res.status(400).json({
          error: `adapter ${body.adapterType} does not support draft generation`,
        });
        return;
      }

      const company = await companiesSvc.getById(companyId);
      if (!company) {
        res.status(404).json({ error: "company not found" });
        return;
      }

      const otherAgents = await agentsSvc.list(companyId);
      const reportsToAgent = body.reportsTo
        ? otherAgents.find((a) => a.id === body.reportsTo) ?? null
        : null;

      const messages = buildMetaPrompt({
        agentName: body.name,
        agentRole: body.role,
        agentTitle: body.title ?? null,
        company: {
          name: company.name,
          description: company.description ?? null,
        },
        otherAgents: otherAgents
          .filter((a) => a.id !== body.reportsTo)
          .map((a) => ({ name: a.name, role: a.role, title: a.title })),
        reportsTo: reportsToAgent
          ? {
              name: reportsToAgent.name,
              role: reportsToAgent.role,
              title: reportsToAgent.title,
            }
          : null,
        userHint: body.hint ?? null,
      });

      res.status(200);
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      const controller = new AbortController();
      req.on("close", () => controller.abort());

      const writeEvent = (payload: unknown) => {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      };

      try {
        for await (const delta of adapter.draftText({
          config: body.adapterConfig,
          messages,
          signal: controller.signal,
        })) {
          writeEvent({ kind: "delta", delta });
        }
        writeEvent({ kind: "done" });
      } catch (err) {
        const message = err instanceof Error ? err.message : "generation failed";
        writeEvent({ kind: "error", message });
      } finally {
        res.end();
      }
    },
  );

  return router;
}
