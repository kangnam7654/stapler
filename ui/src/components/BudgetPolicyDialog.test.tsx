// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import type { BudgetPolicySummary, Agent, Project } from "@paperclipai/shared";
import i18n from "../i18n";

// Radix UI Select uses browser APIs not fully available in jsdom
Object.defineProperty(window.HTMLElement.prototype, "hasPointerCapture", {
  value: vi.fn().mockReturnValue(false),
  writable: true,
});
Object.defineProperty(window.HTMLElement.prototype, "setPointerCapture", {
  value: vi.fn(),
  writable: true,
});
Object.defineProperty(window.HTMLElement.prototype, "releasePointerCapture", {
  value: vi.fn(),
  writable: true,
});
Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
  value: vi.fn(),
  writable: true,
});
// ResizeObserver is used by Radix Tooltip/Select
if (typeof window.ResizeObserver === "undefined") {
  window.ResizeObserver = class ResizeObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  };
}

vi.mock("../api/agents", () => ({
  agentsApi: {
    list: vi.fn(),
  },
}));
vi.mock("../api/projects", () => ({
  projectsApi: {
    list: vi.fn(),
  },
}));
vi.mock("../api/budgets", () => ({
  budgetsApi: {
    upsertPolicy: vi.fn(),
  },
}));

import { BudgetPolicyDialog } from "./BudgetPolicyDialog";
import { agentsApi } from "../api/agents";
import { projectsApi } from "../api/projects";
import { budgetsApi } from "../api/budgets";

const mockAgentsList = vi.mocked(agentsApi.list);
const mockProjectsList = vi.mocked(projectsApi.list);
const mockUpsertPolicy = vi.mocked(budgetsApi.upsertPolicy);

function makeAgent(id: string, name: string): Agent {
  return {
    id,
    companyId: "company-1",
    name,
    role: null,
    title: null,
    status: "active",
    adapterType: "claude_cli",
    adapterConfig: {},
    urlKey: id,
    issuePrefix: null,
    canCreateAgents: false,
    canAssignTasks: false,
    budgetMonthlyCents: null,
    seatPriceCents: null,
    isHirable: false,
    hireApprovalRequired: false,
    hireTemplate: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as Agent;
}

function makeProject(id: string, name: string): Project {
  return {
    id,
    companyId: "company-1",
    name,
    description: null,
    status: "active",
    urlKey: id,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as Project;
}

function makeExistingPolicy(
  scopeType: BudgetPolicySummary["scopeType"],
  scopeId: string,
): BudgetPolicySummary {
  return {
    policyId: `policy-${scopeId}`,
    companyId: "company-1",
    scopeType,
    scopeId,
    scopeName: scopeId,
    metric: "spend",
    windowKind: scopeType === "project" ? "lifetime" : "calendar_month_utc",
    amount: 10000,
    observedAmount: 0,
    remainingAmount: 10000,
    utilizationPercent: 0,
    warnPercent: 80,
    hardStopEnabled: true,
    notifyEnabled: true,
    isActive: true,
    status: "healthy",
    paused: false,
    pauseReason: null,
  } as unknown as BudgetPolicySummary;
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={makeQueryClient()}>
      <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
    </QueryClientProvider>
  );
}

function renderDialog(
  props: Partial<React.ComponentProps<typeof BudgetPolicyDialog>> = {},
) {
  const defaults: React.ComponentProps<typeof BudgetPolicyDialog> = {
    open: true,
    onOpenChange: vi.fn(),
    companyId: "company-1",
    existingPolicies: [],
    ...props,
  };
  return render(<BudgetPolicyDialog {...defaults} />, { wrapper: Wrapper });
}

beforeEach(() => {
  mockAgentsList.mockResolvedValue([]);
  mockProjectsList.mockResolvedValue([]);
  mockUpsertPolicy.mockResolvedValue({} as BudgetPolicySummary);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("BudgetPolicyDialog", () => {
  it("renders with company scope selected by default", () => {
    renderDialog();
    expect(screen.getByRole("button", { name: /회사/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /에이전트/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /프로젝트/i })).toBeTruthy();
    expect(screen.getByPlaceholderText("0.00")).toBeTruthy();
  });

  it("switching scope to agent triggers agent list query", async () => {
    const agent = makeAgent("agent-1", "TestAgent");
    mockAgentsList.mockResolvedValue([agent]);

    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: /에이전트/i }));

    await waitFor(() => {
      expect(mockAgentsList).toHaveBeenCalledWith("company-1");
    });
  });

  it("shows no-available-targets message when all agents already have policies", async () => {
    const agent = makeAgent("agent-1", "AlreadySet");
    mockAgentsList.mockResolvedValue([agent]);
    const existingPolicies = [makeExistingPolicy("agent", "agent-1")];

    const user = userEvent.setup();
    renderDialog({ existingPolicies });

    await user.click(screen.getByRole("button", { name: /에이전트/i }));

    await waitFor(() => {
      expect(screen.getByText(/선택 가능한 항목이 없습니다/)).toBeTruthy();
    });
  });

  it("shows validation error when submitting with empty amount", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: /예산 추가/i }));

    await waitFor(() => {
      expect(screen.getByText("유효한 금액을 입력하세요.")).toBeTruthy();
    });
    expect(mockUpsertPolicy).not.toHaveBeenCalled();
  });

  it("calls upsertPolicy with correct args for company scope", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    renderDialog({ onOpenChange });

    await user.type(screen.getByPlaceholderText("0.00"), "10.00");
    await user.click(screen.getByRole("button", { name: /예산 추가/i }));

    await waitFor(() => {
      expect(mockUpsertPolicy).toHaveBeenCalledWith("company-1", {
        scopeType: "company",
        scopeId: "company-1",
        amount: 1000,
        windowKind: "calendar_month_utc",
      });
    });
  });

  it("calls upsertPolicy with agent windowKind=calendar_month_utc for agent scope", async () => {
    const agent = makeAgent("agent-2", "MyAgent");
    mockAgentsList.mockResolvedValue([agent]);

    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    renderDialog({ onOpenChange });

    await user.click(screen.getByRole("button", { name: /에이전트/i }));

    // Wait for agents to load
    await waitFor(() => expect(mockAgentsList).toHaveBeenCalled());

    // Select agent via the Select trigger and option
    const trigger = screen.getByRole("combobox");
    await user.click(trigger);
    const option = await screen.findByRole("option", { name: /MyAgent/i });
    await user.click(option);

    await user.type(screen.getByPlaceholderText("0.00"), "5.00");
    await user.click(screen.getByRole("button", { name: /예산 추가/i }));

    await waitFor(() => {
      expect(mockUpsertPolicy).toHaveBeenCalledWith("company-1", {
        scopeType: "agent",
        scopeId: "agent-2",
        amount: 500,
        windowKind: "calendar_month_utc",
      });
    });
  });

  it("calls upsertPolicy with windowKind=lifetime for project scope", async () => {
    const project = makeProject("project-1", "MyProject");
    mockProjectsList.mockResolvedValue([project]);

    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    renderDialog({ onOpenChange });

    await user.click(screen.getByRole("button", { name: /프로젝트/i }));

    await waitFor(() => expect(mockProjectsList).toHaveBeenCalled());

    const trigger = screen.getByRole("combobox");
    await user.click(trigger);
    const option = await screen.findByRole("option", { name: /MyProject/i });
    await user.click(option);

    await user.type(screen.getByPlaceholderText("0.00"), "20.00");
    await user.click(screen.getByRole("button", { name: /예산 추가/i }));

    await waitFor(() => {
      expect(mockUpsertPolicy).toHaveBeenCalledWith("company-1", {
        scopeType: "project",
        scopeId: "project-1",
        amount: 2000,
        windowKind: "lifetime",
      });
    });
  });

  it("calls onOpenChange(false) on successful save", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    renderDialog({ onOpenChange });

    await user.type(screen.getByPlaceholderText("0.00"), "10.00");
    await user.click(screen.getByRole("button", { name: /예산 추가/i }));

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
