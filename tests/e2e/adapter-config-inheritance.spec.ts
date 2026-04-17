/**
 * E2E: Adapter Config Inheritance (Phase 9)
 *
 * Covers three critical user journeys for the adapter config inheritance
 * feature introduced in Phases 1–8.
 *
 * All data is seeded via the REST API (`page.request`) before each test so
 * tests are fully independent and leave no shared mutable state.
 *
 * Company routes are prefixed with the company's `issuePrefix`, e.g.
 * `/MYCO/company/settings` and `/MYCO/agents/:id/configuration`.
 * Company selection is also set via localStorage.
 *
 * Base URL / server lifecycle is managed by playwright.config.ts
 * (webServer: `pnpm paperclipai run`, url: /api/health).
 *
 * @tags adapter-config, inheritance, bulk-apply, @critical
 */

import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CompanyRecord {
  id: string;
  name: string;
  issuePrefix: string;
}

interface AgentRecord {
  id: string;
  name: string;
  adapterType: string;
  adapterConfig: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve the base URL from the page (strips path/trailing slashes). */
function baseUrl(page: Page): string {
  return page.url().split("/").slice(0, 3).join("/");
}

/** Build the company-scoped URL for a given path. */
function companyPath(company: CompanyRecord, path: string): string {
  const prefix = company.issuePrefix.toLowerCase();
  return `/${prefix}/${path.replace(/^\//, "")}`;
}

/** Create a test company via the REST API. */
async function createCompany(
  request: APIRequestContext,
  base: string,
  name: string,
): Promise<CompanyRecord> {
  const res = await request.post(`${base}/api/companies`, {
    data: { name },
  });
  expect(res.ok(), `createCompany "${name}": POST /api/companies → ${res.status()}`).toBe(true);
  return res.json();
}

/** Create a test agent via the REST API. */
async function createAgent(
  request: APIRequestContext,
  base: string,
  companyId: string,
  name: string,
  adapterType: string,
  adapterConfig: Record<string, unknown> = {},
): Promise<AgentRecord> {
  const res = await request.post(`${base}/api/companies/${companyId}/agents`, {
    data: {
      name,
      role: "engineer",
      adapterType,
      adapterConfig,
    },
  });
  expect(res.ok(), `createAgent "${name}": POST → ${res.status()}`).toBe(true);
  return res.json();
}

/**
 * Set a company-level adapter default.
 * PUT /api/companies/:companyId/adapter-defaults/:providerId
 */
async function putAdapterDefaults(
  request: APIRequestContext,
  base: string,
  companyId: string,
  providerId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const res = await request.put(
    `${base}/api/companies/${companyId}/adapter-defaults/${providerId}`,
    { data: payload },
  );
  expect(res.ok(), `putAdapterDefaults(${providerId}): PUT → ${res.status()}`).toBe(true);
}

/**
 * Bulk-apply adapter config changes.
 * POST /api/companies/:companyId/agents/bulk-apply
 */
async function bulkApply(
  request: APIRequestContext,
  base: string,
  companyId: string,
  payload: Record<string, unknown>,
): Promise<{ updatedAgentIds: string[]; mode: string }> {
  const res = await request.post(
    `${base}/api/companies/${companyId}/agents/bulk-apply`,
    { data: payload },
  );
  expect(res.ok(), `bulkApply: POST → ${res.status()}`).toBe(true);
  const body = await res.json();
  // Server wraps result in { data: ... }
  return body.data ?? body;
}

/** Fetch a single agent's current state. */
async function getAgent(
  request: APIRequestContext,
  base: string,
  agentId: string,
  companyId: string,
): Promise<AgentRecord> {
  const res = await request.get(
    `${base}/api/agents/${agentId}?companyId=${companyId}`,
  );
  expect(res.ok(), `getAgent(${agentId}): GET → ${res.status()}`).toBe(true);
  return res.json();
}

/**
 * Select the given company in the React app via localStorage so that
 * CompanyContext picks it up on the next page load.
 */
async function selectCompany(page: Page, companyId: string): Promise<void> {
  await page.evaluate(
    (id) => localStorage.setItem("paperclip.selectedCompanyId", id),
    companyId,
  );
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe("Adapter Config Inheritance", () => {
  // ── Test 1: Company default propagation → Agent detail reflects inheritance ──

  test(
    "@critical company default propagation is reflected on agent configuration tab",
    async ({ page, request }) => {
      await page.goto("/");
      await page.waitForLoadState("domcontentloaded");
      const base = baseUrl(page);

      // ── Seed ──────────────────────────────────────────────────────────────────
      const ts = Date.now();
      const company = await createCompany(request, base, `E2E-Inherit-${ts}`);
      const agent1 = await createAgent(
        request,
        base,
        company.id,
        `LMStudio-Agent1-${ts}`,
        "lm_studio_local",
        // No model override → will inherit from company default once set
        {},
      );

      // Set company default: model = "qwen2.5-coder"
      await putAdapterDefaults(request, base, company.id, "lm_studio_local", {
        model: "qwen2.5-coder",
      });

      // ── Navigate to agent configuration tab ───────────────────────────────────
      // Select company in localStorage first so CompanyContext resolves correctly
      await selectCompany(page, company.id);
      await page.goto(companyPath(company, `agents/${agent1.id}/configuration`));
      await page.waitForLoadState("networkidle");

      // Wait for tabs to render
      await expect(
        page.locator("[role='tab'][data-state='active']"),
      ).toBeVisible({ timeout: 15_000 });

      // ── Assert: "Inherited from company" badge is visible on Model field ──────
      // InheritableField renders aria-label="Inherited from company default"
      // when value===undefined and companyDefault is set
      await expect(
        page.locator('[aria-label="Inherited from company default"]').first(),
      ).toBeVisible({ timeout: 15_000 });

      // The read-only resolved value shows the company default "qwen2.5-coder"
      await expect(
        page.locator("text=qwen2.5-coder").first(),
      ).toBeVisible({ timeout: 5_000 });

      // ── Update company default → verify auto-propagation ──────────────────────
      await putAdapterDefaults(request, base, company.id, "lm_studio_local", {
        model: "llama3.2",
      });

      // Reload page — company data will be refetched, showing new default
      await page.reload();
      await page.waitForLoadState("networkidle");

      await expect(
        page.locator('[aria-label="Inherited from company default"]').first(),
      ).toBeVisible({ timeout: 15_000 });

      await expect(
        page.locator("text=llama3.2").first(),
      ).toBeVisible({ timeout: 5_000 });

      // ── API-level: agent's adapterConfig has no explicit model key ─────────────
      const agentState = await getAgent(request, base, agent1.id, company.id);
      const modelValue = agentState.adapterConfig["model"];
      expect(
        modelValue == null || modelValue === undefined,
        `Expected agent.model to be absent (inheriting), got: ${JSON.stringify(modelValue)}`,
      ).toBe(true);

      // Cleanup
      await request.delete(`${base}/api/companies/${company.id}`);
    },
  );

  // ── Test 2: Provider-scoped bulk apply transitions agent to inherit mode ─────

  test(
    "@critical provider-scoped bulk apply transitions explicit-config agent to inherit mode",
    async ({ page, request }) => {
      await page.goto("/");
      await page.waitForLoadState("domcontentloaded");
      const base = baseUrl(page);

      // ── Seed ──────────────────────────────────────────────────────────────────
      const ts = Date.now();
      const company = await createCompany(request, base, `E2E-BulkApply-${ts}`);

      const agent1 = await createAgent(
        request,
        base,
        company.id,
        `LMStudio-Agent1-${ts}`,
        "lm_studio_local",
        {},
      );

      // Agent2 has an explicit model override → we'll put it back to inherit
      const agent2 = await createAgent(
        request,
        base,
        company.id,
        `LMStudio-Agent2-${ts}`,
        "lm_studio_local",
        { model: "custom-model" },
      );

      // Set company default
      await putAdapterDefaults(request, base, company.id, "lm_studio_local", {
        model: "llama3.2",
      });

      // ── API-level bulk-apply: inherit mode ────────────────────────────────────
      const result = await bulkApply(request, base, company.id, {
        mode: "inherit",
        agentIds: [agent2.id],
        fields: ["model"],
      });

      expect(result.updatedAgentIds).toContain(agent2.id);
      expect(result.mode).toBe("inherit");

      // Agent2's model field should now be absent
      const agent2After = await getAgent(request, base, agent2.id, company.id);
      const modelValue = agent2After.adapterConfig["model"];
      expect(
        modelValue == null || modelValue === undefined,
        `Expected agent2.model to be absent after inherit, got: ${JSON.stringify(modelValue)}`,
      ).toBe(true);

      // ── UI: agent2 configuration tab shows inherit badge ──────────────────────
      await selectCompany(page, company.id);
      await page.goto(companyPath(company, `agents/${agent2.id}/configuration`));
      await page.waitForLoadState("networkidle");

      await expect(
        page.locator('[aria-label="Inherited from company default"]').first(),
      ).toBeVisible({ timeout: 15_000 });

      // Resolved value = company default "llama3.2"
      await expect(
        page.locator("text=llama3.2").first(),
      ).toBeVisible({ timeout: 5_000 });

      // ── UI: ProviderScopedModal opens correctly from Company Settings ──────────
      await page.goto(companyPath(company, "company/settings"));
      await page.waitForLoadState("networkidle");

      // Wait for AdapterDefaultsSection to render
      await expect(
        page.locator("text=어댑터 기본값"),
      ).toBeVisible({ timeout: 10_000 });

      // Expand the LM Studio collapsible card
      const lmStudioTrigger = page
        .locator('button[aria-expanded]', { hasText: /LM Studio/i })
        .first();
      await expect(lmStudioTrigger).toBeVisible({ timeout: 10_000 });
      await lmStudioTrigger.click();

      // "에이전트에 일괄 적용..." button appears after expansion.
      // The button's aria-label is "LM Studio 기본값을 에이전트에 일괄 적용" so use text match.
      const bulkApplyProviderBtn = page.getByText("에이전트에 일괄 적용...", { exact: true });
      await expect(bulkApplyProviderBtn).toBeVisible({ timeout: 5_000 });

      // Open the ProviderScopedModal
      await bulkApplyProviderBtn.click();

      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible({ timeout: 5_000 });

      // Modal title includes "에이전트에 일괄 적용"
      await expect(
        dialog.locator("text=/에이전트에 일괄 적용/"),
      ).toBeVisible({ timeout: 5_000 });

      // Both agents should be listed in the modal
      await expect(dialog.locator(`text=${agent1.name}`).first()).toBeVisible({ timeout: 5_000 });
      await expect(dialog.locator(`text=${agent2.name}`).first()).toBeVisible({ timeout: 5_000 });

      // The "model" field checkbox should be present (company default has "model" key)
      await expect(dialog.locator('label', { hasText: /^model/ })).toBeVisible({ timeout: 3_000 });

      // Dismiss without applying
      await page.getByRole("button", { name: /취소/i }).first().click();
      await expect(dialog).not.toBeVisible({ timeout: 3_000 });

      // Cleanup
      await request.delete(`${base}/api/companies/${company.id}`);
      void agent1; // prevent unused-var warning
    },
  );

  // ── Test 3: Global modal swap-adapter: claude_local → ollama_local ───────────

  test(
    "@critical global bulk-apply API swaps adapter type from claude_local to ollama_local",
    async ({ page, request }) => {
      await page.goto("/");
      await page.waitForLoadState("domcontentloaded");
      const base = baseUrl(page);

      // ── Seed ──────────────────────────────────────────────────────────────────
      const ts = Date.now();
      const company = await createCompany(request, base, `E2E-Swap-${ts}`);

      const agent1 = await createAgent(
        request,
        base,
        company.id,
        `Claude-Agent1-${ts}`,
        "claude_local",
        {},
      );
      const agent2 = await createAgent(
        request,
        base,
        company.id,
        `Claude-Agent2-${ts}`,
        "claude_local",
        {},
      );

      // Verify initial adapter type
      const a1Before = await getAgent(request, base, agent1.id, company.id);
      expect(a1Before.adapterType).toBe("claude_local");

      // ── API-level swap via bulk-apply ─────────────────────────────────────────
      const swapResult = await bulkApply(request, base, company.id, {
        mode: "swap-adapter",
        agentIds: [agent1.id, agent2.id],
        newAdapterType: "ollama_local",
        newAdapterConfig: {
          model: "llama3.2",
          baseUrl: "http://localhost:11434",
        },
      });

      expect(swapResult.updatedAgentIds).toContain(agent1.id);
      expect(swapResult.updatedAgentIds).toContain(agent2.id);
      expect(swapResult.mode).toBe("swap-adapter");

      // API-level verification: both agents now use ollama_local
      const a1After = await getAgent(request, base, agent1.id, company.id);
      expect(a1After.adapterType).toBe("ollama_local");
      expect(a1After.adapterConfig.model).toBe("llama3.2");
      expect(a1After.adapterConfig.baseUrl).toBe("http://localhost:11434");

      const a2After = await getAgent(request, base, agent2.id, company.id);
      expect(a2After.adapterType).toBe("ollama_local");
      expect(a2After.adapterConfig.model).toBe("llama3.2");

      // ── UI: Agent detail shows Base URL field (Ollama has Base URL) ───────────
      await selectCompany(page, company.id);
      await page.goto(companyPath(company, `agents/${agent1.id}/configuration`));
      await page.waitForLoadState("networkidle");

      await expect(
        page.locator("[role='tab'][data-state='active']"),
      ).toBeVisible({ timeout: 15_000 });

      // Ollama config-fields renders "Base URL" label — confirms adapter swap
      await expect(
        page.locator("text=Base URL").first(),
      ).toBeVisible({ timeout: 10_000 });

      // ── UI: Global modal wizard opens from Company Settings ───────────────────
      await page.goto(companyPath(company, "company/settings"));
      await page.waitForLoadState("networkidle");

      await expect(
        page.locator("text=어댑터 기본값"),
      ).toBeVisible({ timeout: 10_000 });

      // Click the "모든 에이전트 일괄 변경" global button.
      // The button has aria-label="모든 에이전트 어댑터 일괄 변경" and text "모든 에이전트 일괄 변경".
      // Use getByText to match the visible text content exactly.
      const globalBulkBtn = page.getByText("모든 에이전트 일괄 변경", { exact: true });
      await expect(globalBulkBtn).toBeVisible({ timeout: 10_000 });
      await globalBulkBtn.click();

      // Modal opens with 4-step wizard
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible({ timeout: 5_000 });
      await expect(dialog.locator("text=모든 에이전트 일괄 변경")).toBeVisible();

      // All 4 step labels are visible in the step indicator
      await expect(dialog.locator("text=Provider 선택")).toBeVisible();
      await expect(dialog.locator("text=설정 입력")).toBeVisible();
      await expect(dialog.locator("text=에이전트 선택")).toBeVisible();

      // Step 1: adapter combobox is present
      await expect(dialog.getByRole("combobox")).toBeVisible({ timeout: 3_000 });

      // Select Ollama
      await dialog.getByRole("combobox").click();
      const ollamaItem = page
        .locator("[role='option']", { hasText: /[Oo]llama/i })
        .first();
      await expect(ollamaItem).toBeVisible({ timeout: 5_000 });
      await ollamaItem.click();

      // "다음" is enabled after selecting a provider
      const nextBtn = dialog.getByRole("button", { name: /다음/i });
      await expect(nextBtn).toBeEnabled({ timeout: 3_000 });
      await nextBtn.click();

      // Step 2: config entry
      await expect(dialog.locator("text=설정 입력").first()).toBeVisible({ timeout: 5_000 });
      await dialog.getByRole("button", { name: /다음/i }).click();

      // Step 3: agent selection — both ollama_local agents are listed
      await expect(
        dialog.locator(`text=${agent1.name}`).first(),
      ).toBeVisible({ timeout: 10_000 });
      await expect(
        dialog.locator(`text=${agent2.name}`).first(),
      ).toBeVisible({ timeout: 5_000 });

      // Select all agents (GlobalModal starts with empty selection; "다음" requires ≥1 agent)
      await dialog.getByText("전체 선택", { exact: true }).click();

      // Now "다음" should be enabled
      await dialog.getByRole("button", { name: /다음/i }).click();

      // Step 4: confirmation summary
      await expect(
        dialog.locator("text=아래 변경 내용을 확인"),
      ).toBeVisible({ timeout: 5_000 });

      // Cancel — swap was already validated via API
      await dialog.getByRole("button", { name: /취소/i }).click();
      await expect(dialog).not.toBeVisible({ timeout: 3_000 });

      // Cleanup
      await request.delete(`${base}/api/companies/${company.id}`);
    },
  );
});
