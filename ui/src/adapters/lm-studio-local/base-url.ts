import type { Company } from "@paperclipai/shared";
import { DEFAULT_LM_STUDIO_BASE_URL } from "@paperclipai/adapter-lm-studio-local";

export type LmStudioBaseUrlMode = "company" | "custom";

export function resolveLmStudioCompanyBaseUrl(company: Company | null | undefined): string {
  return company?.adapterDefaults?.lm_studio_local?.baseUrl?.trim() || DEFAULT_LM_STUDIO_BASE_URL;
}

export function resolveLmStudioBaseUrlMode(
  rawMode: unknown,
  rawBaseUrl: unknown,
): LmStudioBaseUrlMode {
  if (rawMode === "custom") return "custom";
  if (rawMode === "company") return "company";
  if (typeof rawBaseUrl === "string" && rawBaseUrl.trim().length > 0) {
    return "custom";
  }
  return "company";
}

export function resolveLmStudioEffectiveBaseUrl(args: {
  company: Company | null | undefined;
  mode: LmStudioBaseUrlMode;
  baseUrl?: string;
}): string {
  const companyBaseUrl = resolveLmStudioCompanyBaseUrl(args.company);
  if (args.mode !== "custom") {
    return companyBaseUrl;
  }
  return args.baseUrl?.trim() || companyBaseUrl;
}
