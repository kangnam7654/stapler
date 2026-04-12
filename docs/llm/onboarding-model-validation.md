# Onboarding Model Validation — LLM Design Doc

## Purpose

Extend the onboarding wizard's existing `testEnvironment()` flow to validate
the user-selected model, not just CLI installation and authentication.
Non-blocking: model probe failure shows a warning but does not prevent
proceeding.

**Completion criteria:**

- Onboarding Step 2 environment test probes the selected model
- CLI adapters (Claude, Codex, Gemini, Cursor, OpenCode, Pi, Hermes) pass
  `config.model` through to the hello probe
- HTTP adapters (Ollama, LM Studio) gain model-aware hello probes in their
  `testEnvironment()` implementations
- Model probe failure renders a warn banner in the UI; Next remains enabled
- Environment failure (CLI missing, auth required) continues to block Next

---

## Architecture

### Current flow

```
UI (Step 2 Next click)
  → POST /companies/:id/adapters/:type/test-environment { config }
  → Server calls adapter.testEnvironment(ctx)
  → Returns { status, checks[], testedAt }
  → UI: error in checks → block Next
```

### Changed flow

```
UI (Step 2 Next click)
  → POST /companies/:id/adapters/:type/test-environment { config + model }
  → Server calls adapter.testEnvironment(ctx)
     - existing checks (cwd, command, auth)
     - hello probe now uses config.model (already supported by most adapters)
     - HTTP adapters: new model-specific probe added
  → Returns { status, checks[], testedAt }
  → UI:
     - error checks → block Next (unchanged)
     - model probe warn checks → show warn banner, Next stays enabled
```

---

## File Changes

### Server — adapter test.ts files

**CLI adapters that already read `config.model` for probing (no change needed):**
- `packages/adapters/gemini-local/src/server/test.ts` — reads `config.model`,
  passes `--model` to probe args. Already works.
- `packages/adapters/claude-local/src/server/test.ts` — reads `config.model`,
  passes `--model` to probe args. Already works.
- `packages/adapters/codex-local/src/server/test.ts` — reads `config.model`,
  passes `--model` to probe args. Already works.
- `packages/adapters/cursor-local/src/server/test.ts` — reads `config.model`,
  passes `--model` to probe args. Already works.

**HTTP adapters that need model-aware probing (new code):**
- `packages/adapters/ollama-local/src/server/test.ts` — add model hello probe:
  `POST {baseUrl}/api/generate { model, prompt: "Respond with hello.", stream: false }`.
  New check codes: `ollama_model_probe_passed` (info), `ollama_model_probe_failed` (warn).
  Only runs if `config.model` is set and server connectivity check passed.
- `packages/adapters/lm-studio-local/src/server/test.ts` — add model hello probe:
  `POST {baseUrl}/v1/chat/completions { model, messages: [{role:"user", content:"Respond with hello."}], max_tokens: 10 }`.
  New check codes: `lm_studio_model_probe_passed` (info), `lm_studio_model_probe_failed` (warn).
  Only runs if `config.model` is set and server connectivity check passed.

### UI — OnboardingWizard.tsx

- Modify `runAdapterEnvironmentTest()` call to include `model: selectedModel`
  in the config payload
- Add Ollama and LM Studio to the `isLocalAdapter` check so they also trigger
  environment testing on Next click
- After receiving test result, scan `checks[]` for model probe failures:
  - Check code matching `*_probe_failed` or `*_probe_timed_out` with
    level `warn` → render warn banner
  - Banner text: "선택한 모델({modelId})이 응답하지 않았습니다. 다른 모델을
    선택하거나 그대로 진행할 수 있습니다." / "Selected model ({modelId}) did
    not respond. You can choose a different model or continue anyway."
  - i18n key: `onboarding.modelProbeWarning`
- Next button logic:
  - `checks.some(c => c.level === "error")` → disabled (unchanged)
  - model probe warn only → enabled (new)

---

## Implementation Order

1. Add model probe to `ollama-local/src/server/test.ts`
2. Add model probe to `lm-studio-local/src/server/test.ts`
3. Modify `OnboardingWizard.tsx`: pass `model` in env test config
4. Modify `OnboardingWizard.tsx`: add Ollama/LM Studio to `isLocalAdapter`
5. Modify `OnboardingWizard.tsx`: add warn banner for model probe failures
6. Add i18n keys (ko.json, en.json)
7. Test: select Gemini + valid model → probe passes, no banner
8. Test: select Gemini + invalid model → warn banner shown, Next enabled
9. Test: select Ollama + installed model → probe passes
10. Test: select Ollama + missing model → warn banner shown

---

## Constraints

1. Do not change the `testEnvironment()` function signature or return type.
   Model probing results are additional entries in the existing `checks[]` array.
2. Model probe timeout: 15 seconds for CLI adapters (already configured),
   30 seconds for HTTP adapters (local models can be slow to load).
3. Model probe level is always `warn`, never `error`. This ensures model
   failure is non-blocking.
4. Existing environment test behavior must not regress. If `config.model` is
   not set, behavior is identical to current (probe with default or skip).

---

## Decisions

- **Extend testEnvironment vs. new endpoint**: Extending existing endpoint
  avoids adding API surface and keeps the single-call UX. The `checks[]`
  array is already designed to carry heterogeneous check results. Rejected:
  new `POST /adapters/:type/test-model` endpoint (unnecessary API surface,
  extra round-trip in UI).
- **Non-blocking warn vs. blocking error for model failure**: Model
  availability is transient (rate limits, preview model downtime). Blocking
  the onboarding flow for a transient issue creates a bad first-run experience.
  Rejected: blocking error (too aggressive for best-effort probing).
- **HTTP adapter probing added to testEnvironment vs. separate mechanism**:
  Consistent pattern with CLI adapters. All adapters' testEnvironment can
  optionally probe a model. Rejected: separate probe mechanism for HTTP
  adapters (inconsistent, more code paths).
