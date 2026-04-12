import { eq, and, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, issues, activityLog, companies } from "@paperclipai/db";
import type { OnboardingProgress } from "@paperclipai/shared";

export interface OnboardingProgressInput {
  hasCompany: boolean;
  agentCount: number;
  issueCount: number;
  hasAgentActivity: boolean;
  hasBudget: boolean;
}

export function deriveOnboardingProgress(input: OnboardingProgressInput): OnboardingProgress {
  const completed: number[] = [];

  if (input.hasCompany) completed.push(1);
  if (input.agentCount >= 1) completed.push(2);
  if (input.issueCount >= 1) completed.push(3);
  if (input.hasAgentActivity) completed.push(4);
  if (input.agentCount >= 2) completed.push(5);
  if (input.hasBudget) completed.push(6);

  const currentStep = completed.length > 0
    ? Math.max(...completed) + 1
    : 1;

  return { completedSteps: completed, totalSteps: 6, currentStep };
}

export async function getOnboardingProgress(
  db: Db,
  companyId: string,
): Promise<OnboardingProgress> {
  const [agentCountResult, issueCountResult, activityResult, companyResult] =
    await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(agents)
        .where(eq(agents.companyId, companyId))
        .then((rows) => rows[0]?.count ?? 0),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(issues)
        .where(eq(issues.companyId, companyId))
        .then((rows) => rows[0]?.count ?? 0),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(activityLog)
        .where(
          and(
            eq(activityLog.companyId, companyId),
            eq(activityLog.actorType, "agent"),
          ),
        )
        .then((rows) => (rows[0]?.count ?? 0) > 0),
      db
        .select({ budgetMonthlyCents: companies.budgetMonthlyCents })
        .from(companies)
        .where(eq(companies.id, companyId))
        .then((rows) => rows[0] ?? null),
    ]);

  return deriveOnboardingProgress({
    hasCompany: true,
    agentCount: agentCountResult,
    issueCount: issueCountResult,
    hasAgentActivity: activityResult,
    hasBudget: (companyResult?.budgetMonthlyCents ?? 0) > 0,
  });
}
