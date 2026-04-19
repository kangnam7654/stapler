# Wizard Auto-Saves Company Adapter Defaults

**Created:** 2026-04-19
**Status:** Approved
**Related:** `2026-04-14-company-adapter-defaults-design.md` (added `companies.adapterDefaults` infra). This spec extends that infra by making the onboarding wizard populate it.

## Purpose

The onboarding wizard collects an adapter `baseUrl` and `model` for the CEO agent
but stores them only on the agent's own `adapterConfig`. The company-level
`adapterDefaults` row stays `null`. As a result, every subsequent agent created
in the company that uses `baseUrlMode: "company"` (the default) has nothing to
inherit and falls back to the adapter's hardcoded localhost (e.g.
`DEFAULT_LM_STUDIO_BASE_URL = "http://localhost:1234"`), causing
`ECONNREFUSED` for users running their LLM server on a remote host.

This spec makes the wizard treat the company `adapterDefaults` as the **single
source of truth** (Model A): URL and model entered in the wizard are saved to
the company default, and the CEO agent inherits from it just like every future
agent will.

**Completion criteria:**

1. After completing wizard step 2 with `lm_studio_local`/`ollama_local` and a
   non-empty URL, the company's `adapterDefaults[adapterType].baseUrl` is set
   to that URL.
2. After completing wizard step 2 with any of the 4 in-scope adapter types and
   a non-empty model, the company's `adapterDefaults[adapterType].model` is
   set to that model.
3. The CEO agent's `adapterConfig` does not contain `baseUrl` or `model` for
   in-scope adapter types — these are inherited from the company default via
   `resolveAgentAdapterConfig` deep merge.
4. A second agent created in the same company without specifying URL/model
   resolves to the company default (verifiable via heartbeat config
   resolution).

---

## Architecture

The change is **wizard-only**. All required infrastructure already exists from
the 2026-04-14 work:

- DB column `companies.adapter_defaults` (JSONB, nullable)
- TypeScript type `CompanyAdapterDefaults` with generic `[providerId: string]`
  index signature, accepting any adapter type
- `AdapterEndpoint` type with `baseUrl?`/`apiKey?` plus `[field: string]: unknown`
  index signature (so `model` is already accepted as a field)
- Zod `adapterDefaultsSchema` is `z.record(z.string(), z.record(z.string(), z.unknown()))` — no schema change needed
- `companiesApi.update` already accepts `adapterDefaults`
- `resolveAgentAdapterConfig` (called per-heartbeat) deep-merges company defaults
  + agent overrides

Two existing wizard behaviors must change:

1. **`buildAdapterConfig` (`OnboardingWizard.tsx:359-402`)** currently forces
   `lmStudioBaseUrlMode: "custom"` whenever a URL is entered. This pins the
   URL to the CEO agent and bypasses the company-default inherit path. With
   this change, the mode stays at the `defaultCreateValues` value (`"company"`),
   and `baseUrl`/`model` keys are stripped from the returned config so the
   merge actually reads from the company default.

2. **`handleStep2Next` (`OnboardingWizard.tsx:512-581`)** currently calls
   `agentsApi.create` directly. Before that call, when the entered URL/model
   are eligible for company-default storage, it must PATCH the company with
   `{ adapterDefaults: { ...existing, [adapterType]: { baseUrl?, model? } } }`.

For Ollama specifically: there is no `ollamaBaseUrlMode` toggle. The merge
mechanism still works because deep merge inherits any key the agent does not
override. So removing `baseUrl`/`model` from agent config is sufficient — no
new mode flag needed.

### Inherit mechanism per adapter type

| Adapter | How inherit works |
|---|---|
| `lm_studio_local` | `lmStudioBaseUrlMode: "company"` on agent + no `baseUrl` key on agent → `resolveAgentAdapterConfig` merges in `company.adapterDefaults.lm_studio_local.baseUrl`. Same path for `model` (deep merge picks unset keys from defaults). |
| `ollama_local` | No mode flag exists. Just no `baseUrl`/`model` keys on agent → deep merge picks from company default. |
| `claude_local` | No `model` key on agent → deep merge picks from company default. (No URL field for this adapter.) |
| `codex_local` | Same as `claude_local`. |

---

## File Changes

| File | Action | What changes |
|---|---|---|
| `ui/src/components/OnboardingWizard.tsx` | Modify | (1) Add `COMPANY_DEFAULT_FIELDS` map, `buildCompanyAdapterDefaultsPatch`, and `stripCompanyDefaultFields` helpers. (2) Remove the force-`"custom"` line in `buildAdapterConfig`. (3) Apply `stripCompanyDefaultFields` to the returned config. (4) In `handleStep2Next`, PATCH the company with built defaults before creating the CEO agent. |
| `ui/src/components/__tests__/OnboardingWizard.test.tsx` | Create | 8 wizard component tests (W-1 through W-8) covering all 4 adapter types, scope-out cases, error handling, and incremental PATCH. |
| `ui/src/components/__tests__/wizard-helpers.test.ts` | Create | 6 pure-function tests (H-1 through H-6) for `buildCompanyAdapterDefaultsPatch` and `stripCompanyDefaultFields`. |
| `tests/e2e/wizard-company-adapter-defaults.spec.ts` | Create | Playwright E2E: complete wizard with LM Studio + remote URL + model → assert `companies.adapterDefaults` populated → create second agent → assert resolved config inherits from company default. |

---

## Implementation Order

1. **Helper unit tests (H-1..H-6)** — RED. Write tests for `buildCompanyAdapterDefaultsPatch` and `stripCompanyDefaultFields` against not-yet-existing helpers.
2. **Implement helpers** in `OnboardingWizard.tsx` — GREEN.
3. **Wizard component tests (W-1..W-8)** — RED. Vitest + Testing Library; mock `companiesApi`/`agentsApi`/`onboardingApi`/`goalsApi`.
4. **Modify `buildAdapterConfig`** — remove force-`"custom"` block, append `stripCompanyDefaultFields(adapterType, config)` at return. Some tests turn GREEN.
5. **Modify `handleStep2Next`** — insert PATCH-company block before `agentsApi.create`. Remaining tests turn GREEN.
6. **E2E test** — Playwright. Run against dev server with PGlite.
7. **Manual smoke** in browser (see Manual Verification below).
8. **Verification gate:** `pnpm -r typecheck && pnpm test:run && pnpm build`.

### Manual Verification

1. `pnpm dev` → open the app, start the wizard, create a fresh company "Smoke Test".
2. In step 2, choose LM Studio, enter an external `baseUrl` (e.g. `http://10.99.99.99:1234`) and a `model`. Complete the wizard.
3. Immediately after wizard finishes, `curl http://localhost:3100/api/companies` and confirm the new company has `adapterDefaults.lm_studio_local.baseUrl` and `.model` populated with the entered values.
4. Watch the CEO's first heartbeat in the server log — confirm the adapter call goes to the entered external URL (no `ECONNREFUSED localhost:1234`).
5. From the UI, create a second agent (e.g. Founding Engineer) for the same company without entering URL or model. Confirm its first heartbeat also uses the company default URL/model — proves inherit works for non-wizard-created agents too.

---

## Types & Signatures

```ts
// In OnboardingWizard.tsx (private; not exported)

type InScopeAdapterType =
  | "lm_studio_local"
  | "ollama_local"
  | "claude_local"
  | "codex_local";

const COMPANY_DEFAULT_FIELDS: Record<InScopeAdapterType, readonly ("baseUrl" | "model")[]> = {
  lm_studio_local: ["baseUrl", "model"],
  ollama_local:    ["baseUrl", "model"],
  claude_local:    ["model"],
  codex_local:     ["model"],
};

function isInScopeAdapterType(type: AdapterType): type is InScopeAdapterType {
  return type in COMPANY_DEFAULT_FIELDS;
}

function buildCompanyAdapterDefaultsPatch(
  adapterType: AdapterType,
  values: { url: string; model: string },
): { baseUrl?: string; model?: string } | null;

function stripCompanyDefaultFields(
  adapterType: AdapterType,
  config: Record<string, unknown>,
): Record<string, unknown>;
```

### `handleStep2Next` insertion (pseudocode)

```ts
// ... existing env-test guard ...

// NEW: persist eligible URL/model to company adapterDefaults BEFORE creating CEO.
if (isInScopeAdapterType(adapterType)) {
  const patch = buildCompanyAdapterDefaultsPatch(adapterType, { url, model });
  if (patch) {
    const existing =
      (companies.find(c => c.id === createdCompanyId)?.adapterDefaults ?? {}) as Record<string, unknown>;
    await companiesApi.update(createdCompanyId, {
      adapterDefaults: { ...existing, [adapterType]: patch },
    });
    queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
  }
}

// EXISTING: create CEO. buildAdapterConfig now strips baseUrl/model.
const agent = await agentsApi.create(createdCompanyId, { ... });
```

### `buildAdapterConfig` change

Remove (lines 376-383):

```ts
// LM Studio defaults `lmStudioBaseUrlMode` to "company" which blocks
// build-config from persisting `baseUrl`. In onboarding there is no
// company default to inherit, so when the user enters a URL we treat
// it as an explicit custom override.
lmStudioBaseUrlMode:
  adapterType === "lm_studio_local" && trimmedUrl.length > 0
    ? "custom"
    : defaultCreateValues.lmStudioBaseUrlMode,
```

Replace with just:

```ts
lmStudioBaseUrlMode: defaultCreateValues.lmStudioBaseUrlMode, // "company" — inherits from company.adapterDefaults
```

At end of function, before return:

```ts
return stripCompanyDefaultFields(adapterType, config);
```

---

## Constraints

- **In-scope adapter types are exactly 4:** `lm_studio_local`, `ollama_local`, `claude_local`, `codex_local`. All other adapter types fall through both helpers as no-ops; their wizard behavior is unchanged.
- **In-scope fields are exactly 2:** `baseUrl` and `model`. Secrets, env vars, command, args, and other adapter config keys are NEVER copied to the company default. This keeps the company-default surface small and avoids leaking sensitive material to a row with different access semantics.
- **Empty-string fields are omitted.** `trim()` then check `length > 0` before adding to the patch. If the patch ends up empty (`{}`), skip the PATCH entirely.
- **PATCH is incremental.** Spread existing `adapterDefaults` into the new value so other adapters' defaults survive.
- **PATCH happens BEFORE CEO creation.** If PATCH fails, CEO is not created and the user sees the error and retries. No half-state where CEO exists but company has stale defaults.
- **No new mode flag for Ollama.** Deep-merge inherit works without one.
- **No backend changes.** Schema, types, validators, services, routes — all already accept this shape from the 2026-04-14 work.
- **No migration of existing companies** (Q3 = a). The two existing companies were either already correct or were patched manually during this debug session.
- **Helpers stay private to the file.** Not exported. Reused only by the wizard. If a future agent-creation flow (e.g. `NewAgent.tsx`) needs the same logic, lift to a shared module then.

---

## Decisions

| Decision | Chosen | Rejected | Why |
|---|---|---|---|
| Source of truth for adapter URL/model | Company `adapterDefaults` (Model A) | CEO agent's `adapterConfig` (Model B — current bug source) | Model A makes the company-default → agent inherit chain consistent for ALL agents in the company including the CEO; Model B forces every new agent to re-enter the URL or accept the localhost fallback. |
| Inherit mechanism per adapter | LM Studio: `lmStudioBaseUrlMode: "company"` + omit `baseUrl`. Others: omit fields, rely on deep merge. | Add `ollamaBaseUrlMode`/`claudeModelMode`/etc to mirror LM Studio | Adds N new mode flags for no UX gain. Deep merge already does the right thing when keys are absent. |
| When to PATCH the company | Step 2, immediately before `agentsApi.create` | Step 1 (URL not known yet) / Step 3 (CEO already exists, race) | Step 2 is the first moment URL+model are known AND the CEO is about to inherit them. |
| Failure mode if PATCH fails | Step 2 fails entirely; CEO not created; user retries | Continue to create CEO without company defaults (silent half-fix) | A half-fixed company is worse than a clean retry — it would re-introduce the bug for the next agent. |
| Existing companies | No auto-migration (a) | One-shot backfill script (b) | Both existing companies are already in good state. Risk of script misinference > zero benefit. |
| Helper location | Private functions in `OnboardingWizard.tsx` | New file in `ui/src/lib/` | YAGNI. No second consumer right now. |
| `gemini_local` and others | Out of scope this round | Include in COMPANY_DEFAULT_FIELDS | User specified 4 adapters. Adding more later is one map entry — trivial extension. |
