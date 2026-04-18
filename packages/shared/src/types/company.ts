import type { CompanyStatus, PauseReason } from "../constants.js";

/**
 * Partial adapter config at the company-default level. Named fields
 * (`baseUrl`, `apiKey`) preserve legacy ergonomics for LMStudio/Ollama
 * callers, while the index signature allows any additional adapter field
 * (model, tuning, etc.) to live here.
 */
export interface AdapterEndpoint {
  baseUrl?: string;
  apiKey?: unknown;
  [field: string]: unknown;
}

/**
 * Company-level defaults per adapter provider. Each provider entry holds a
 * partial AdapterConfig; unset fields fall through to agent-level config and
 * vice versa. See `resolveAgentAdapterConfig` in `../adapter-config.ts`.
 */
export interface CompanyAdapterDefaults {
  lm_studio_local?: AdapterEndpoint;
  ollama_local?: AdapterEndpoint;
  [providerId: string]: AdapterEndpoint | undefined;
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
  workspaceRootPath: string | null;
  createdAt: Date;
  updatedAt: Date;
}
