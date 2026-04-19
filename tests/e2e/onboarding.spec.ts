import { test, expect } from "@playwright/test";

/**
 * E2E: Onboarding wizard flow (skip_llm mode).
 *
 * Walks through the 3-step OnboardingWizard:
 *   Step 1 — Create company (회사 만들기)
 *   Step 2 — Connect AI tool (AI 도구 연결하기)
 *   Step 3 — First mission (첫 미션)
 *
 * After step 3 the wizard submits and redirects directly to the issue page.
 * The Getting Started panel should be visible after redirect.
 *
 * By default this runs in skip_llm mode: we do NOT assert that an LLM
 * heartbeat fires. Set PAPERCLIP_E2E_SKIP_LLM=false to enable LLM-dependent
 * assertions (requires a valid ANTHROPIC_API_KEY).
 */

const SKIP_LLM = process.env.PAPERCLIP_E2E_SKIP_LLM !== "false";

const COMPANY_NAME = `E2E-Test-${Date.now()}`;
const AGENT_NAME = "CEO";
const TASK_TITLE = "E2E test task";

test.describe("Onboarding wizard", () => {
  test("completes full wizard flow", async ({ page }) => {
    await page.goto("/");

    // Step 1: Create company (회사 만들기)
    // On a fresh server the wizard auto-opens. With existing companies we need
    // to click either "Add company" (sidebar rail) or the App.tsx fallback
    // ("Create your first company" / "Create another company" / "New Company").
    const wizardHeading = page.locator("h3", { hasText: /회사 만들기|Create.*company/i });
    const addCompanySidebarBtn = page.getByRole("button", { name: "Add company" });
    const createFirstCompanyBtn = page.getByRole("button", {
      name: /Create your first company|Create another company|New Company/i,
    });

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

    const companyNameInput = page.locator('input[placeholder="Acme Corp"]');
    await companyNameInput.fill(COMPANY_NAME);

    const nextButton = page.getByRole("button", { name: /다음|Next/i });
    await nextButton.click();

    // Step 2: Connect AI tool (AI 도구 연결하기)
    await expect(
      page.locator("h3", { hasText: /AI 도구 연결|Connect.*AI/i })
    ).toBeVisible({ timeout: 10_000 });

    const agentNameInput = page.locator('input[placeholder="CEO"]');
    await expect(agentNameInput).toHaveValue(AGENT_NAME);

    await expect(
      page.locator("button", { hasText: "Claude Code" }).locator("..")
    ).toBeVisible();

    await page.getByRole("button", { name: /더 많은 어댑터|More Agent Adapter/i }).click();
    await expect(page.getByRole("button", { name: "Process" })).toHaveCount(0);

    await page.getByRole("button", { name: /다음|Next/i }).click();

    // Step 3: First mission (첫 미션)
    await expect(
      page.locator("h3", { hasText: /첫 미션|first mission|Give it something/i })
    ).toBeVisible({ timeout: 10_000 });

    const taskTitleInput = page.locator(
      'input[placeholder="e.g. Research competitor pricing"]'
    );
    await taskTitleInput.clear();
    await taskTitleInput.fill(TASK_TITLE);

    // Final button: "생성하고 시작하기" (createAndStart)
    await page.getByRole("button", { name: /생성하고 시작하기|Create.*Start/i }).click();

    // Should redirect directly to issue page (no step 4)
    await expect(page).toHaveURL(/\/issues\//, { timeout: 10_000 });

    // Getting Started panel should be visible after redirect
    await expect(
      page.locator("text=/Getting Started|시작하기/i").first()
    ).toBeVisible({ timeout: 5_000 });

    const baseUrl = page.url().split("/").slice(0, 3).join("/");

    const companiesRes = await page.request.get(`${baseUrl}/api/companies`);
    expect(companiesRes.ok()).toBe(true);
    const companies = await companiesRes.json();
    const company = companies.find(
      (c: { name: string }) => c.name === COMPANY_NAME
    );
    expect(company).toBeTruthy();

    const agentsRes = await page.request.get(
      `${baseUrl}/api/companies/${company.id}/agents`
    );
    expect(agentsRes.ok()).toBe(true);
    const agents = await agentsRes.json();
    const ceoAgent = agents.find(
      (a: { name: string }) => a.name === AGENT_NAME
    );
    expect(ceoAgent).toBeTruthy();
    expect(ceoAgent.role).toBe("ceo");
    expect(ceoAgent.adapterType).not.toBe("process");

    const instructionsBundleRes = await page.request.get(
      `${baseUrl}/api/agents/${ceoAgent.id}/instructions-bundle?companyId=${company.id}`
    );
    expect(instructionsBundleRes.ok()).toBe(true);
    const instructionsBundle = await instructionsBundleRes.json();
    expect(
      instructionsBundle.files.map((file: { path: string }) => file.path).sort()
    ).toEqual(["AGENTS.md", "HEARTBEAT.md", "SOUL.md", "TOOLS.md"]);

    const issuesRes = await page.request.get(
      `${baseUrl}/api/companies/${company.id}/issues`
    );
    expect(issuesRes.ok()).toBe(true);
    const issues = await issuesRes.json();
    const task = issues.find(
      (i: { title: string }) => i.title === TASK_TITLE
    );
    expect(task).toBeTruthy();
    expect(task.assigneeAgentId).toBe(ceoAgent.id);
    expect(task.description).toContain(
      "You are the CEO. You set the direction for the company."
    );
    expect(task.description).not.toContain("github.com/paperclipai/companies");

    if (!SKIP_LLM) {
      await expect(async () => {
        const res = await page.request.get(
          `${baseUrl}/api/issues/${task.id}`
        );
        const issue = await res.json();
        expect(["in_progress", "done"]).toContain(issue.status);
      }).toPass({ timeout: 120_000, intervals: [5_000] });
    }
  });
});
