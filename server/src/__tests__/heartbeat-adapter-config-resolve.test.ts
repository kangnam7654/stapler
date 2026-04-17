/**
 * Integration test for Phase 2 of adapter-config inheritance:
 * verifies that `resolveAgentAdapterConfig` correctly merges company-level
 * adapterDefaults with an agent's adapterConfig using real PGlite DB records.
 *
 * Tests the exact path that `heartbeat.ts` now exercises: fetch company via
 * `companyService.getById`, fetch agent from `db`, then call
 * `resolveAgentAdapterConfig` with those records.  Also covers the regression
 * case where a stale `baseUrlMode: 'company'` in the DB still resolves to the
 * correct baseUrl from company defaults (normalizeAdapterConfigForAdapterType
 * must preserve the field when `baseUrlMode` is 'company').
 */

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { agents, companies, createDb } from "@paperclipai/db";
import { resolveAgentAdapterConfig } from "@paperclipai/shared";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { companyService } from "../services/companies.js";
import {
  mergeAdapterConfigWithCompanyDefaults,
  normalizeAdapterConfigForAdapterType,
} from "../services/heartbeat.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping heartbeat adapter-config resolve integration tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("heartbeat: resolveAgentAdapterConfig integration (real PGlite)", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-heartbeat-resolve-");
    db = createDb(tempDb.connectionString);
  }, 20_000);

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  /**
   * Seeds a company + agent pair and returns their IDs.
   */
  async function seedCompanyAndAgent(opts: {
    adapterDefaults: Record<string, unknown> | null;
    adapterType: string;
    adapterConfig: Record<string, unknown>;
  }): Promise<{ companyId: string; agentId: string }> {
    const companyId = randomUUID();
    const agentId = randomUUID();
    const issuePrefix = `T${companyId.replace(/-/g, "").slice(0, 5).toUpperCase()}`;

    await db.insert(companies).values({
      id: companyId,
      name: "Test Company",
      issuePrefix,
      requireBoardApprovalForNewAgents: false,
      adapterDefaults: opts.adapterDefaults,
    });

    await db.insert(agents).values({
      id: agentId,
      companyId,
      name: "Test Agent",
      role: "engineer",
      status: "active",
      adapterType: opts.adapterType,
      adapterConfig: opts.adapterConfig,
      runtimeConfig: {},
      permissions: {},
    });

    return { companyId, agentId };
  }

  it("merges company model default into agent config when agent has no model set", async () => {
    const { companyId, agentId } = await seedCompanyAndAgent({
      adapterDefaults: { lm_studio_local: { model: "test-model" } },
      adapterType: "lm_studio_local",
      adapterConfig: { baseUrl: "http://localhost:1234" },
    });

    const companySvc = companyService(db);
    const company = await companySvc.getById(companyId);
    const agent = await db
      .select()
      .from(agents)
      .where(eq(agents.id, agentId))
      .then((rows) => rows[0]!);

    const resolved = resolveAgentAdapterConfig(
      { adapterType: agent.adapterType, adapterConfig: agent.adapterConfig as Record<string, unknown> },
      { adapterDefaults: company?.adapterDefaults as Record<string, unknown> | null },
    );

    // Agent-level baseUrl is present; company model default fills in.
    expect(resolved).toMatchObject({
      baseUrl: "http://localhost:1234",
      model: "test-model",
    });
  });

  it("agent explicit model overrides company default model", async () => {
    const { companyId, agentId } = await seedCompanyAndAgent({
      adapterDefaults: { lm_studio_local: { model: "company-model", baseUrl: "http://company:1234" } },
      adapterType: "lm_studio_local",
      adapterConfig: { model: "agent-specific-model" },
    });

    const companySvc = companyService(db);
    const company = await companySvc.getById(companyId);
    const agent = await db
      .select()
      .from(agents)
      .where(eq(agents.id, agentId))
      .then((rows) => rows[0]!);

    const resolved = resolveAgentAdapterConfig(
      { adapterType: agent.adapterType, adapterConfig: agent.adapterConfig as Record<string, unknown> },
      { adapterDefaults: company?.adapterDefaults as Record<string, unknown> | null },
    );

    // Agent model wins; company baseUrl falls through.
    expect(resolved).toMatchObject({
      model: "agent-specific-model",
      baseUrl: "http://company:1234",
    });
  });

  it("falls back to empty config when company has no adapterDefaults", async () => {
    const { companyId, agentId } = await seedCompanyAndAgent({
      adapterDefaults: null,
      adapterType: "lm_studio_local",
      adapterConfig: { baseUrl: "http://localhost:1234", model: "solo-model" },
    });

    const companySvc = companyService(db);
    const company = await companySvc.getById(companyId);
    const agent = await db
      .select()
      .from(agents)
      .where(eq(agents.id, agentId))
      .then((rows) => rows[0]!);

    const resolved = resolveAgentAdapterConfig(
      { adapterType: agent.adapterType, adapterConfig: agent.adapterConfig as Record<string, unknown> },
      { adapterDefaults: company?.adapterDefaults as Record<string, unknown> | null },
    );

    // No company defaults → agent config returned as-is.
    expect(resolved).toMatchObject({
      baseUrl: "http://localhost:1234",
      model: "solo-model",
    });
  });

  it("regression: stale baseUrlMode:'company' preserves baseUrl from company defaults", async () => {
    // Existing DB row with legacy baseUrlMode: 'company' (written by old LMStudio UI).
    // normalizeAdapterConfigForAdapterType must NOT strip baseUrl when baseUrlMode is 'company'.
    const { companyId, agentId } = await seedCompanyAndAgent({
      adapterDefaults: { lm_studio_local: { baseUrl: "http://100.89.177.3:1234" } },
      adapterType: "lm_studio_local",
      adapterConfig: { baseUrlMode: "company", model: "old-model" },
    });

    const companySvc = companyService(db);
    const company = await companySvc.getById(companyId);
    const agent = await db
      .select()
      .from(agents)
      .where(eq(agents.id, agentId))
      .then((rows) => rows[0]!);

    // This is the exact pipeline heartbeat.ts now runs at the early-merge site.
    const resolved = normalizeAdapterConfigForAdapterType(
      agent.adapterType,
      resolveAgentAdapterConfig(
        { adapterType: agent.adapterType, adapterConfig: agent.adapterConfig as Record<string, unknown> },
        { adapterDefaults: company?.adapterDefaults as Record<string, unknown> | null },
      ),
    );

    // baseUrlMode:'company' → normalizeAdapterConfigForAdapterType must keep baseUrl.
    expect(resolved).toMatchObject({
      baseUrlMode: "company",
      baseUrl: "http://100.89.177.3:1234",
      model: "old-model",
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Unit tests for the updated mergeAdapterConfigWithCompanyDefaults wrapper.
// These run without a DB and verify the backward-compat behavior is preserved
// after the function body was switched to delegate to deepMergeAdapterConfig.
// ──────────────────────────────────────────────────────────────────────────────

describe("mergeAdapterConfigWithCompanyDefaults (updated to delegate to deepMergeAdapterConfig)", () => {
  it("company default wins when agent config field is null (inherit semantics)", () => {
    expect(
      mergeAdapterConfigWithCompanyDefaults(
        { baseUrl: "http://100.89.177.3:1234", apiKey: "lms-secret" },
        { model: "google/gemma-4-31b", baseUrl: null, timeoutSec: 300 },
      ),
    ).toEqual({
      baseUrl: "http://100.89.177.3:1234",
      apiKey: "lms-secret",
      model: "google/gemma-4-31b",
      timeoutSec: 300,
    });
  });

  it("explicit non-null agent override wins over company default", () => {
    expect(
      mergeAdapterConfigWithCompanyDefaults(
        { baseUrl: "http://100.89.177.3:1234", apiKey: "lms-secret" },
        { baseUrl: "http://10.0.0.5:1234", apiKey: "", model: "local-model" },
      ),
    ).toEqual({
      baseUrl: "http://10.0.0.5:1234",
      apiKey: "",
      model: "local-model",
    });
  });
});
