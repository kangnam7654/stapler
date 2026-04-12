import { useMemo, useCallback, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Agent, Issue, IssueStatus } from "@paperclipai/shared";
import { ISSUE_STATUSES } from "@paperclipai/shared";
import { agentsApi } from "../api/agents";
import { issuesApi } from "../api/issues";
import { queryKeys } from "../lib/queryKeys";
import { getSeatPosition } from "../components/simulation/layers/layout";
import type {
  SeatAssignment,
  AgentBehavior,
  AgentSimState,
  KanbanState,
  SimulationState,
} from "../components/simulation/types";

function agentStatusToBehavior(status: Agent["status"]): AgentBehavior {
  switch (status) {
    case "active":
      return "working";
    case "idle":
      return "idle-walking";
    case "paused":
      return "paused";
    case "error":
      return "error";
    case "pending_approval":
      return "pending-approval";
    default:
      return "idle-walking";
  }
}

function assignSeats(agents: Agent[]): SeatAssignment[] {
  const eligible = agents
    .filter((a) => a.status !== "terminated")
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

  const seats: SeatAssignment[] = [];
  let index = 0;

  for (let col = 0; col < 4 && index < eligible.length; col++) {
    for (let row = 0; row < 5 && index < eligible.length; row++) {
      for (
        const side of ["left", "right"] as const
      ) {
        if (index >= eligible.length) break;
        const agent = eligible[index]!;
        const pos = getSeatPosition(col, row, side);
        seats.push({
          agentId: agent.id,
          column: col,
          row,
          side,
          pixelX: pos.x,
          pixelY: pos.y,
        });
        index++;
      }
    }
  }

  return seats;
}

function buildKanban(issues: Issue[]): KanbanState {
  const columns = new Map<IssueStatus, Issue[]>();
  for (const status of ISSUE_STATUSES) {
    columns.set(status, []);
  }
  for (const issue of issues) {
    const list = columns.get(issue.status);
    if (list) {
      list.push(issue);
    }
  }
  return { columns };
}

export function useSimulationState(companyId: string | null) {
  const queryClient = useQueryClient();

  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<string | null>(null);

  const { data: agents = [] } = useQuery({
    queryKey: queryKeys.agents.list(companyId ?? ""),
    queryFn: () => agentsApi.list(companyId!),
    enabled: !!companyId,
  });

  const { data: issues = [] } = useQuery({
    queryKey: queryKeys.issues.list(companyId ?? ""),
    queryFn: () => issuesApi.list(companyId!),
    enabled: !!companyId,
  });

  const state: SimulationState = useMemo(() => {
    const seats = assignSeats(agents);
    const seatByAgentId = new Map(seats.map((s) => [s.agentId, s]));

    const agentMap = new Map<string, AgentSimState>();
    for (const agent of agents) {
      const seat = seatByAgentId.get(agent.id);
      if (!seat) continue; // terminated agents have no seat
      agentMap.set(agent.id, {
        agent,
        seat,
        behavior: agentStatusToBehavior(agent.status),
        currentTask: null,
        walkTarget: null,
      });
    }

    const kanban = buildKanban(issues);

    return {
      agents: agentMap,
      kanban,
      effects: [],
      selectedAgent,
      selectedIssue,
    };
  }, [agents, issues, selectedAgent, selectedIssue]);

  const moveIssueMutation = useMutation({
    mutationFn: ({
      issueId,
      status,
    }: {
      issueId: string;
      status: IssueStatus;
    }) => issuesApi.update(issueId, { status }),
    onSuccess: () => {
      if (companyId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.issues.list(companyId),
        });
      }
    },
  });

  const selectAgent = useCallback((agentId: string | null) => {
    setSelectedAgent(agentId);
  }, []);

  const selectIssue = useCallback((issueId: string | null) => {
    setSelectedIssue(issueId);
  }, []);

  const moveIssue = useCallback(
    (issueId: string, status: IssueStatus) => {
      moveIssueMutation.mutate({ issueId, status });
    },
    [moveIssueMutation],
  );

  return { state, selectAgent, selectIssue, moveIssue };
}
