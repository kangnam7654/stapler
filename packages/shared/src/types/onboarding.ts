export interface AdapterDetectionItem {
  type: string;
  name: string;
  version?: string;
  defaultModel: string;
  connectionInfo: {
    command?: string;
    args?: string[];
    baseUrl?: string;
  };
}

export interface AdapterDetectionResult {
  detected: AdapterDetectionItem[];
  recommended: AdapterDetectionItem | null;
}

export interface OnboardingProgress {
  completedSteps: number[];
  totalSteps: number;
  currentStep: number;
}
