# Onboarding Model Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend onboarding wizard Step 2 to validate the user-selected model via testEnvironment() probes — non-blocking warn on model probe failure, blocking on environment errors.

**Architecture:** HTTP adapters (Ollama, LM Studio) gain model-aware hello probes inside their existing `testEnvironment()`. CLI adapters already pass `config.model` through. UI adds `isLocalAdapter` coverage for HTTP adapters, error-level blocking, and a warn banner for model probe failures.

**Tech Stack:** TypeScript, React, i18n (ko.json)

**Spec:** `docs/llm/onboarding-model-validation.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `packages/adapters/ollama-local/src/server/index.ts` | Add model hello probe after reachability check |
| Modify | `packages/adapters/lm-studio-local/src/server/index.ts` | Add model hello probe after reachability check |
| Modify | `ui/src/components/OnboardingWizard.tsx` | `isLocalAdapter` expansion, error blocking, warn banner |
| Modify | `ui/src/i18n/ko.json` | Add `onboarding.modelProbeWarning` key |

---

### Task 1: Add model hello probe to Ollama testEnvironment

**Files:**
- Modify: `packages/adapters/ollama-local/src/server/index.ts:26-79`

**Context:** The current `testEnvironment()` only checks server reachability via `listRemoteModels()`. Per the spec, after a successful reachability check, if `config.model` is set, POST a generate request to the model. The probe result is appended to the existing `checks[]` array with level `"warn"` on failure (never `"error"`). Timeout: 30 seconds.

- [ ] **Step 1: Read current testEnvironment and understand the structure**

The function at lines 26-79 follows this pattern:
```
try {
  listRemoteModels() → success → return { status: "pass"|"warn", checks }
} catch {
  return { status: "fail", checks: [ollama_unreachable] }
}
```
We need to change it to accumulate checks in an array, then optionally append a model probe check.

- [ ] **Step 2: Refactor testEnvironment to accumulate checks**

Replace the early-return pattern with a mutable `checks` array and a `summarizeStatus()` helper (same pattern as claude-local/test.ts). Then append the model probe conditionally.

In `packages/adapters/ollama-local/src/server/index.ts`, replace the entire `testEnvironment` function (lines 26-79) with:

```typescript
export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const config = parseObject(ctx.config);
  const baseUrl = asString(config.baseUrl, DEFAULT_OLLAMA_BASE_URL);
  const modelId = asString(config.model, "").trim();

  const checks: AdapterEnvironmentTestResult["checks"] = [];
  let serverReachable = false;

  try {
    const names = await listRemoteModels({
      baseUrl,
      timeoutMs: 3000,
      style: "ollama",
    });
    serverReachable = true;
    if (names.length > 0) {
      checks.push({
        code: "ollama_reachable",
        level: "info",
        message: `Ollama reachable at ${baseUrl}; ${names.length} model(s) installed.`,
      });
    } else {
      checks.push({
        code: "ollama_no_models",
        level: "warn",
        message: `Ollama reachable at ${baseUrl} but no models are installed. Run: ollama pull llama3.1`,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    checks.push({
      code: "ollama_unreachable",
      level: "error",
      message: `Ollama server not running at ${baseUrl}: ${message}`,
    });
  }

  // Model hello probe — only if server is reachable and model is specified
  if (serverReachable && modelId) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);
      const res = await fetch(`${baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: modelId,
          prompt: "Respond with hello.",
          stream: false,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        checks.push({
          code: "ollama_model_probe_passed",
          level: "info",
          message: `Model '${modelId}' responded successfully.`,
        });
      } else {
        const body = await res.text().catch(() => "");
        checks.push({
          code: "ollama_model_probe_failed",
          level: "warn",
          message: `Model '${modelId}' probe failed (HTTP ${res.status}).`,
          detail: body.slice(0, 240) || undefined,
          hint: `Run: ollama pull ${modelId}`,
        });
      }
    } catch (err) {
      const isTimeout =
        err instanceof Error && err.name === "AbortError";
      checks.push({
        code: isTimeout
          ? "ollama_model_probe_timed_out"
          : "ollama_model_probe_failed",
        level: "warn",
        message: isTimeout
          ? `Model '${modelId}' probe timed out (30s).`
          : `Model '${modelId}' probe failed: ${err instanceof Error ? err.message : String(err)}`,
        hint: `Verify the model is pulled: ollama pull ${modelId}`,
      });
    }
  }

  const status = checks.some((c) => c.level === "error")
    ? "fail"
    : checks.some((c) => c.level === "warn")
      ? "warn"
      : "pass";

  return {
    adapterType: ctx.adapterType,
    status,
    checks,
    testedAt: new Date().toISOString(),
  };
}
```

- [ ] **Step 3: Verify typecheck passes**

Run: `pnpm --filter @paperclipai/adapter-ollama-local typecheck`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add packages/adapters/ollama-local/src/server/index.ts
git commit -m "feat(ollama): add model hello probe to testEnvironment"
```

---

### Task 2: Add model hello probe to LM Studio testEnvironment

**Files:**
- Modify: `packages/adapters/lm-studio-local/src/server/index.ts:26-79`

**Context:** Same pattern as Task 1 but with OpenAI-compatible `/v1/chat/completions` endpoint and LM Studio-specific check codes. Default base URL is `http://localhost:1234`.

- [ ] **Step 1: Replace testEnvironment with accumulating-checks pattern + model probe**

In `packages/adapters/lm-studio-local/src/server/index.ts`, replace the entire `testEnvironment` function (lines 26-79) with:

```typescript
export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const config = parseObject(ctx.config);
  const baseUrl = asString(config.baseUrl, DEFAULT_LM_STUDIO_BASE_URL);
  const modelId = asString(config.model, "").trim();

  const checks: AdapterEnvironmentTestResult["checks"] = [];
  let serverReachable = false;

  try {
    const names = await listRemoteModels({
      baseUrl,
      timeoutMs: 3000,
      style: "openai",
    });
    serverReachable = true;
    if (names.length > 0) {
      checks.push({
        code: "lm_studio_reachable",
        level: "info",
        message: `LM Studio reachable at ${baseUrl}; ${names.length} model(s) loaded.`,
      });
    } else {
      checks.push({
        code: "lm_studio_no_models",
        level: "warn",
        message: `LM Studio reachable at ${baseUrl} but no models are loaded. Load a model in LM Studio first.`,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    checks.push({
      code: "lm_studio_unreachable",
      level: "error",
      message: `LM Studio server not running at ${baseUrl}: ${message}`,
    });
  }

  // Model hello probe — only if server is reachable and model is specified
  if (serverReachable && modelId) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);
      const res = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: "user", content: "Respond with hello." }],
          max_tokens: 10,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        checks.push({
          code: "lm_studio_model_probe_passed",
          level: "info",
          message: `Model '${modelId}' responded successfully.`,
        });
      } else {
        const body = await res.text().catch(() => "");
        checks.push({
          code: "lm_studio_model_probe_failed",
          level: "warn",
          message: `Model '${modelId}' probe failed (HTTP ${res.status}).`,
          detail: body.slice(0, 240) || undefined,
          hint: "Load the model in LM Studio and verify it is available.",
        });
      }
    } catch (err) {
      const isTimeout =
        err instanceof Error && err.name === "AbortError";
      checks.push({
        code: isTimeout
          ? "lm_studio_model_probe_timed_out"
          : "lm_studio_model_probe_failed",
        level: "warn",
        message: isTimeout
          ? `Model '${modelId}' probe timed out (30s).`
          : `Model '${modelId}' probe failed: ${err instanceof Error ? err.message : String(err)}`,
        hint: "Verify the model is loaded in LM Studio.",
      });
    }
  }

  const status = checks.some((c) => c.level === "error")
    ? "fail"
    : checks.some((c) => c.level === "warn")
      ? "warn"
      : "pass";

  return {
    adapterType: ctx.adapterType,
    status,
    checks,
    testedAt: new Date().toISOString(),
  };
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm --filter @paperclipai/adapter-lm-studio-local typecheck`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add packages/adapters/lm-studio-local/src/server/index.ts
git commit -m "feat(lm-studio): add model hello probe to testEnvironment"
```

---

### Task 3: Add Ollama/LM Studio to isLocalAdapter and add error-blocking logic

**Files:**
- Modify: `ui/src/components/OnboardingWizard.tsx:215-222` (isLocalAdapter)
- Modify: `ui/src/components/OnboardingWizard.tsx:464-467` (handleStep2Next blocking)

**Context:** Currently `isLocalAdapter` (line 215) includes only CLI adapters. Adding `ollama_local` and `lm_studio_local` causes `handleStep2Next()` to run environment tests for these adapters on Next click. Additionally, the current code does not block on error-level checks — `if (!result) return;` only blocks when the API call itself fails. Per the spec, `checks.some(c => c.level === "error")` must block Next.

- [ ] **Step 1: Add ollama_local and lm_studio_local to isLocalAdapter**

In `ui/src/components/OnboardingWizard.tsx`, find lines 215-222:

```typescript
  const isLocalAdapter =
    adapterType === "claude_local" ||
    adapterType === "codex_local" ||
    adapterType === "gemini_local" ||
    adapterType === "hermes_local" ||
    adapterType === "opencode_local" ||
    adapterType === "pi_local" ||
    adapterType === "cursor";
```

Replace with:

```typescript
  const isLocalAdapter =
    adapterType === "claude_local" ||
    adapterType === "codex_local" ||
    adapterType === "gemini_local" ||
    adapterType === "hermes_local" ||
    adapterType === "opencode_local" ||
    adapterType === "pi_local" ||
    adapterType === "cursor" ||
    adapterType === "ollama_local" ||
    adapterType === "lm_studio_local";
```

- [ ] **Step 2: Add error-level blocking in handleStep2Next**

In `ui/src/components/OnboardingWizard.tsx`, find lines 464-467:

```typescript
      if (isLocalAdapter) {
        const result = adapterEnvResult ?? (await runAdapterEnvironmentTest());
        if (!result) return;
      }
```

Replace with:

```typescript
      if (isLocalAdapter) {
        const result = adapterEnvResult ?? (await runAdapterEnvironmentTest());
        if (!result) return;
        if (result.checks.some((c) => c.level === "error")) return;
      }
```

This ensures:
- `!result` → API call itself failed (unchanged)
- Error-level checks → blocks Next (e.g. CLI not found, server unreachable)
- Warn-level checks → does NOT block (e.g. model probe failed)

- [ ] **Step 3: Commit**

```bash
git add ui/src/components/OnboardingWizard.tsx
git commit -m "feat(ui): add Ollama/LM Studio to isLocalAdapter, block Next on env errors"
```

---

### Task 4: Add model probe warn banner in OnboardingWizard

**Files:**
- Modify: `ui/src/components/OnboardingWizard.tsx:1067-1075` (result rendering area)

**Context:** After the environment test result renders, if any check code contains `_probe_failed` or `_probe_timed_out` with level `"warn"`, show an amber banner with the i18n key `onboarding.modelProbeWarning`. The model ID is available from the `model` state variable.

- [ ] **Step 1: Add a derived boolean for model probe warning**

In `ui/src/components/OnboardingWizard.tsx`, after the `shouldSuggestUnsetAnthropicApiKey` block (around line 254), add:

```typescript
  const hasModelProbeWarning =
    adapterEnvResult?.checks.some(
      (check) =>
        check.level === "warn" &&
        (check.code.endsWith("_probe_failed") ||
          check.code.endsWith("_probe_timed_out"))
    ) ?? false;
```

- [ ] **Step 2: Add warn banner JSX**

In `ui/src/components/OnboardingWizard.tsx`, find the block starting at line 1067:

```tsx
                      {adapterEnvResult &&
                      adapterEnvResult.status === "pass" ? (
```

Insert a model probe warning banner **before** this block (before line 1067):

```tsx
                      {hasModelProbeWarning && (
                        <div className="flex items-start gap-2 rounded-md border border-amber-300/60 dark:border-amber-500/40 bg-amber-50/60 dark:bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200 animate-in fade-in slide-in-from-bottom-1 duration-300">
                          <span className="mt-0.5 shrink-0">⚠</span>
                          <span>
                            {t("onboarding.modelProbeWarning", {
                              modelId: model || "unknown",
                            })}
                          </span>
                        </div>
                      )}
```

- [ ] **Step 3: Commit**

```bash
git add ui/src/components/OnboardingWizard.tsx
git commit -m "feat(ui): add model probe warn banner in onboarding Step 2"
```

---

### Task 5: Add i18n key for model probe warning

**Files:**
- Modify: `ui/src/i18n/ko.json:508-535` (onboarding section)

**Context:** Only one locale file exists (`ko.json`). The onboarding section is at line 508. Add the `modelProbeWarning` key with interpolated `{{modelId}}`.

- [ ] **Step 1: Add the i18n key**

In `ui/src/i18n/ko.json`, find line 534 (`"allSet": "모든 준비가 완료되었습니다!"`), and after it add:

```json
    "modelProbeWarning": "선택한 모델({{modelId}})이 응답하지 않았습니다. 다른 모델을 선택하거나 그대로 진행할 수 있습니다."
```

The line before `}` closing the `"onboarding"` block.

- [ ] **Step 2: Commit**

```bash
git add ui/src/i18n/ko.json
git commit -m "feat(i18n): add modelProbeWarning key for onboarding"
```

---

### Task 6: Typecheck, build, and verify

**Files:** None (verification only)

- [ ] **Step 1: Run full typecheck**

Run: `pnpm -r typecheck`
Expected: Zero errors across all packages.

- [ ] **Step 2: Run build**

Run: `pnpm build`
Expected: Successful build.

- [ ] **Step 3: Run tests**

Run: `pnpm test:run`
Expected: All existing tests pass (no regressions).

- [ ] **Step 4: If any failures, fix and re-run**

Fix typecheck or build errors, commit fixes.

- [ ] **Step 5: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: resolve typecheck/build issues from model validation feature"
```
