import { api } from "./client";

// ─── Input types (mirrors server Zod schemas) ─────────────────────────────────

export interface BulkApplyInheritInput {
  mode: "inherit";
  agentIds: string[];
  fields: string[];
}

export interface BulkApplyOverrideInput {
  mode: "override";
  agentIds: string[];
  fields: Record<string, unknown>;
}

export interface BulkApplySwapAdapterInput {
  mode: "swap-adapter";
  agentIds: string[];
  newAdapterType: string;
  newAdapterConfig: Record<string, unknown>;
}

export type BulkApplyInput =
  | BulkApplyInheritInput
  | BulkApplyOverrideInput
  | BulkApplySwapAdapterInput;

// ─── Result type (mirrors server BulkApplyResult) ─────────────────────────────

export interface BulkApplyResult {
  updatedAgentIds: string[];
  mode: "inherit" | "override" | "swap-adapter";
}

// ─── API client ───────────────────────────────────────────────────────────────

/**
 * POST /api/companies/:companyId/agents/bulk-apply
 *
 * Applies a config change to multiple agents at once. Three modes:
 *   - inherit: strip named fields so agents inherit from company defaults
 *   - override: set named fields on each agent's adapterConfig
 *   - swap-adapter: replace adapterType + adapterConfig wholesale
 *
 * Board-only endpoint. All updates run in a single transaction (all-or-nothing).
 */
export async function bulkApplyAgentConfig(
  companyId: string,
  payload: BulkApplyInput,
): Promise<BulkApplyResult> {
  const response = await api.post<{ data: BulkApplyResult }>(
    `/companies/${encodeURIComponent(companyId)}/agents/bulk-apply`,
    payload,
  );
  return response.data;
}
