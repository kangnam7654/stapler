import { describe, it, expect } from "vitest";
import { deriveOnboardingProgress } from "../services/onboarding-progress.js";

describe("deriveOnboardingProgress", () => {
  it("returns all incomplete when counts are zero", () => {
    const result = deriveOnboardingProgress({
      hasCompany: false,
      agentCount: 0,
      issueCount: 0,
      hasAgentActivity: false,
      hasBudget: false,
    });
    expect(result.completedSteps).toEqual([]);
    expect(result.currentStep).toBe(1);
    expect(result.totalSteps).toBe(6);
  });

  it("marks steps 1-3 complete after onboarding wizard", () => {
    const result = deriveOnboardingProgress({
      hasCompany: true,
      agentCount: 1,
      issueCount: 1,
      hasAgentActivity: false,
      hasBudget: false,
    });
    expect(result.completedSteps).toEqual([1, 2, 3]);
    expect(result.currentStep).toBe(4);
  });

  it("marks step 4 complete when agent has activity", () => {
    const result = deriveOnboardingProgress({
      hasCompany: true,
      agentCount: 1,
      issueCount: 1,
      hasAgentActivity: true,
      hasBudget: false,
    });
    expect(result.completedSteps).toEqual([1, 2, 3, 4]);
    expect(result.currentStep).toBe(5);
  });

  it("marks step 5 complete when 2+ agents exist", () => {
    const result = deriveOnboardingProgress({
      hasCompany: true,
      agentCount: 2,
      issueCount: 1,
      hasAgentActivity: true,
      hasBudget: false,
    });
    expect(result.completedSteps).toEqual([1, 2, 3, 4, 5]);
    expect(result.currentStep).toBe(6);
  });

  it("marks all complete when budget is set", () => {
    const result = deriveOnboardingProgress({
      hasCompany: true,
      agentCount: 2,
      issueCount: 1,
      hasAgentActivity: true,
      hasBudget: true,
    });
    expect(result.completedSteps).toEqual([1, 2, 3, 4, 5, 6]);
    expect(result.currentStep).toBe(7);
  });
});
