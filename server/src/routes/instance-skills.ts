import { Router } from "express";
import { instanceSkillsCache } from "../services/instance-skills-cache.js";
import { forbidden } from "../errors.js";
import { t } from "../i18n/index.js";

export function instanceSkillRoutes() {
  const router = Router();

  router.post("/instance/skills/refresh", async (req, res) => {
    if (req.actor.type !== "board") {
      throw forbidden(t("error.boardAccessRequired"));
    }
    const result = await instanceSkillsCache.scan();
    res.json(result);
  });

  return router;
}
