import { test, expect } from "@playwright/test";

test.describe("IssueWakeButton", () => {
  // Track every company we seed so we can clean up even when an assertion
  // fails partway through (the inline cleanup at the end of the test would
  // otherwise be skipped, leaking rows into the dev DB).
  const seededCompanyIds: string[] = [];

  test.afterEach(async ({ request }) => {
    const ids = seededCompanyIds.splice(0);
    for (const id of ids) {
      await request.delete(`/api/companies/${id}`).catch(() => {});
    }
  });

  test("wakes the assigned agent with issueId payload", async ({ page, request }) => {
    // Seed: company + agent (codex_local — cheap, never invoked here) + issue.
    const companyResp = await request.post("/api/companies", {
      data: {
        name: `E2E Wake ${Date.now()}`,
        requireBoardApprovalForNewAgents: false,
      },
    });
    expect(companyResp.ok()).toBeTruthy();
    const company = await companyResp.json();
    seededCompanyIds.push(company.id);

    const agentResp = await request.post(`/api/companies/${company.id}/agents`, {
      data: {
        name: "Wake Tester",
        role: "engineer",
        adapterType: "codex_local",
        adapterConfig: {},
        runtimeConfig: {},
        permissions: {},
      },
    });
    expect(agentResp.ok()).toBeTruthy();
    const agent = await agentResp.json();

    const issueResp = await request.post(`/api/companies/${company.id}/issues`, {
      data: {
        title: "E2E Wake Issue",
        status: "todo",
        priority: "medium",
        assigneeAgentId: agent.id,
      },
    });
    expect(issueResp.ok()).toBeTruthy();
    const issue = await issueResp.json();

    // Stub wakeup so the test never invokes a real LLM. RegExp (not glob) is
    // required because the actual URL carries `?companyId=...`.
    let wakeupCalls = 0;
    let lastWakeupBody: unknown = null;
    await page.route(new RegExp(`/api/agents/${agent.id}/wakeup`), async (route) => {
      wakeupCalls++;
      lastWakeupBody = JSON.parse(route.request().postData() || "{}");
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({ id: "stubbed-run", agentId: agent.id, status: "queued" }),
      });
    });

    // active-run stays null so we hit the fresh-wake path (not the restart dialog).
    await page.route(new RegExp(`/api/issues/${issue.id}/active-run`), async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "null",
      });
    });

    await page.goto(`/issues/${issue.id}`);

    const wakeBtn = page.getByRole("button", { name: "지금 처리하기" }).first();
    await expect(wakeBtn).toBeVisible();
    await wakeBtn.click();

    await expect(page.getByText("이슈 처리를 요청했습니다")).toBeVisible({ timeout: 5000 });
    expect(wakeupCalls).toBe(1);
    expect(lastWakeupBody).toMatchObject({
      source: "on_demand",
      triggerDetail: "manual",
      reason: "manual_wake_from_issue",
      payload: { issueId: issue.id },
    });
  });
});
