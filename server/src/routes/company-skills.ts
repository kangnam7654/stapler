import { Router, type Request } from "express";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Db } from "@paperclipai/db";
import type { CompanySkillListItem } from "@paperclipai/shared";
import {
  companySkillCreateSchema,
  companySkillFileUpdateSchema,
  companySkillImportSchema,
  companySkillProjectScanRequestSchema,
} from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { accessService, agentService, companySkillService, logActivity } from "../services/index.js";
import { forbidden } from "../errors.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";
import { t } from "../i18n/index.js";
import type { CompanySkillDetail } from "@paperclipai/shared";
import { instanceSkillsCache, type InstanceSkill } from "../services/instance-skills-cache.js";

function toCompanySkillListItem(s: InstanceSkill, companyId: string): CompanySkillListItem {
  return {
    id: s.id,
    companyId,
    key: s.key,
    slug: s.slug,
    name: s.name,
    description: s.description,
    sourceType: s.sourceType,
    sourceLocator: s.diskPath,
    sourceRef: null,
    sourcePath: null,
    trustLevel: "markdown_only",
    compatibility: "compatible",
    fileInventory: s.fileInventory,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    attachedAgentCount: 0,
    editable: false,
    editableReason: "Claude Code 디스크 스킬은 편집할 수 없습니다",
    sourceLabel: s.sourceLabel,
    sourceBadge: s.sourceType,
  };
}

function inferInstanceSkillLanguage(basename: string): string | null {
  if (basename.endsWith(".md")) return "markdown";
  if (basename.endsWith(".html") || basename.endsWith(".htm")) return "html";
  if (basename.endsWith(".ts")) return "typescript";
  if (basename.endsWith(".tsx")) return "tsx";
  if (basename.endsWith(".js") || basename.endsWith(".mjs")) return "javascript";
  if (basename.endsWith(".jsx")) return "jsx";
  if (basename.endsWith(".json")) return "json";
  if (basename.endsWith(".yml") || basename.endsWith(".yaml")) return "yaml";
  if (basename.endsWith(".sh")) return "bash";
  if (basename.endsWith(".py")) return "python";
  if (basename.endsWith(".css")) return "css";
  return null;
}

function toCompanySkillDetail(s: InstanceSkill, companyId: string): CompanySkillDetail {
  return {
    id: s.id,
    companyId,
    key: s.key,
    slug: s.slug,
    name: s.name,
    description: s.description,
    markdown: s.markdown,
    sourceType: s.sourceType,
    sourceLocator: s.diskPath,
    sourceRef: null,
    sourcePath: null,
    trustLevel: "markdown_only",
    compatibility: "compatible",
    fileInventory: s.fileInventory,
    metadata: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    attachedAgentCount: 0,
    usedByAgents: [],
    editable: false,
    editableReason: "Claude Code 디스크 스킬은 편집할 수 없습니다",
    sourceLabel: s.sourceLabel,
    sourceBadge: s.sourceType,
  };
}

export function companySkillRoutes(db: Db) {
  const router = Router();
  const agents = agentService(db);
  const access = accessService(db);
  const svc = companySkillService(db);

  function canCreateAgents(agent: { permissions: Record<string, unknown> | null | undefined }) {
    if (!agent.permissions || typeof agent.permissions !== "object") return false;
    return Boolean((agent.permissions as Record<string, unknown>).canCreateAgents);
  }

  async function assertCanMutateCompanySkills(req: Request, companyId: string) {
    assertCompanyAccess(req, companyId);

    if (req.actor.type === "board") {
      if (req.actor.source === "local_implicit" || req.actor.isInstanceAdmin) return;
      const allowed = await access.canUser(companyId, req.actor.userId, "agents:create");
      if (!allowed) {
        throw forbidden(t("error.missingPermission", { permission: "agents:create" }));
      }
      return;
    }

    if (!req.actor.agentId) {
      throw forbidden(t("error.agentAuthRequired"));
    }

    const actorAgent = await agents.getById(req.actor.agentId);
    if (!actorAgent || actorAgent.companyId !== companyId) {
      throw forbidden(t("error.agentKeyCannotAccessCompany"));
    }

    const allowedByGrant = await access.hasPermission(companyId, "agent", actorAgent.id, "agents:create");
    if (allowedByGrant || canCreateAgents(actorAgent)) {
      return;
    }

    throw forbidden(t("error.missingPermission", { permission: "can create agents" }));
  }

  router.get("/companies/:companyId/skills", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const dbSkills = await svc.list(companyId);
    const dbKeys = new Set(dbSkills.map((s) => s.key));
    const instanceItems = instanceSkillsCache
      .getAll()
      .filter((s) => !dbKeys.has(s.key))
      .map((s) => toCompanySkillListItem(s, companyId));
    res.json([...dbSkills, ...instanceItems]);
  });

  router.get("/companies/:companyId/skills/:skillId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const skillId = req.params.skillId as string;
    assertCompanyAccess(req, companyId);

    const instanceSkill = instanceSkillsCache.getById(skillId);
    if (instanceSkill) {
      res.json(toCompanySkillDetail(instanceSkill, companyId));
      return;
    }

    const result = await svc.detail(companyId, skillId);
    if (!result) {
      res.status(404).json({ error: t("error.skillNotFound") });
      return;
    }
    res.json(result);
  });

  router.get("/companies/:companyId/skills/:skillId/update-status", async (req, res) => {
    const companyId = req.params.companyId as string;
    const skillId = req.params.skillId as string;
    assertCompanyAccess(req, companyId);
    const result = await svc.updateStatus(companyId, skillId);
    if (!result) {
      res.status(404).json({ error: t("error.skillNotFound") });
      return;
    }
    res.json(result);
  });

  router.get("/companies/:companyId/skills/:skillId/files", async (req, res) => {
    const companyId = req.params.companyId as string;
    const skillId = req.params.skillId as string;
    const relativePath = String(req.query.path ?? "SKILL.md");
    assertCompanyAccess(req, companyId);

    // Instance skill: serve from disk, any file within the skill directory
    const instanceSkill = instanceSkillsCache.getById(skillId);
    if (instanceSkill) {
      const skillDir = instanceSkill.diskDir;
      const resolved = path.resolve(skillDir, relativePath);
      // Path traversal protection: resolved path must stay within skillDir
      if (!resolved.startsWith(skillDir + path.sep) && resolved !== path.join(skillDir, "SKILL.md")) {
        res.status(400).json({ error: t("error.invalidPath") });
        return;
      }
      let content: string;
      try {
        content = await fs.readFile(resolved, "utf-8");
      } catch {
        res.status(404).json({ error: t("error.skillNotFound") });
        return;
      }
      const basename = path.posix.basename(relativePath).toLowerCase();
      const isMarkdown = basename === "skill.md" || basename.endsWith(".md");
      const language = inferInstanceSkillLanguage(basename);
      const fileEntry = instanceSkill.fileInventory.find((e) => e.path === relativePath);
      res.json({
        skillId,
        path: relativePath,
        kind: fileEntry?.kind ?? "reference",
        content,
        language,
        markdown: isMarkdown,
        editable: false,
      });
      return;
    }

    const result = await svc.readFile(companyId, skillId, relativePath);
    if (!result) {
      res.status(404).json({ error: t("error.skillNotFound") });
      return;
    }
    res.json(result);
  });

  router.post(
    "/companies/:companyId/skills",
    validate(companySkillCreateSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      await assertCanMutateCompanySkills(req, companyId);
      const result = await svc.createLocalSkill(companyId, req.body);

      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "company.skill_created",
        entityType: "company_skill",
        entityId: result.id,
        details: {
          slug: result.slug,
          name: result.name,
        },
      });

      res.status(201).json(result);
    },
  );

  router.patch(
    "/companies/:companyId/skills/:skillId/files",
    validate(companySkillFileUpdateSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const skillId = req.params.skillId as string;
      await assertCanMutateCompanySkills(req, companyId);
      const result = await svc.updateFile(
        companyId,
        skillId,
        String(req.body.path ?? ""),
        String(req.body.content ?? ""),
      );

      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "company.skill_file_updated",
        entityType: "company_skill",
        entityId: skillId,
        details: {
          path: result.path,
          markdown: result.markdown,
        },
      });

      res.json(result);
    },
  );

  router.post(
    "/companies/:companyId/skills/import",
    validate(companySkillImportSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      await assertCanMutateCompanySkills(req, companyId);
      const source = String(req.body.source ?? "");
      const result = await svc.importFromSource(companyId, source);

      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "company.skills_imported",
        entityType: "company",
        entityId: companyId,
        details: {
          source,
          importedCount: result.imported.length,
          importedSlugs: result.imported.map((skill) => skill.slug),
          warningCount: result.warnings.length,
        },
      });

      res.status(201).json(result);
    },
  );

  router.post(
    "/companies/:companyId/skills/scan-projects",
    validate(companySkillProjectScanRequestSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      await assertCanMutateCompanySkills(req, companyId);
      const result = await svc.scanProjectWorkspaces(companyId, req.body);

      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "company.skills_scanned",
        entityType: "company",
        entityId: companyId,
        details: {
          scannedProjects: result.scannedProjects,
          scannedWorkspaces: result.scannedWorkspaces,
          discovered: result.discovered,
          importedCount: result.imported.length,
          updatedCount: result.updated.length,
          conflictCount: result.conflicts.length,
          warningCount: result.warnings.length,
        },
      });

      res.json(result);
    },
  );

  router.delete("/companies/:companyId/skills/:skillId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const skillId = req.params.skillId as string;
    await assertCanMutateCompanySkills(req, companyId);
    const result = await svc.deleteSkill(companyId, skillId);
    if (!result) {
      res.status(404).json({ error: t("error.skillNotFound") });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "company.skill_deleted",
      entityType: "company_skill",
      entityId: result.id,
      details: {
        slug: result.slug,
        name: result.name,
      },
    });

    res.json(result);
  });

  router.post("/companies/:companyId/skills/:skillId/install-update", async (req, res) => {
    const companyId = req.params.companyId as string;
    const skillId = req.params.skillId as string;
    await assertCanMutateCompanySkills(req, companyId);
    const result = await svc.installUpdate(companyId, skillId);
    if (!result) {
      res.status(404).json({ error: t("error.skillNotFound") });
      return;
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "company.skill_update_installed",
      entityType: "company_skill",
      entityId: result.id,
      details: {
        slug: result.slug,
        sourceRef: result.sourceRef,
      },
    });

    res.json(result);
  });

  return router;
}
