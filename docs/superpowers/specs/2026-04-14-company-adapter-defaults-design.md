# Company-Level Adapter Defaults

**Created:** 2026-04-14  
**Status:** Approved

## Purpose

Add a per-company `adapterDefaults` configuration so that Ollama and LM Studio agents
can inherit a shared base URL without requiring manual configuration on every agent.

**Completion criteria:** A company setting saves `adapterDefaults`; when an agent with
`lm_studio_local` or `ollama_local` adapter runs without a `baseUrl` in its own
`adapterConfig`, the company default is used transparently.

---

## File Changes

| File | Change |
|---|---|
| `packages/db/src/schema/companies.ts` | Add `adapterDefaults` JSONB column |
| `packages/db/src/schema/index.ts` | Re-export if needed |
| `packages/shared/src/types.ts` (or equivalent) | Add `AdapterDefaults` type; extend `Company` and `UpdateCompany` |
| `packages/shared/src/index.ts` | Export `AdapterDefaults` |
| `server/src/services/companies.ts` | Accept and persist `adapterDefaults` in `update()` |
| `server/src/routes/companies.ts` | Add `adapterDefaults` to `updateCompanySchema` |
| `server/src/services/heartbeat.ts` | Merge company `adapterDefaults` into agent config before `execute()` |
| `ui/src/pages/CompanySettings.tsx` | Add "Adapter Defaults" section (LM Studio URL + Ollama URL) |

---

## Implementation Order

1. **DB schema** — add `adapterDefaults jsonb` column to `companies`, generate migration
2. **Shared types** — define `AdapterDefaults`, extend `Company` / `UpdateCompany`
3. **Server service** — pass `adapterDefaults` through `companies.update()`
4. **Server route** — add `adapterDefaults` to `updateCompanySchema` validator
5. **Heartbeat merge** — fetch company, merge defaults before calling `adapter.execute()`
6. **UI** — add fields to CompanySettings, wire to existing save flow

---

## Types & Signatures

```ts
// packages/shared
export type AdapterDefaults = {
  lm_studio_local?: { baseUrl?: string };
  ollama_local?:    { baseUrl?: string };
};

// Extend existing Company type
export type Company = {
  // ...existing fields
  adapterDefaults: AdapterDefaults | null;
};

// Extend existing UpdateCompany validator
// adapterDefaults: z.object({...}).optional().nullable()
```

### Heartbeat merge (pseudocode)

```ts
// server/src/services/heartbeat.ts — before adapter.execute()
const company = await companySvc.get(agent.companyId);
const companyDefaults = company.adapterDefaults?.[agent.adapterType as keyof AdapterDefaults] ?? {};
const mergedConfig = { ...companyDefaults, ...agentAdapterConfig };
// pass mergedConfig to execute() instead of agentAdapterConfig
```

Agent-level config always wins (`agentAdapterConfig` spreads last).

---

## Constraints

- `adapterDefaults` is nullable in DB; treat `null` same as `{}` everywhere.
- Only `baseUrl` is supported per adapter for now; structure is extensible for future keys.
- Do not expose `adapterDefaults` in agent-facing API (board-only read/write).
- UI inputs: plain text, no validation beyond non-empty string. Placeholder shows the default localhost URL for each adapter.
- The merge happens server-side in the heartbeat service; adapter `execute()` functions require no changes.

---

## Decisions

| Decision | Chosen | Rejected |
|---|---|---|
| Storage | JSONB `adapterDefaults` column on `companies` | Separate table (overkill), individual columns (one per future adapter) |
| Merge location | Heartbeat service, before `execute()` | Inside each adapter's `execute()` (would require changes to every adapter) |
| Scope | Company-level | Instance-level (less flexible), agent-group-level (doesn't exist) |
