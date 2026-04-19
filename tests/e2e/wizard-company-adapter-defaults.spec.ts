import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * E2E: Wizard saves company adapterDefaults, and a second agent inherits.
 *
 * Walks the wizard with LM Studio + a remote URL and asserts:
 *   1) companies.adapterDefaults.lm_studio_local.baseUrl is populated.
 *   2) The wizard-created CEO does NOT have baseUrl in its adapterConfig.
 *   3) An agent created in the same company without a URL has no baseUrl in its
 *      stored adapterConfig (so heartbeat-resolve will inherit from company default,
 *      which is covered separately by unit + heartbeat tests).
 */

const COMPANY_NAME = `E2E-Defaults-${Date.now()}`;
const FAKE_URL = "http://10.99.99.99:1234";

async function getCompanyByName(api: APIRequestContext, name: string) {
  const resp = await api.get("/api/companies");
  expect(resp.ok()).toBe(true);
  const all = (await resp.json()) as Array<{ id: string; name: string; adapterDefaults: unknown }>;
  const co = all.find((c) => c.name === name);
  expect(co, `company ${name} not found`).toBeTruthy();
  return co!;
}

test.describe("Wizard → company adapterDefaults", () => {
  test("LM Studio URL is saved at company level and inherited by a later agent", async ({ page, request }) => {
    // Stub env-test so the wizard can advance past the gate without a real LM Studio.
    // The wizard hits POST /api/companies/:companyId/adapters/:adapterType/test-environment.
    await page.route("**/adapters/lm_studio_local/test-environment", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "pass",
          checks: [],
          testedAt: new Date().toISOString(),
        }),
      });
    });

    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // Step 1 — open the wizard.
    // On a fresh server it auto-opens. With existing companies we need to click
    // either "Add company" (sidebar rail) or "Create your first company" (App.tsx fallback).
    const wizardHeading = page.locator("h3", { hasText: /회사 만들기|Create.*company/i });
    const addCompanySidebarBtn = page.getByRole("button", { name: "Add company" });
    const createFirstCompanyBtn = page.getByRole("button", {
      name: /Create your first company|Create another company|New Company/i,
    });

    // Wait for any of the three to be present.
    await expect(
      wizardHeading.or(addCompanySidebarBtn).or(createFirstCompanyBtn),
    ).toBeVisible({ timeout: 15_000 });
    if (!(await wizardHeading.isVisible())) {
      if (await addCompanySidebarBtn.isVisible()) {
        await addCompanySidebarBtn.click();
      } else if (await createFirstCompanyBtn.isVisible()) {
        await createFirstCompanyBtn.click();
      }
    }
    await expect(wizardHeading).toBeVisible({ timeout: 10_000 });
    await page.locator('input[placeholder="Acme Corp"]').fill(COMPANY_NAME);
    await page.getByRole("button", { name: /다음|Next/i }).click();

    // Step 2 — pick LM Studio in advanced section, fill URL
    await expect(page.locator("h3", { hasText: /AI 도구 연결|Connect.*AI/i })).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /고급 설정|Advanced/i }).click();
    await page.getByRole("button", { name: "LM Studio" }).click();
    const urlInput = page.locator('input[placeholder*="1234"]').first();
    await urlInput.fill(FAKE_URL);

    await page.getByRole("button", { name: /다음|Next/i }).click();

    // Step 3
    await expect(page.locator("h3", { hasText: /첫 미션|first mission/i })).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /생성하고 시작하기|Create.*Start/i }).click();

    // Wait for wizard to close (URL changes to issue page)
    await page.waitForURL(/\/issues\//, { timeout: 15_000 });

    // Assertion 1: company.adapterDefaults.lm_studio_local.baseUrl is set
    const company = await getCompanyByName(request, COMPANY_NAME);
    expect(company.adapterDefaults).toMatchObject({
      lm_studio_local: { baseUrl: FAKE_URL },
    });

    // Assertion 2: CEO agent's adapterConfig does NOT have baseUrl
    const agentsResp = await request.get(`/api/companies/${company.id}/agents`);
    expect(agentsResp.ok()).toBe(true);
    const agents = (await agentsResp.json()) as Array<{
      role: string;
      adapterConfig: Record<string, unknown>;
    }>;
    const ceo = agents.find((a) => a.role === "ceo");
    expect(ceo, "CEO agent missing").toBeTruthy();
    expect(ceo!.adapterConfig).not.toHaveProperty("baseUrl");

    // Assertion 3: a fresh agent created without URL inherits from company default.
    const newAgentResp = await request.post(`/api/companies/${company.id}/agents`, {
      data: {
        name: "Second Agent",
        role: "engineer",
        adapterType: "lm_studio_local",
        adapterConfig: { lmStudioBaseUrlMode: "company" },
        runtimeConfig: {
          heartbeat: {
            enabled: false,
            intervalSec: 3600,
            wakeOnDemand: false,
            cooldownSec: 10,
            maxConcurrentRuns: 1,
          },
        },
      },
    });
    expect(newAgentResp.ok()).toBe(true);
    const newAgent = (await newAgentResp.json()) as { id: string };

    // No /resolved-config endpoint exists (verified by route table inspection).
    // The inheritance behavior at heartbeat-resolve time is exhaustively covered
    // by unit tests + server/src/__tests__/heartbeat-adapter-config-resolve.test.ts.
    // Here we assert the wire-level invariant that the second agent's stored
    // adapterConfig has no baseUrl (so it WILL inherit when the heartbeat resolves).
    const listResp = await request.get(
      `/api/agents/${newAgent.id}?companyId=${company.id}`,
    );
    expect(listResp.ok()).toBe(true);
    const fetchedAgent = (await listResp.json()) as {
      adapterConfig: Record<string, unknown>;
    };
    expect(fetchedAgent.adapterConfig).not.toHaveProperty("baseUrl");

    // Cleanup
    await request.delete(`/api/companies/${company.id}`);
  });
});
