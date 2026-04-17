import type { CompanyAdapterDefaults } from "./types/company.js";

export type AdapterConfigRecord = Record<string, unknown>;

export function isSecretRef(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  const typeField = (value as { type?: unknown }).type;
  const secretIdField = (value as { secretId?: unknown }).secretId;
  return typeField === "secret_ref" && typeof secretIdField === "string";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function deepMergeAdapterConfig(
  defaults: AdapterConfigRecord,
  overrides: AdapterConfigRecord,
): AdapterConfigRecord {
  const result: AdapterConfigRecord = {};

  for (const key of Object.keys(defaults)) {
    result[key] = defaults[key];
  }

  for (const key of Object.keys(overrides)) {
    const overrideValue = overrides[key];
    if (overrideValue === undefined || overrideValue === null) {
      continue;
    }
    const defaultValue = result[key];
    if (
      isPlainObject(defaultValue)
      && isPlainObject(overrideValue)
      && !isSecretRef(defaultValue)
      && !isSecretRef(overrideValue)
    ) {
      result[key] = deepMergeAdapterConfig(defaultValue, overrideValue);
    } else {
      result[key] = overrideValue;
    }
  }

  return result;
}

export interface ResolveAgentAdapterConfigInput {
  readonly agent: {
    readonly adapterType: string;
    readonly adapterConfig: AdapterConfigRecord | null | undefined;
  };
  readonly company: {
    readonly adapterDefaults: CompanyAdapterDefaults | null | undefined;
  };
}

export function resolveAgentAdapterConfig(
  agent: ResolveAgentAdapterConfigInput["agent"],
  company: ResolveAgentAdapterConfigInput["company"],
): AdapterConfigRecord {
  const defaults = (company.adapterDefaults?.[agent.adapterType] ?? {}) as AdapterConfigRecord;
  const overrides = (agent.adapterConfig ?? {}) as AdapterConfigRecord;
  return deepMergeAdapterConfig(defaults, overrides);
}
