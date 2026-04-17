import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, activityLog } from "@paperclipai/db";
import { randomUUID } from "node:crypto";
import { conflict, notFound } from "../errors.js";
import { t } from "../i18n/index.js";
import { logger } from "../middleware/logger.js";
import { secretService } from "./secrets.js";
import { instanceSettingsService } from "./instance-settings.js";
import { redactCurrentUserValue } from "../log-redaction.js";
import { sanitizeRecord } from "../redaction.js";
import { publishLiveEvent } from "./live-events.js";

export type BulkApplyMode = "inherit" | "override" | "swap-adapter";

export interface BulkApplyInheritInput {
  mode: "inherit";
  agentIds: string[];
  fields: string[];
}

export interface BulkApplyOverrideInput {
  mode: "override";
  agentIds: string[];
  fields: Record<string, unknown>;
}

export interface BulkApplySwapAdapterInput {
  mode: "swap-adapter";
  agentIds: string[];
  newAdapterType: string;
  newAdapterConfig: Record<string, unknown>;
}

export type BulkApplyInput =
  | BulkApplyInheritInput
  | BulkApplyOverrideInput
  | BulkApplySwapAdapterInput;

export interface BulkApplyResult {
  updatedAgentIds: string[];
  mode: BulkApplyMode;
}

export function bulkApplyService(db: Db) {
  const secretsSvc = secretService(db);
  const instanceSettings = instanceSettingsService(db);
  const strictSecretsMode = process.env.PAPERCLIP_SECRETS_STRICT_MODE === "true";

  /**
   * Validates that all agentIds belong to companyId.
   * Throws 409 if any agent is outside the company.
   * Throws 404 if any agent doesn't exist.
   * Returns the agent rows for further processing.
   */
  async function fetchAndValidateAgents(companyId: string, agentIds: string[]) {
    if (agentIds.length === 0) {
      throw conflict(t("error.bulkApplyEmptyAgentIds"));
    }

    const rows = await db
      .select()
      .from(agents)
      .where(inArray(agents.id, agentIds));

    const foundIds = new Set(rows.map((r) => r.id));
    for (const id of agentIds) {
      if (!foundIds.has(id)) {
        throw notFound(t("error.agentNotFound"));
      }
    }

    const crossCompany = rows.filter((r) => r.companyId !== companyId);
    if (crossCompany.length > 0) {
      throw conflict(t("error.bulkApplyCrossCompanyAgent"));
    }

    return rows;
  }

  async function logBulkApplyActivity(
    companyId: string,
    actorType: "agent" | "user" | "system",
    actorId: string,
    agentId: string | null,
    runId: string | null,
    input: BulkApplyInput,
    updatedAgentIds: string[],
  ) {
    const details: Record<string, unknown> = {
      mode: input.mode,
      agentIds: updatedAgentIds,
    };

    if (input.mode === "inherit") {
      details.fields = input.fields;
    } else if (input.mode === "override") {
      details.fields = Object.keys(input.fields);
    } else if (input.mode === "swap-adapter") {
      details.newAdapterType = input.newAdapterType;
    }

    const currentUserRedactionOptions = {
      enabled: (await instanceSettings.getGeneral()).censorUsernameInLogs,
    };
    const sanitizedDetails = sanitizeRecord(details);
    const redactedDetails = redactCurrentUserValue(sanitizedDetails, currentUserRedactionOptions);

    // Use the first agentId as entityId (operation is company-level, not single agent)
    const entityId = updatedAgentIds[0] ?? companyId;

    await db.insert(activityLog).values({
      companyId,
      actorType,
      actorId,
      action: "agent.adapter_config.bulk_applied",
      entityType: "agent",
      entityId,
      agentId: agentId ?? null,
      runId: runId ?? null,
      details: redactedDetails,
    });

    publishLiveEvent({
      companyId,
      type: "activity.logged",
      payload: {
        actorType,
        actorId,
        action: "agent.adapter_config.bulk_applied",
        entityType: "agent",
        entityId,
        agentId: agentId ?? null,
        runId: runId ?? null,
        details: redactedDetails,
      },
    });
  }

  async function applyInherit(
    companyId: string,
    input: BulkApplyInheritInput,
    actorType: "agent" | "user" | "system",
    actorId: string,
    agentId: string | null,
    runId: string | null,
  ): Promise<BulkApplyResult> {
    const agentRows = await fetchAndValidateAgents(companyId, input.agentIds);

    try {
      await db.transaction(async (tx) => {
        for (const row of agentRows) {
          const existingConfig = (row.adapterConfig ?? {}) as Record<string, unknown>;
          const nextConfig = { ...existingConfig };
          for (const field of input.fields) {
            delete nextConfig[field];
          }
          await tx
            .update(agents)
            .set({ adapterConfig: nextConfig, updatedAt: new Date() })
            .where(eq(agents.id, row.id));
        }
      });
    } catch (err) {
      logger.error({ err, companyId, mode: "inherit" }, "bulk_apply_transaction_failed");
      throw err;
    }

    await logBulkApplyActivity(
      companyId,
      actorType,
      actorId,
      agentId,
      runId,
      input,
      input.agentIds,
    );

    return { updatedAgentIds: input.agentIds, mode: "inherit" };
  }

  async function applyOverride(
    companyId: string,
    input: BulkApplyOverrideInput,
    actorType: "agent" | "user" | "system",
    actorId: string,
    agentId: string | null,
    runId: string | null,
  ): Promise<BulkApplyResult> {
    const agentRows = await fetchAndValidateAgents(companyId, input.agentIds);

    // Normalize the user-supplied fields before persisting (R3: secret_ref conversion)
    let normalizedFields: Record<string, unknown>;
    try {
      normalizedFields = await secretsSvc.normalizeAdapterConfigForPersistence(
        companyId,
        input.fields,
        { strictMode: strictSecretsMode },
      );
    } catch (err) {
      logger.error({ err, companyId, mode: "override" }, "bulk_apply_normalize_failed");
      throw err;
    }

    try {
      await db.transaction(async (tx) => {
        for (const row of agentRows) {
          const existingConfig = (row.adapterConfig ?? {}) as Record<string, unknown>;
          const nextConfig = { ...existingConfig, ...normalizedFields };
          await tx
            .update(agents)
            .set({ adapterConfig: nextConfig, updatedAt: new Date() })
            .where(eq(agents.id, row.id));
        }
      });
    } catch (err) {
      logger.error({ err, companyId, mode: "override" }, "bulk_apply_transaction_failed");
      throw err;
    }

    await logBulkApplyActivity(
      companyId,
      actorType,
      actorId,
      agentId,
      runId,
      input,
      input.agentIds,
    );

    return { updatedAgentIds: input.agentIds, mode: "override" };
  }

  async function applySwapAdapter(
    companyId: string,
    input: BulkApplySwapAdapterInput,
    actorType: "agent" | "user" | "system",
    actorId: string,
    agentId: string | null,
    runId: string | null,
  ): Promise<BulkApplyResult> {
    const agentRows = await fetchAndValidateAgents(companyId, input.agentIds);

    // Normalize the new config before persisting
    let normalizedConfig: Record<string, unknown>;
    try {
      normalizedConfig = await secretsSvc.normalizeAdapterConfigForPersistence(
        companyId,
        input.newAdapterConfig,
        { strictMode: strictSecretsMode },
      );
    } catch (err) {
      logger.error({ err, companyId, mode: "swap-adapter" }, "bulk_apply_normalize_failed");
      throw err;
    }

    try {
      await db.transaction(async (tx) => {
        for (const row of agentRows) {
          await tx
            .update(agents)
            .set({
              adapterType: input.newAdapterType,
              adapterConfig: normalizedConfig,
              updatedAt: new Date(),
            })
            .where(eq(agents.id, row.id));
        }
      });
    } catch (err) {
      logger.error({ err, companyId, mode: "swap-adapter" }, "bulk_apply_transaction_failed");
      throw err;
    }

    await logBulkApplyActivity(
      companyId,
      actorType,
      actorId,
      agentId,
      runId,
      input,
      input.agentIds,
    );

    return { updatedAgentIds: input.agentIds, mode: "swap-adapter" };
  }

  async function apply(
    companyId: string,
    input: BulkApplyInput,
    actorType: "agent" | "user" | "system",
    actorId: string,
    agentId: string | null,
    runId: string | null,
  ): Promise<BulkApplyResult> {
    switch (input.mode) {
      case "inherit":
        return applyInherit(companyId, input, actorType, actorId, agentId, runId);
      case "override":
        return applyOverride(companyId, input, actorType, actorId, agentId, runId);
      case "swap-adapter":
        return applySwapAdapter(companyId, input, actorType, actorId, agentId, runId);
    }
  }

  return { apply };
}
