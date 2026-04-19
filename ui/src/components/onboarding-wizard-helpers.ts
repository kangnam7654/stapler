/**
 * Helpers for OnboardingWizard.tsx that decide which adapter config fields
 * belong to the company's `adapterDefaults` (Model A: single source of truth)
 * vs. the agent's own `adapterConfig`.
 *
 * In-scope adapter types and their fields are listed in COMPANY_DEFAULT_FIELDS.
 * Other adapter types fall through both helpers as no-ops.
 *
 * Spec: docs/superpowers/specs/2026-04-19-wizard-company-adapter-defaults-design.md
 */

export type InScopeAdapterType =
  | "lm_studio_local"
  | "ollama_local"
  | "claude_local"
  | "codex_local";

export type CompanyDefaultField = "baseUrl" | "model";

/**
 * Per in-scope adapter, the fields that the wizard should write to
 * `companies.adapterDefaults` instead of the agent's own `adapterConfig`.
 *
 * - `baseUrl`: only applicable to remote-server adapters (LM Studio, Ollama).
 * - `model`:   applicable to all four in-scope adapters.
 */
export const COMPANY_DEFAULT_FIELDS: Record<
  InScopeAdapterType,
  readonly CompanyDefaultField[]
> = {
  lm_studio_local: ["baseUrl", "model"],
  ollama_local:    ["baseUrl", "model"],
  claude_local:    ["model"],
  codex_local:     ["model"],
};

export function isInScopeAdapterType(type: string): type is InScopeAdapterType {
  return Object.prototype.hasOwnProperty.call(COMPANY_DEFAULT_FIELDS, type);
}

/**
 * Build the patch to write to `companies.adapterDefaults[adapterType]`.
 *
 * - Trims whitespace from input values.
 * - Omits any field whose trimmed value is empty.
 * - For `claude_local`/`codex_local`, ignores `url` (no baseUrl field).
 * - For out-of-scope adapter types, returns `null`.
 * - If the resulting patch would be empty, returns `null` (caller skips PATCH).
 */
export function buildCompanyAdapterDefaultsPatch(
  adapterType: string,
  values: { url: string; model: string },
): { baseUrl?: string; model?: string } | null {
  if (!isInScopeAdapterType(adapterType)) return null;
  const fields = COMPANY_DEFAULT_FIELDS[adapterType];
  const patch: { baseUrl?: string; model?: string } = {};
  if (fields.includes("baseUrl")) {
    const trimmed = values.url.trim();
    if (trimmed.length > 0) patch.baseUrl = trimmed;
  }
  if (fields.includes("model")) {
    const trimmed = values.model.trim();
    if (trimmed.length > 0) patch.model = trimmed;
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

/**
 * Remove company-default fields from an agent adapterConfig so the agent
 * inherits them via `resolveAgentAdapterConfig` deep merge.
 *
 * - Returns a NEW object; does not mutate the input.
 * - For out-of-scope adapter types, returns the input unchanged
 *   (still a shallow copy for safety).
 */
export function stripCompanyDefaultFields(
  adapterType: string,
  config: Record<string, unknown>,
): Record<string, unknown> {
  if (!isInScopeAdapterType(adapterType)) {
    return { ...config };
  }
  const fields = COMPANY_DEFAULT_FIELDS[adapterType];
  const next: Record<string, unknown> = { ...config };
  for (const key of fields) {
    delete next[key];
  }
  return next;
}
