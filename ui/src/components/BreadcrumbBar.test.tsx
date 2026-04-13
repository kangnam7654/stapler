// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TooltipProvider } from "@/components/ui/tooltip";

// Stub plugin system so it doesn't pull in dynamic imports
vi.mock("../plugins/slots", () => ({
  usePluginSlots: () => ({ slots: [] }),
  PluginSlotOutlet: () => null,
}));
vi.mock("../plugins/launchers", () => ({
  usePluginLaunchers: () => ({ launchers: [] }),
  PluginLauncherOutlet: () => null,
}));
vi.mock("@/lib/router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock("../context/CompanyContext", () => ({
  useCompany: () => ({ selectedCompanyId: null, selectedCompany: null }),
}));
vi.mock("../context/BreadcrumbContext", () => ({
  useBreadcrumbs: vi.fn(),
}));
vi.mock("../context/SidebarContext", () => ({
  useSidebar: vi.fn(),
}));

import { BreadcrumbBar } from "./BreadcrumbBar";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useSidebar } from "../context/SidebarContext";

const mockUseBreadcrumbs = vi.mocked(useBreadcrumbs);
const mockUseSidebar = vi.mocked(useSidebar);

const mockToggle = vi.fn();

function defaultSidebar(open = true) {
  return {
    sidebarOpen: open,
    toggleSidebar: mockToggle,
    setSidebarOpen: vi.fn(),
    isMobile: false,
  };
}

function renderBar() {
  return render(
    <TooltipProvider>
      <BreadcrumbBar />
    </TooltipProvider>,
  );
}

beforeEach(() => {
  mockUseBreadcrumbs.mockReturnValue({ breadcrumbs: [], setBreadcrumbs: vi.fn() });
  mockUseSidebar.mockReturnValue(defaultSidebar());
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("BreadcrumbBar toggle button", () => {
  it("renders toggle button when breadcrumbs is empty", () => {
    mockUseBreadcrumbs.mockReturnValue({ breadcrumbs: [], setBreadcrumbs: vi.fn() });
    renderBar();
    expect(screen.getByRole("button", { name: /sidebar/i })).toBeTruthy();
  });

  it("renders toggle button when there is 1 breadcrumb", () => {
    mockUseBreadcrumbs.mockReturnValue({
      breadcrumbs: [{ label: "비용" }],
      setBreadcrumbs: vi.fn(),
    });
    renderBar();
    expect(screen.getByRole("button", { name: /sidebar/i })).toBeTruthy();
  });

  it("renders toggle button when there are 2+ breadcrumbs", () => {
    mockUseBreadcrumbs.mockReturnValue({
      breadcrumbs: [
        { label: "Parent", href: "/parent" },
        { label: "Child" },
      ],
      setBreadcrumbs: vi.fn(),
    });
    renderBar();
    expect(screen.getByRole("button", { name: /sidebar/i })).toBeTruthy();
  });

  it("calls toggleSidebar when the button is clicked", async () => {
    const user = userEvent.setup();
    renderBar();
    await user.click(screen.getByRole("button", { name: /sidebar/i }));
    expect(mockToggle).toHaveBeenCalledTimes(1);
  });

  it("shows Collapse label when sidebar is open", () => {
    mockUseSidebar.mockReturnValue(defaultSidebar(true));
    renderBar();
    expect(screen.getByRole("button", { name: /Collapse sidebar/i })).toBeTruthy();
  });

  it("shows Expand label when sidebar is closed", () => {
    mockUseSidebar.mockReturnValue(defaultSidebar(false));
    renderBar();
    expect(screen.getByRole("button", { name: /Expand sidebar/i })).toBeTruthy();
  });
});
