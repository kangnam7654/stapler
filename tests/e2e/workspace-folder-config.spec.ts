import { test, expect } from "@playwright/test";

/**
 * E2E: Workspace folder configuration.
 *
 * Verifies the two-layer workspace path resolver wired through the UI:
 *   1. Company-level workspaceRootPath (CompanySettings)
 *   2. Project-level workspacePathOverride (ProjectDetail → configuration tab)
 *      with a resolved-path readout sourced from `GET /api/projects/:id/workspace-path`.
 *
 * The first test uses the onboarding wizard to seed a fresh company + project,
 * then sets a workspace root and asserts the resolved path on the project
 * picks up the company root. The second test then overrides on the project
 * and asserts the resolved path switches to project_override.
 *
 * Selectors target the Korean copy that ships in production. Where placeholder
 * matchers are used, they intentionally allow either Korean or English wording
 * to stay robust against future i18n adjustments.
 */

const RUN_ID = Date.now();
const COMPANY_NAME = `WS-${RUN_ID}`;
const PROJECT_TITLE = `Calc-${RUN_ID}`;
const ROOT_PATH = `/tmp/stapler-e2e-${RUN_ID}`;
const OVERRIDE_PATH = `/tmp/stapler-e2e-override-${RUN_ID}`;

test.describe.serial("Workspace folder configuration", () => {
  test("company root flows into project resolved path", async ({ page }) => {
    // ── 1. Bootstrap company via onboarding wizard ───────────────────────────
    await page.goto("/");

    // On a fresh server the wizard auto-opens. With existing companies we need
    // to click either "Add company" (sidebar rail) or the App.tsx fallback
    // ("Create your first company" / "Create another company" / "New Company").
    const wizardHeading = page.locator("h3", {
      hasText: /회사 만들기|Create.*company/i,
    });
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

    await page.locator('input[placeholder="Acme Corp"]').fill(COMPANY_NAME);
    await page.getByRole("button", { name: /다음|Next/i }).click();

    // Step 2 — Connect AI tool. Accept defaults and continue.
    await expect(
      page.locator("h3", { hasText: /AI 도구 연결|Connect.*AI/i }),
    ).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /다음|Next/i }).click();

    // Step 3 — First mission. Provide the project title we want to assert on.
    await expect(
      page.locator("h3", { hasText: /첫 미션|first mission|Give it something/i }),
    ).toBeVisible({ timeout: 10_000 });

    const taskTitleInput = page.locator(
      'input[placeholder="e.g. Research competitor pricing"]',
    );
    await taskTitleInput.clear();
    await taskTitleInput.fill(PROJECT_TITLE);
    await page.getByRole("button", { name: /생성하고 시작하기|Create.*Start/i }).click();

    // Wizard redirects to the issue page once the company + project are seeded.
    await page.waitForURL(/\/issues\//, { timeout: 30_000 });

    // ── 2. Set company workspace root in settings ────────────────────────────
    await page.goto("/settings");

    const rootInput = page.locator('input[placeholder*="work/acme"]').first();
    await expect(rootInput).toBeVisible({ timeout: 10_000 });
    await rootInput.fill(ROOT_PATH);

    // The "산출물 폴더" card has its own 저장 button — scope to that card to
    // avoid colliding with general/branding save buttons elsewhere on the page.
    const workspaceCard = page.locator("div", {
      has: page.locator("h3", { hasText: "산출물 폴더 (회사 default)" }),
    }).first();
    await workspaceCard.getByRole("button", { name: /^저장$/ }).click();

    await expect(page.getByText(/산출물 폴더 저장됨/)).toBeVisible({ timeout: 10_000 });

    // ── 3. Open the project's configuration tab and verify resolved path ────
    await page.goto("/projects");
    await page.getByText(PROJECT_TITLE, { exact: false }).first().click();
    await page.getByRole("tab", { name: /configuration|설정/i }).click();

    // The card displays "현재 사용 경로:" followed by the resolved path and a
    // "(source)" tag. We expect the company root to flow through, so the path
    // should start with ROOT_PATH and the source should be company_root.
    await expect(page.locator("text=현재 사용 경로")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(`text=${ROOT_PATH}`)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=(company_root)")).toBeVisible();
  });

  test("project override switches resolved path source", async ({ page }) => {
    await page.goto("/projects");
    await page.getByText(PROJECT_TITLE, { exact: false }).first().click();
    await page.getByRole("tab", { name: /configuration|설정/i }).click();

    const overrideInput = page.locator(
      'input[placeholder*="회사 default"], input[placeholder*="company default"]',
    ).first();
    await expect(overrideInput).toBeVisible({ timeout: 10_000 });
    await overrideInput.fill(OVERRIDE_PATH);

    // Scope save click to the override card so we don't accidentally hit the
    // ProjectProperties save button rendered above it.
    const overrideCard = page.locator("div", {
      has: page.locator("h3", { hasText: "산출물 폴더 (override)" }),
    }).first();
    await overrideCard.getByRole("button", { name: /^저장$/ }).click();

    await expect(page.locator(`text=${OVERRIDE_PATH}`)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=(project_override)")).toBeVisible();
  });
});
