import { and, count, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, companies } from "@paperclipai/db";
import { notFound, unprocessable } from "../errors.js";
import { logger } from "../middleware/logger.js";
import { secretService } from "./secrets.js";

// Supported provider IDs — must stay in sync with the UI adapter registry and
// the server adapter registry (server/src/adapters/registry.ts).
const KNOWN_PROVIDER_IDS = new Set([
  "claude_local",
  "codex_local",
  "cursor",
  "gemini_local",
  "hermes_local",
  "http",
  "lm_studio_local",
  "ollama_local",
  "openclaw_gateway",
  "opencode_local",
  "pi_local",
  "process",
]);

function validateProviderId(providerId: string): void {
  if (!KNOWN_PROVIDER_IDS.has(providerId)) {
    throw unprocessable(
      `Unknown provider ID: "${providerId}". Supported providers: ${[...KNOWN_PROVIDER_IDS].join(", ")}`,
    );
  }
}

function asAdapterEndpoint(
  value: unknown,
): Record<string, unknown> | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function adapterDefaultsService(db: Db) {
  const secrets = secretService(db);

  async function getCompanyOrThrow(companyId: string) {
    const row = await db
      .select({ id: companies.id, adapterDefaults: companies.adapterDefaults })
      .from(companies)
      .where(eq(companies.id, companyId))
      .then((rows) => rows[0] ?? null);
    if (!row) throw notFound(`Company not found: ${companyId}`);
    return row;
  }

  async function countAffectedAgents(
    companyId: string,
    providerId: string,
  ): Promise<number> {
    try {
      const result = await db
        .select({ count: count() })
        .from(agents)
        .where(
          and(eq(agents.companyId, companyId), eq(agents.adapterType, providerId)),
        )
        .then((rows) => rows[0]?.count ?? 0);
      return Number(result);
    } catch (err) {
      logger.error(
        { event: "adapter_defaults_count_agents_failed", companyId, providerId, error: String(err) },
        "Failed to count affected agents for adapter defaults update",
      );
      return 0;
    }
  }

  return {
    /**
     * Return the full adapterDefaults map for a company.
     * Returns an empty object if adapterDefaults is null.
     */
    getAll: async (companyId: string): Promise<Record<string, Record<string, unknown>>> => {
      const company = await getCompanyOrThrow(companyId);
      return (company.adapterDefaults as Record<string, Record<string, unknown>> | null) ?? {};
    },

    /**
     * Return the config for a single provider, or null if not set.
     */
    getOne: async (
      companyId: string,
      providerId: string,
    ): Promise<Record<string, unknown> | null> => {
      validateProviderId(providerId);
      const company = await getCompanyOrThrow(companyId);
      const defaults = (company.adapterDefaults ?? {}) as Record<string, unknown>;
      const entry = defaults[providerId];
      return asAdapterEndpoint(entry);
    },

    /**
     * Replace the config for a single provider (full replace, not merge).
     * Normalizes env bindings / secret refs before persisting.
     * Returns `{ updated, affectedAgentCount }`.
     */
    putOne: async (
      companyId: string,
      providerId: string,
      payload: Record<string, unknown>,
    ): Promise<{ updated: Record<string, unknown>; affectedAgentCount: number; changedFields: string[] }> => {
      validateProviderId(providerId);
      await getCompanyOrThrow(companyId);

      let normalized: Record<string, unknown>;
      try {
        normalized = await secrets.normalizeAdapterConfigForPersistence(companyId, payload);
      } catch (err) {
        logger.error(
          { event: "adapter_defaults_normalize_failed", companyId, providerId, error: String(err) },
          "Failed to normalize adapter config for persistence",
        );
        throw err;
      }

      // Determine changed fields for the activity log detail.
      const changedFields = Object.keys(normalized);

      const affectedAgentCount = await countAffectedAgents(companyId, providerId);

      await db.transaction(async (tx) => {
        const existing = await tx
          .select({ adapterDefaults: companies.adapterDefaults })
          .from(companies)
          .where(eq(companies.id, companyId))
          .then((rows) => rows[0] ?? null);
        if (!existing) throw notFound(`Company not found: ${companyId}`);

        const current = (existing.adapterDefaults as Record<string, unknown> | null) ?? {};
        const next = { ...current, [providerId]: normalized };

        await tx
          .update(companies)
          .set({ adapterDefaults: next as any, updatedAt: new Date() })
          .where(eq(companies.id, companyId));
      });

      return { updated: normalized, affectedAgentCount, changedFields };
    },

    /**
     * Deep-merge the config for a single provider.
     * Existing keys not present in payload are preserved.
     * Returns `{ merged, affectedAgentCount }`.
     */
    patchOne: async (
      companyId: string,
      providerId: string,
      payload: Record<string, unknown>,
    ): Promise<{ merged: Record<string, unknown>; affectedAgentCount: number; changedFields: string[] }> => {
      validateProviderId(providerId);
      await getCompanyOrThrow(companyId);

      let normalized: Record<string, unknown>;
      try {
        normalized = await secrets.normalizeAdapterConfigForPersistence(companyId, payload);
      } catch (err) {
        logger.error(
          { event: "adapter_defaults_normalize_failed", companyId, providerId, error: String(err) },
          "Failed to normalize adapter config for persistence",
        );
        throw err;
      }

      const changedFields = Object.keys(normalized);
      const affectedAgentCount = await countAffectedAgents(companyId, providerId);

      let merged: Record<string, unknown> = normalized;

      await db.transaction(async (tx) => {
        const existing = await tx
          .select({ adapterDefaults: companies.adapterDefaults })
          .from(companies)
          .where(eq(companies.id, companyId))
          .then((rows) => rows[0] ?? null);
        if (!existing) throw notFound(`Company not found: ${companyId}`);

        const current = (existing.adapterDefaults as Record<string, unknown> | null) ?? {};
        const existingEntry = asAdapterEndpoint(current[providerId]) ?? {};
        merged = { ...existingEntry, ...normalized };
        const next = { ...current, [providerId]: merged };

        await tx
          .update(companies)
          .set({ adapterDefaults: next as any, updatedAt: new Date() })
          .where(eq(companies.id, companyId));
      });

      return { merged, affectedAgentCount, changedFields };
    },

    /**
     * Remove the config entry for a single provider.
     * Returns `{ affectedAgentCount }`.
     */
    deleteOne: async (
      companyId: string,
      providerId: string,
    ): Promise<{ affectedAgentCount: number }> => {
      validateProviderId(providerId);

      const affectedAgentCount = await countAffectedAgents(companyId, providerId);

      await db.transaction(async (tx) => {
        const existing = await tx
          .select({ adapterDefaults: companies.adapterDefaults })
          .from(companies)
          .where(eq(companies.id, companyId))
          .then((rows) => rows[0] ?? null);
        if (!existing) throw notFound(`Company not found: ${companyId}`);

        const current = (existing.adapterDefaults as Record<string, unknown> | null) ?? {};
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { [providerId]: _removed, ...rest } = current;
        await tx
          .update(companies)
          .set({ adapterDefaults: rest as any, updatedAt: new Date() })
          .where(eq(companies.id, companyId));
      });

      return { affectedAgentCount };
    },
  };
}
