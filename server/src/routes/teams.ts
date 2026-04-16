import { Router } from "express";
import type { Db } from "@paperclipai/db";
import {
  createTeamSchema,
  updateAgentTeamMembershipSchema,
  updateTeamSchema,
  upsertAgentTeamMembershipSchema,
} from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { teamService } from "../services/teams.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";

export function teamRoutes(db: Db) {
  const router = Router();
  const teams = teamService(db);

  router.get("/companies/:companyId/teams", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    res.json(await teams.list(companyId));
  });

  router.post("/companies/:companyId/teams", validate(createTeamSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    assertBoard(req);
    res.status(201).json(await teams.create(companyId, req.body, getActorInfo(req)));
  });

  router.patch("/companies/:companyId/teams/:teamId", validate(updateTeamSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    assertBoard(req);
    res.json(await teams.update(companyId, req.params.teamId as string, req.body, getActorInfo(req)));
  });

  router.post(
    "/companies/:companyId/teams/:teamId/memberships",
    validate(upsertAgentTeamMembershipSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      assertBoard(req);
      res.status(201).json(await teams.upsertMembership(companyId, req.params.teamId as string, req.body, getActorInfo(req)));
    },
  );

  router.patch(
    "/companies/:companyId/teams/:teamId/memberships/:membershipId",
    validate(updateAgentTeamMembershipSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      assertBoard(req);
      res.json(await teams.updateMembership(
        companyId,
        req.params.teamId as string,
        req.params.membershipId as string,
        req.body,
        getActorInfo(req),
      ));
    },
  );

  router.delete("/companies/:companyId/teams/:teamId/memberships/:membershipId", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    assertBoard(req);
    res.json(await teams.removeMembership(
      companyId,
      req.params.teamId as string,
      req.params.membershipId as string,
      getActorInfo(req),
    ));
  });

  return router;
}
