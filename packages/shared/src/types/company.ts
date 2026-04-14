import type { CompanyStatus, PauseReason } from "../constants.js";

export interface AdapterEndpoint {
  baseUrl?: string;
}

export interface CompanyAdapterDefaults {
  lm_studio_local?: AdapterEndpoint;
  ollama_local?: AdapterEndpoint;
}

export interface Company {
  id: string;
  name: string;
  description: string | null;
  status: CompanyStatus;
  pauseReason: PauseReason | null;
  pausedAt: Date | null;
  issuePrefix: string;
  issueCounter: number;
  budgetMonthlyCents: number;
  spentMonthlyCents: number;
  requireBoardApprovalForNewAgents: boolean;
  brandColor: string | null;
  logoAssetId: string | null;
  logoUrl: string | null;
  adapterDefaults: CompanyAdapterDefaults | null;
  createdAt: Date;
  updatedAt: Date;
}
