import type { Goal } from "@paperclipai/shared";
import { goalsApi } from "../api/goals";
import { projectsApi } from "../api/projects";
import { issuesApi } from "../api/issues";

export const ONBOARDING_PROJECT_NAME = "Onboarding";

function goalCreatedAt(goal: Goal) {
  const createdAt = goal.createdAt instanceof Date ? goal.createdAt : new Date(goal.createdAt);
  return Number.isNaN(createdAt.getTime()) ? 0 : createdAt.getTime();
}

function pickEarliestGoal(goals: Goal[]) {
  return [...goals].sort((a, b) => goalCreatedAt(a) - goalCreatedAt(b))[0] ?? null;
}

export function selectDefaultCompanyGoalId(goals: Goal[]): string | null {
  const companyGoals = goals.filter((goal) => goal.level === "company");
  const rootGoals = companyGoals.filter((goal) => !goal.parentId);
  const activeRootGoals = rootGoals.filter((goal) => goal.status === "active");

  return (
    pickEarliestGoal(activeRootGoals)?.id ??
    pickEarliestGoal(rootGoals)?.id ??
    pickEarliestGoal(companyGoals)?.id ??
    null
  );
}

export function buildOnboardingProjectPayload(goalId: string | null) {
  return {
    name: ONBOARDING_PROJECT_NAME,
    status: "in_progress" as const,
    ...(goalId ? { goalIds: [goalId] } : {}),
  };
}

export function buildOnboardingIssuePayload(input: {
  title: string;
  description: string;
  assigneeAgentId: string;
  projectId: string;
  goalId: string | null;
}) {
  const title = input.title.trim();
  const description = input.description.trim();

  return {
    title,
    ...(description ? { description } : {}),
    assigneeAgentId: input.assigneeAgentId,
    projectId: input.projectId,
    ...(input.goalId ? { goalId: input.goalId } : {}),
    status: "todo" as const,
  };
}

export async function launchOnboarding(input: {
  companyId: string;
  agentId: string;
  taskTitle: string;
  taskDescription: string;
  goalId?: string | null;
}): Promise<{ projectId: string; issueRef: string }> {
  let goalId = input.goalId ?? null;
  if (!goalId) {
    const goals = await goalsApi.list(input.companyId);
    goalId = selectDefaultCompanyGoalId(goals);
  }

  const project = await projectsApi.create(
    input.companyId,
    buildOnboardingProjectPayload(goalId),
  );
  const projectId = project.id;

  const issue = await issuesApi.create(
    input.companyId,
    buildOnboardingIssuePayload({
      title: input.taskTitle,
      description: input.taskDescription,
      assigneeAgentId: input.agentId,
      projectId,
      goalId,
    }),
  );
  const issueRef = issue.identifier ?? issue.id;

  return { projectId, issueRef };
}
