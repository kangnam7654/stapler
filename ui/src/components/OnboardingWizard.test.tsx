// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import i18n from "../i18n";
import type { ReactNode } from "react";

// Radix UI Popover/Select uses browser APIs not available in jsdom
if (typeof window.HTMLElement.prototype.hasPointerCapture === "undefined") {
  Object.defineProperty(window.HTMLElement.prototype, "hasPointerCapture", {
    value: vi.fn().mockReturnValue(false),
    writable: true,
  });
}
if (typeof window.HTMLElement.prototype.setPointerCapture === "undefined") {
  Object.defineProperty(window.HTMLElement.prototype, "setPointerCapture", {
    value: vi.fn(),
    writable: true,
  });
}
if (typeof window.HTMLElement.prototype.releasePointerCapture === "undefined") {
  Object.defineProperty(window.HTMLElement.prototype, "releasePointerCapture", {
    value: vi.fn(),
    writable: true,
  });
}
if (typeof window.HTMLElement.prototype.scrollIntoView === "undefined") {
  Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
    value: vi.fn(),
    writable: true,
  });
}
if (typeof window.ResizeObserver === "undefined") {
  window.ResizeObserver = class ResizeObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  };
}

// ---- Mock all external dependencies BEFORE importing the SUT -----------

vi.mock("../api/companies", () => ({
  companiesApi: {
    create: vi.fn(),
    update: vi.fn(),
  },
}));
vi.mock("../api/goals", () => ({
  goalsApi: {
    create: vi.fn(),
    list: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock("../api/agents", () => ({
  agentsApi: {
    create: vi.fn(),
    update: vi.fn(),
    adapterModels: vi.fn().mockResolvedValue([]),
    testEnvironment: vi.fn().mockResolvedValue({
      status: "pass",
      checks: [],
      testedAt: new Date().toISOString(),
    }),
  },
}));
vi.mock("../api/onboarding", () => ({
  onboardingApi: {
    detectAdapters: vi.fn().mockResolvedValue({
      detected: [],
      recommended: null,
    }),
  },
}));
vi.mock("@/lib/router", () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: "/" }),
  useParams: () => ({}),
}));
vi.mock("../context/DialogContext", () => ({
  useDialog: () => ({
    onboardingOpen: true,
    onboardingOptions: { initialStep: 1 },
    closeOnboarding: vi.fn(),
  }),
}));
vi.mock("./AsciiArtAnimation", () => ({
  AsciiArtAnimation: () => null,
}));

// Settable companies array so tests can inject "the just-created company"
let mockCompanies: Array<{ id: string; adapterDefaults: unknown }> = [];
vi.mock("../context/CompanyContext", () => ({
  useCompany: () => ({
    companies: mockCompanies,
    setSelectedCompanyId: vi.fn(),
    loading: false,
  }),
}));

import { OnboardingWizard } from "./OnboardingWizard";
import { companiesApi } from "../api/companies";
import { agentsApi } from "../api/agents";

const mockCreate = vi.mocked(companiesApi.create);
const mockUpdate = vi.mocked(companiesApi.update);
const mockAgentCreate = vi.mocked(agentsApi.create);

function renderWizard() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={qc}>
        <OnboardingWizard />
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

async function completeStep1(companyId = "co-1", existingDefaults: unknown = null) {
  mockCreate.mockResolvedValueOnce({
    id: companyId,
    issuePrefix: "CO1",
    adapterDefaults: existingDefaults,
  } as never);
  // Inject the created company into the companies array so handleStep2Next can read it
  mockCompanies = [{ id: companyId, adapterDefaults: existingDefaults }];

  const user = userEvent.setup();
  await user.type(screen.getByPlaceholderText("Acme Corp"), "TestCo");
  // Click the first "다음/Next" button
  const nextButtons = screen.getAllByRole("button", { name: /다음|Next/i });
  await user.click(nextButtons[0]);

  // Wait for step 2 to appear
  await waitFor(() => {
    expect(screen.getByPlaceholderText("CEO")).toBeTruthy();
  });
}

async function selectAdapterAndContinue(opts: {
  adapterType: string;
  url?: string;
  model?: string;
}) {
  const user = userEvent.setup();

  // Wait for adapter detection to finish (the loading spinner disappears when done)
  // so the recommendation panel is stable before opening the advanced section.
  await waitFor(() => {
    expect(screen.queryByText("설치된 도구를 감지하고 있습니다...")).toBeNull();
  });

  // Open the advanced section to access full adapter list
  const advancedToggle = screen.getByRole("button", { name: /고급 설정|Advanced/i });
  await user.click(advancedToggle);

  // Select the requested adapter type. Adapter buttons are labeled with their
  // human name in the advanced panel; map adapterType → label.
  // Note: the recommendation panel also shows adapter buttons with slightly
  // different labels (e.g. "Google (Gemini)", "(Ollama)"), so we use specific
  // patterns that uniquely match the advanced-panel buttons.
  // Use substrings that uniquely identify the advanced-panel buttons.
  // The recommendation panel has different labels (e.g. "Google (Gemini)",
  // "설치 불필요 (Ollama)"), so these patterns only match advanced-panel items.
  const adapterLabels: Record<string, RegExp> = {
    lm_studio_local: /LM Studio/i,
    ollama_local:    /^Ollama/i,
    claude_local:    /Claude Code/i,
    codex_local:     /^Codex/i,
    gemini_local:    /Gemini CLI/i,
  };
  const label = adapterLabels[opts.adapterType];
  if (!label) throw new Error(`Add label for ${opts.adapterType}`);
  await user.click(screen.getByRole("button", { name: label }));

  // Fill URL if applicable (only LM Studio / Ollama have the URL input)
  if (opts.url !== undefined) {
    const urlInput = screen.queryByPlaceholderText(/Base URL|http:|ws:/);
    if (urlInput) {
      await user.clear(urlInput);
      await user.type(urlInput, opts.url);
    }
  }

  if (opts.model !== undefined) {
    const modelTriggers = screen.queryAllByRole("button", { name: /기본값|default|모델 선택|Choose model/i });
    if (modelTriggers.length > 0) {
      await user.click(modelTriggers[0]);
      const search = await screen.findByPlaceholderText(/검색|Search/);
      await user.type(search, opts.model);
      await user.keyboard("{Escape}");
    }
  }

  mockAgentCreate.mockResolvedValueOnce({ id: "agent-1" } as never);
  mockUpdate.mockResolvedValue({ id: "co-1", adapterDefaults: {} } as never);

  const nextButtons = screen.getAllByRole("button", { name: /다음|Next/i });
  await user.click(nextButtons[nextButtons.length - 1]);
}

afterEach(() => {
  cleanup();
  mockCreate.mockReset();
  mockUpdate.mockReset();
  mockAgentCreate.mockReset();
  mockCompanies = [];
});

describe("OnboardingWizard step 2 — company adapter defaults", () => {
  // W-1
  it("PATCHes company adapterDefaults with baseUrl for LM Studio when URL is provided", async () => {
    renderWizard();
    await completeStep1();
    await selectAdapterAndContinue({
      adapterType: "lm_studio_local",
      url: "http://10.0.0.1:1234",
    });

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith("co-1", {
        adapterDefaults: {
          lm_studio_local: { baseUrl: "http://10.0.0.1:1234" },
        },
      });
    });

    expect(mockAgentCreate).toHaveBeenCalled();
    const agentCallArgs = mockAgentCreate.mock.calls[0]![1];
    // The agent config must NOT store baseUrl — the URL was already written to
    // company.adapterDefaults, and the agent inherits it via deep merge.
    expect(agentCallArgs.adapterConfig).not.toHaveProperty("baseUrl");
  });

  // W-2
  it("PATCHes company adapterDefaults with baseUrl for Ollama when URL is provided", async () => {
    renderWizard();
    await completeStep1();
    await selectAdapterAndContinue({
      adapterType: "ollama_local",
      url: "http://10.0.0.1:11434",
    });

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith("co-1", {
        adapterDefaults: {
          ollama_local: { baseUrl: "http://10.0.0.1:11434" },
        },
      });
    });

    const agentCallArgs = mockAgentCreate.mock.calls[0]![1];
    expect(agentCallArgs.adapterConfig).not.toHaveProperty("baseUrl");
  });

  // W-5
  it("does NOT PATCH company adapterDefaults for out-of-scope adapter (Gemini)", async () => {
    renderWizard();
    await completeStep1();
    await selectAdapterAndContinue({ adapterType: "gemini_local" });

    await waitFor(() => {
      expect(mockAgentCreate).toHaveBeenCalled();
    });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  // W-6
  it("does NOT PATCH company adapterDefaults when LM Studio is selected without a URL", async () => {
    renderWizard();
    await completeStep1();
    await selectAdapterAndContinue({ adapterType: "lm_studio_local" /* no url */ });

    await waitFor(() => {
      expect(mockAgentCreate).toHaveBeenCalled();
    });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  // W-7
  it("preserves existing adapterDefaults from other adapters when PATCHing", async () => {
    renderWizard();
    await completeStep1("co-1", {
      ollama_local: { baseUrl: "http://existing-ollama:11434" },
    });
    await selectAdapterAndContinue({
      adapterType: "lm_studio_local",
      url: "http://10.0.0.1:1234",
    });

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith("co-1", {
        adapterDefaults: {
          ollama_local: { baseUrl: "http://existing-ollama:11434" },
          lm_studio_local: { baseUrl: "http://10.0.0.1:1234" },
        },
      });
    });
  });

  // W-8
  it("does NOT create the agent if PATCHing company adapterDefaults fails", async () => {
    renderWizard();
    await completeStep1();
    mockUpdate.mockReset();
    mockUpdate.mockRejectedValueOnce(new Error("network down"));

    await selectAdapterAndContinue({
      adapterType: "lm_studio_local",
      url: "http://10.0.0.1:1234",
    });

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalled();
    });
    expect(mockAgentCreate).not.toHaveBeenCalled();
    expect(screen.getByText(/network down/)).toBeTruthy();
  });
});
