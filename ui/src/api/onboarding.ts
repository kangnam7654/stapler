import type { AdapterDetectionResult, OnboardingProgress } from "@paperclipai/shared";
import { api } from "./client";

export const onboardingApi = {
  detectAdapters: () => api.get<AdapterDetectionResult>("/adapters/detect"),

  getProgress: (companyId: string) =>
    api.get<OnboardingProgress>(`/companies/${companyId}/onboarding-progress`),
};
