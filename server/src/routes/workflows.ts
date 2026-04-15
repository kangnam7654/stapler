import { Router } from "express";
import type { Db } from "@paperclipai/db";
import {
  createWorkflowArtifactSchema,
  createWorkflowCaseSchema,
  createWorkflowRouteRuleSchema,
  resolveWorkflowCaseSchema,
  submitWorkflowReviewSchema,
  updateWorkflowCaseSchema,
  updateWorkflowRouteRuleSchema,
} from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";
import { workflowService } from "../services/index.js";

export function workflowRoutes(db: Db) {
  const router = Router();
  const workflows = workflowService(db);

  router.get("/companies/:companyId/workflow-cases", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const cases = await workflows.listCases(companyId, {
      status: req.query.status as string | undefined,
      category: req.query.category as string | undefined,
      kind: req.query.kind as string | undefined,
      requestedByAgentId: req.query.requestedByAgentId as string | undefined,
      linkedIssueId: req.query.linkedIssueId as string | undefined,
      linkedApprovalId: req.query.linkedApprovalId as string | undefined,
    });
    res.json(cases);
  });

  router.post("/companies/:companyId/workflow-cases", validate(createWorkflowCaseSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const actor = getActorInfo(req);
    const workflowCase = await workflows.createCase(companyId, req.body, actor);
    res.status(201).json(workflowCase);
  });

  router.get("/companies/:companyId/workflow-cases/:caseId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const caseId = req.params.caseId as string;
    assertCompanyAccess(req, companyId);
    const workflowCase = await workflows.getCompanyCase(companyId, caseId);
    const [artifacts, reviews] = await Promise.all([
      workflows.listArtifacts(caseId),
      workflows.listReviews(caseId),
    ]);
    res.json({ workflowCase, artifacts, reviews });
  });

  router.patch("/workflow-cases/:caseId", validate(updateWorkflowCaseSchema), async (req, res) => {
    const workflowCase = await workflows.getCase(req.params.caseId as string);
    assertCompanyAccess(req, workflowCase.companyId);
    const actor = getActorInfo(req);
    const updated = await workflows.updateCase(workflowCase.id, req.body, actor);
    res.json(updated);
  });

  router.get("/workflow-cases/:caseId/artifacts", async (req, res) => {
    const workflowCase = await workflows.getCase(req.params.caseId as string);
    assertCompanyAccess(req, workflowCase.companyId);
    res.json(await workflows.listArtifacts(workflowCase.id));
  });

  router.post(
    "/workflow-cases/:caseId/artifacts",
    validate(createWorkflowArtifactSchema),
    async (req, res) => {
      const workflowCase = await workflows.getCase(req.params.caseId as string);
      assertCompanyAccess(req, workflowCase.companyId);
      const actor = getActorInfo(req);
      const artifact = await workflows.createArtifact(workflowCase.id, req.body, actor);
      res.status(201).json(artifact);
    },
  );

  router.get("/workflow-cases/:caseId/reviews", async (req, res) => {
    const workflowCase = await workflows.getCase(req.params.caseId as string);
    assertCompanyAccess(req, workflowCase.companyId);
    res.json(await workflows.listReviews(workflowCase.id));
  });

  router.post(
    "/workflow-cases/:caseId/reviews",
    validate(submitWorkflowReviewSchema),
    async (req, res) => {
      const workflowCase = await workflows.getCase(req.params.caseId as string);
      assertCompanyAccess(req, workflowCase.companyId);
      const actor = getActorInfo(req);
      const review = await workflows.submitReview(workflowCase.id, req.body, actor);
      res.status(201).json(review);
    },
  );

  router.post("/workflow-cases/:caseId/approve", validate(resolveWorkflowCaseSchema), async (req, res) => {
    assertBoard(req);
    const workflowCase = await workflows.getCase(req.params.caseId as string);
    assertCompanyAccess(req, workflowCase.companyId);
    const actor = getActorInfo(req);
    const result = await workflows.approve(workflowCase.id, req.body, actor);
    res.json(result);
  });

  router.post("/workflow-cases/:caseId/reject", validate(resolveWorkflowCaseSchema), async (req, res) => {
    assertBoard(req);
    const workflowCase = await workflows.getCase(req.params.caseId as string);
    assertCompanyAccess(req, workflowCase.companyId);
    const actor = getActorInfo(req);
    const result = await workflows.reject(workflowCase.id, req.body, actor);
    res.json(result);
  });

  router.get("/companies/:companyId/workflow-route-rules", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    res.json(await workflows.listRouteRules(companyId));
  });

  router.post("/companies/:companyId/workflow-route-rules", validate(createWorkflowRouteRuleSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertBoard(req);
    assertCompanyAccess(req, companyId);
    const actor = getActorInfo(req);
    const rule = await workflows.upsertRouteRule(companyId, req.body, actor);
    res.status(201).json(rule);
  });

  router.patch("/workflow-route-rules/:ruleId", validate(updateWorkflowRouteRuleSchema), async (req, res) => {
    assertBoard(req);
    const actor = getActorInfo(req);
    const rule = await workflows.updateRouteRule(req.params.ruleId as string, req.body, actor);
    res.json(rule);
  });

  return router;
}
