import type { Agent, Issue, IssueStatus } from "@paperclipai/shared";

export interface SeatAssignment {
  agentId: string;
  column: number; // 0-3
  row: number; // 0-4
  side: "left" | "right";
  pixelX: number;
  pixelY: number;
}

export type AgentBehavior =
  | "working"
  | "idle-walking"
  | "paused"
  | "error"
  | "pending-approval";

export interface AgentSimState {
  agent: Agent;
  seat: SeatAssignment;
  behavior: AgentBehavior;
  currentTask: string | null;
  walkTarget: { x: number; y: number } | null;
}

export interface KanbanState {
  columns: Map<IssueStatus, Issue[]>;
}

export interface AnimationEvent {
  id: string;
  type: "bubble" | "status-icon" | "particle";
  targetAgentId?: string;
  text?: string;
  icon?: string;
  createdAt: number;
}

export interface SimulationState {
  agents: Map<string, AgentSimState>;
  kanban: KanbanState;
  effects: AnimationEvent[];
  selectedAgent: string | null;
  selectedIssue: string | null;
}
