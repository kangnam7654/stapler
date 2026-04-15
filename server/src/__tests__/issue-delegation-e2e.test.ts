import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  activityLog,
  agents,
  companies,
  createDb,
  heartbeatRuns,
  issues,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { issueService } from "../services/issues.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres issue delegation tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("issue delegation end-to-end", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-issue-delegation-");
    db = createDb(tempDb.connectionString);
  }, 20_000);

  afterEach(async () => {
    await db.delete(activityLog);
    await db.delete(issues);
    await db.delete(heartbeatRuns);
    await db.delete(agents);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function seedCompanyWithAgents() {
    const companyId = randomUUID();
    const issuePrefix = `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
    const ceoId = randomUUID();
    const cLevelId = randomUUID();
    const employeeId = randomUUID();

    await db.execute(sql`
      insert into companies (
        id, name, issue_prefix, require_board_approval_for_new_agents,
        budget_monthly_cents, spent_monthly_cents
      ) values (
        ${companyId}, ${"Delegation Smoke Co"}, ${issuePrefix}, ${false},
        ${0}, ${0}
      )
    `);

    await db.execute(sql`
      insert into agents (
        id, company_id, name, role, title, reports_to, status,
        adapter_type, adapter_config, runtime_config, permissions
      ) values
      (
        ${ceoId}, ${companyId}, ${"CEO"}, ${"ceo"}, ${"Chief Executive Officer"}, ${null}, ${"active"},
        ${"codex_local"}, ${JSON.stringify({})}::jsonb, ${JSON.stringify({})}::jsonb, ${JSON.stringify({})}::jsonb
      ),
      (
        ${cLevelId}, ${companyId}, ${"TEST C-Level"}, ${"chro"}, ${"Test C-Level"}, ${ceoId}, ${"active"},
        ${"codex_local"}, ${JSON.stringify({})}::jsonb, ${JSON.stringify({})}::jsonb, ${JSON.stringify({})}::jsonb
      ),
      (
        ${employeeId}, ${companyId}, ${"General Employee"}, ${"engineer"}, ${"Engineer"}, ${cLevelId}, ${"active"},
        ${"codex_local"}, ${JSON.stringify({})}::jsonb, ${JSON.stringify({})}::jsonb, ${JSON.stringify({})}::jsonb
      )
    `);

    return { companyId, ceoId, cLevelId, employeeId };
  }

  it("creates an issue, delegates it through a C-level, and completes it as the employee", async () => {
    const { companyId, ceoId, cLevelId, employeeId } = await seedCompanyWithAgents();
    const svc = issueService(db);
    const issueTitle = "Smoke test delegated issue";
    const issueDescription = "Prove company, delegation, checkout, and done flow works end-to-end.";
    const employeeRunId = randomUUID();

    await db.insert(heartbeatRuns).values({
      id: employeeRunId,
      companyId,
      agentId: employeeId,
      invocationSource: "assignment",
      triggerDetail: "system",
      status: "running",
      startedAt: new Date("2026-04-15T00:00:00.000Z"),
      updatedAt: new Date("2026-04-15T00:00:00.000Z"),
      contextSnapshot: {},
    });

    const created = await svc.create(companyId, {
      title: issueTitle,
      description: issueDescription,
      priority: "high",
      status: "todo",
      assigneeAgentId: ceoId,
      createdByAgentId: ceoId,
      createdByUserId: null,
      originKind: "manual",
      requestDepth: 0,
    } as any);

    expect(created.title).toBe(issueTitle);
    expect(created.assigneeAgentId).toBe(ceoId);
    expect(created.status).toBe("todo");

    const delegatedToCLevel = await svc.update(created.id, {
      assigneeAgentId: cLevelId,
    } as any);
    expect(delegatedToCLevel?.assigneeAgentId).toBe(cLevelId);
    expect(delegatedToCLevel?.status).toBe("todo");

    const delegatedToEmployee = await svc.update(created.id, {
      assigneeAgentId: employeeId,
    } as any);
    expect(delegatedToEmployee?.assigneeAgentId).toBe(employeeId);
    expect(delegatedToEmployee?.status).toBe("todo");

    const checkedOut = await svc.checkout(created.id, employeeId, ["todo"], employeeRunId);
    expect(checkedOut?.assigneeAgentId).toBe(employeeId);
    expect(checkedOut?.status).toBe("in_progress");
    expect(checkedOut?.checkoutRunId).toBe(employeeRunId);
    expect(checkedOut?.executionRunId).toBe(employeeRunId);

    const done = await svc.update(created.id, {
      status: "done",
    } as any);
    expect(done?.status).toBe("done");
    expect(done?.assigneeAgentId).toBe(employeeId);
    expect(done?.checkoutRunId).toBeNull();
    expect(done?.executionRunId).toBeNull();

    const issue = await db
      .select()
      .from(issues)
      .where(eq(issues.id, created.id))
      .then((rows) => rows[0] ?? null);

    expect(issue).toMatchObject({
      id: created.id,
      companyId,
      title: issueTitle,
      status: "done",
      assigneeAgentId: employeeId,
      checkoutRunId: null,
      executionRunId: null,
    });
  });
});
