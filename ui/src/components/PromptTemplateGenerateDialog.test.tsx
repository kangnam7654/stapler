// @vitest-environment jsdom

import type React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import i18n from "../i18n";
import { PromptTemplateGenerateDialog } from "./PromptTemplateGenerateDialog";
import * as apiModule from "../api/draftPromptTemplate";

function renderDialog(
  props: Partial<React.ComponentProps<typeof PromptTemplateGenerateDialog>> = {},
) {
  const defaultProps: React.ComponentProps<typeof PromptTemplateGenerateDialog> = {
    open: true,
    onOpenChange: vi.fn(),
    companyId: "c-1",
    requestBase: {
      adapterType: "ollama_local",
      adapterConfig: { baseUrl: "http://127.0.0.1:11434", model: "llama3" },
      name: "CTO",
      role: "cto",
      title: "Chief Technology Officer",
    },
    existingTemplate: "",
    onAccept: vi.fn(),
  };
  return render(
    <I18nextProvider i18n={i18n}>
      <PromptTemplateGenerateDialog {...defaultProps} {...props} />
    </I18nextProvider>,
  );
}

describe("PromptTemplateGenerateDialog", () => {
  beforeEach(() => {
    async function* mockStream() {
      yield { kind: "delta" as const, delta: "draft" };
      yield { kind: "delta" as const, delta: "-body" };
      yield { kind: "done" as const };
    }
    vi.spyOn(apiModule, "streamDraftPromptTemplate").mockReturnValue(mockStream());
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("starts in input state with hint textarea and Generate button", () => {
    renderDialog();
    expect(screen.getByPlaceholderText(/어떤 에이전트/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /생성/ })).toBeTruthy();
  });

  it("transitions input → streaming → done after Generate", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.type(
      screen.getByPlaceholderText(/어떤 에이전트/),
      "unblocks engineers",
    );
    await user.click(screen.getByRole("button", { name: /생성/ }));

    await waitFor(() => {
      expect(screen.getByText("draft-body")).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: /적용/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /다시 생성/ })).toBeTruthy();
  });

  it("calls onAccept with preview when template is empty", async () => {
    const onAccept = vi.fn();
    const user = userEvent.setup();
    renderDialog({ onAccept });
    await user.click(screen.getByRole("button", { name: /생성/ }));
    await waitFor(() => screen.getByRole("button", { name: /적용/ }));
    await user.click(screen.getByRole("button", { name: /적용/ }));
    expect(onAccept).toHaveBeenCalledWith("draft-body");
  });

  it("shows overwrite confirm when existingTemplate is non-empty", async () => {
    const onAccept = vi.fn();
    const user = userEvent.setup();
    renderDialog({ existingTemplate: "old content", onAccept });
    await user.click(screen.getByRole("button", { name: /생성/ }));
    await waitFor(() => screen.getByRole("button", { name: /적용/ }));
    await user.click(screen.getByRole("button", { name: /적용/ }));

    expect(screen.getByText(/덮어쓸까요/)).toBeTruthy();
    expect(onAccept).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /^덮어쓰기$/ }));
    expect(onAccept).toHaveBeenCalledWith("draft-body");
  });

  it("Regenerate returns to input state preserving hint", async () => {
    const user = userEvent.setup();
    renderDialog();
    const textarea = screen.getByPlaceholderText(
      /어떤 에이전트/,
    ) as HTMLTextAreaElement;
    await user.type(textarea, "focus on code review");
    await user.click(screen.getByRole("button", { name: /생성/ }));
    await waitFor(() => screen.getByRole("button", { name: /다시 생성/ }));
    await user.click(screen.getByRole("button", { name: /다시 생성/ }));

    const inputAgain = screen.getByPlaceholderText(
      /어떤 에이전트/,
    ) as HTMLTextAreaElement;
    expect(inputAgain.value).toBe("focus on code review");
  });
});
