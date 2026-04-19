// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Issue } from "@paperclipai/shared";
import { ToastProvider } from "../context/ToastContext";

vi.mock("../api/heartbeats", () => ({
  heartbeatsApi: {
    activeRunForIssue: vi.fn(),
    cancel: vi.fn(),
  },
}));
vi.mock("../api/agents", () => ({
  agentsApi: {
    wakeup: vi.fn(),
  },
}));

const mockPushToast = vi.fn();
vi.mock("../context/ToastContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../context/ToastContext")>();
  return {
    ...actual,
    useToast: () => ({
      pushToast: mockPushToast,
      toasts: [],
      dismissToast: vi.fn(),
      clearToasts: vi.fn(),
    }),
  };
});

import { IssueWakeButton } from "./IssueWakeButton";
import { heartbeatsApi } from "../api/heartbeats";
import { agentsApi } from "../api/agents";

const mockActiveRun = vi.mocked(heartbeatsApi.activeRunForIssue);
const mockCancel = vi.mocked(heartbeatsApi.cancel);
const mockWakeup = vi.mocked(agentsApi.wakeup);

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: "issue-1",
    companyId: "company-1",
    issueKey: "T1-1",
    title: "Test issue",
    description: null,
    status: "todo",
    priority: "medium",
    assigneeAgentId: "agent-1",
    assigneeUserId: null,
    createdByAgentId: null,
    createdByUserId: "user-1",
    projectId: null,
    parentIssueId: null,
    estimateMinutes: null,
    spentMinutes: null,
    labels: [],
    metadata: null,
    archivedAt: null,
    archivedByUserId: null,
    archivedByAgentId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as unknown as Issue;
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={makeQueryClient()}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mockActiveRun.mockResolvedValue(null);
  mockCancel.mockResolvedValue(undefined as unknown as void);
  mockWakeup.mockResolvedValue({ id: "run-new" } as never);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("IssueWakeButton — visibility & idle render", () => {
  it("renders nothing when issue has no assignee", () => {
    const { container } = render(
      <IssueWakeButton issue={makeIssue({ assigneeAgentId: null })} />,
      { wrapper: Wrapper },
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the wake button when issue has an assignee", async () => {
    render(<IssueWakeButton issue={makeIssue()} />, { wrapper: Wrapper });
    const btn = await screen.findByRole("button", { name: "에이전트 깨우기" });
    expect(btn).toBeTruthy();
  });
});

describe("IssueWakeButton — fresh wake (no active run)", () => {
  it("calls agentsApi.wakeup with issueId payload and shows success toast", async () => {
    const user = userEvent.setup();
    render(<IssueWakeButton issue={makeIssue()} />, { wrapper: Wrapper });

    const btn = await screen.findByRole("button", { name: "에이전트 깨우기" });
    await user.click(btn);

    await waitFor(() => {
      expect(mockWakeup).toHaveBeenCalledWith(
        "agent-1",
        {
          source: "on_demand",
          triggerDetail: "manual",
          reason: "manual_wake_from_issue",
          payload: { issueId: "issue-1" },
        },
        "company-1",
      );
    });

    await waitFor(() => {
      expect(mockPushToast).toHaveBeenCalledWith({
        tone: "success",
        title: "에이전트를 깨웠습니다",
      });
    });
  });
});
