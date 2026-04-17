import { useMemo } from "react";
import { resolveAgentAdapterConfig } from "@paperclipai/shared";
import type { AdapterConfigRecord } from "@paperclipai/shared";
import type { Company } from "@paperclipai/shared";

interface AgentLike {
  adapterType: string;
  adapterConfig: AdapterConfigRecord | null | undefined;
}

interface UseResolvedConfigResult {
  /** Deep-merged adapter config (company defaults + agent overrides). */
  resolved: AdapterConfigRecord;
  /**
   * Returns true when the agent does not have its own value for `field` but the
   * company defaults do — i.e. the field is effectively "inherited".
   */
  isInherited: (field: string) => boolean;
}

/**
 * Memoised wrapper around `resolveAgentAdapterConfig`.
 *
 * @param agent - The agent (adapterType + adapterConfig).
 * @param company - The selected company (supplies adapterDefaults).
 *
 * @example
 * const { resolved, isInherited } = useResolvedConfig(agent, company);
 * isInherited("model"); // true when model comes from company defaults
 */
export function useResolvedConfig(
  agent: AgentLike | null | undefined,
  company: Company | null | undefined,
): UseResolvedConfigResult {
  const resolved = useMemo<AdapterConfigRecord>(() => {
    if (!agent) return {};
    return resolveAgentAdapterConfig(
      { adapterType: agent.adapterType, adapterConfig: agent.adapterConfig ?? {} },
      { adapterDefaults: company?.adapterDefaults ?? null },
    );
  }, [agent, company]);

  const isInherited = useMemo(() => {
    const agentConfig = agent?.adapterConfig ?? {};
    const companyDefaults =
      (company?.adapterDefaults?.[agent?.adapterType ?? ""] ?? {}) as AdapterConfigRecord;

    return (field: string): boolean => {
      const agentHasOwn =
        Object.prototype.hasOwnProperty.call(agentConfig, field) &&
        agentConfig[field] !== undefined &&
        agentConfig[field] !== null;
      const companyHasDefault =
        Object.prototype.hasOwnProperty.call(companyDefaults, field) &&
        companyDefaults[field] !== undefined &&
        companyDefaults[field] !== null;
      return !agentHasOwn && companyHasDefault;
    };
  }, [agent, company]);

  return { resolved, isInherited };
}
