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

import type { ActiveRunForIssue } from "../api/heartbeats";

function makeActiveRun(): ActiveRunForIssue {
  return {
    id: "run-prev",
    companyId: "company-1",
    agentId: "agent-1",
    agentName: "Tester",
    adapterType: "codex_local",
    invocationSource: "automation",
    triggerDetail: "system",
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
    wakeupRequestId: null,
    exitCode: null,
    signal: null,
    usageJson: null,
    resultJson: null,
    sessionIdBefore: null,
    sessionIdAfter: null,
    logStore: "local_file",
    logRef: "x",
    logBytes: 0,
    logSha256: null,
    logCompressed: false,
    stdoutExcerpt: null,
    stderrExcerpt: null,
    errorCode: null,
    externalRunId: null,
    processPid: null,
    processStartedAt: null,
    retryOfRunId: null,
    processLossRetryCount: 0,
    contextSnapshot: { issueId: "issue-1" },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as unknown as ActiveRunForIssue;
}

describe("IssueWakeButton — active-run state", () => {
  it("uses the active-run aria-label and shows green pulse", async () => {
    mockActiveRun.mockResolvedValue(makeActiveRun());
    render(<IssueWakeButton issue={makeIssue()} />, { wrapper: Wrapper });
    const btn = await screen.findByRole("button", { name: "현재 실행 중 — 클릭하면 재시작" });
    expect(btn).toBeTruthy();
    const icon = btn.querySelector("svg");
    // SVG className is SVGAnimatedString in jsdom — use getAttribute("class") for string assertions
    const iconClass = icon?.getAttribute("class") ?? "";
    expect(iconClass).toContain("text-green-500");
    expect(iconClass).toContain("animate-pulse");
  });

  it("opens confirm dialog when clicked while active; cancel does nothing", async () => {
    mockActiveRun.mockResolvedValue(makeActiveRun());
    const user = userEvent.setup();
    render(<IssueWakeButton issue={makeIssue()} />, { wrapper: Wrapper });

    const btn = await screen.findByRole("button", { name: "현재 실행 중 — 클릭하면 재시작" });
    await user.click(btn);

    expect(await screen.findByText("현재 실행 중입니다")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "취소" }));
    expect(mockCancel).not.toHaveBeenCalled();
    expect(mockWakeup).not.toHaveBeenCalled();
  });

  it("confirm restart cancels the previous run then wakes; restart toast appears", async () => {
    mockActiveRun.mockResolvedValue(makeActiveRun());
    const user = userEvent.setup();
    render(<IssueWakeButton issue={makeIssue()} />, { wrapper: Wrapper });

    const btn = await screen.findByRole("button", { name: "현재 실행 중 — 클릭하면 재시작" });
    await user.click(btn);
    await user.click(await screen.findByRole("button", { name: "재시작" }));

    await waitFor(() => expect(mockCancel).toHaveBeenCalledWith("run-prev"));
    await waitFor(() => expect(mockWakeup).toHaveBeenCalled());

    // cancel must run before wakeup
    const cancelOrder = mockCancel.mock.invocationCallOrder[0];
    const wakeupOrder = mockWakeup.mock.invocationCallOrder[0];
    expect(cancelOrder).toBeLessThan(wakeupOrder);

    await waitFor(() => {
      expect(mockPushToast).toHaveBeenCalledWith({
        tone: "success",
        title: "이전 run을 취소하고 새로 시작했습니다",
      });
    });
  });

  it("aborts wakeup if cancel(prevRunId) fails; surfaces cancel error toast", async () => {
    mockActiveRun.mockResolvedValue(makeActiveRun());
    mockCancel.mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    render(<IssueWakeButton issue={makeIssue()} />, { wrapper: Wrapper });

    await user.click(await screen.findByRole("button", { name: "현재 실행 중 — 클릭하면 재시작" }));
    await user.click(await screen.findByRole("button", { name: "재시작" }));

    await waitFor(() => {
      expect(mockPushToast).toHaveBeenCalledWith({
        tone: "error",
        title: "이전 run 취소 실패",
        body: "boom",
      });
    });
    expect(mockWakeup).not.toHaveBeenCalled();
  });
});
