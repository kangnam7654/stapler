# Company-Level Adapter Defaults Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-company default `baseUrl` for `lm_studio_local` and `ollama_local` adapters so agents inherit it without manual configuration.

**Architecture:** JSONB `adapter_defaults` column on `companies` table. Zod schema validates shape. Heartbeat service merges company defaults into agent `adapterConfig` before calling `adapter.execute()` — adapters themselves need no changes. UI adds a section in CompanySettings.

**Tech Stack:** Drizzle ORM (PGlite), Zod, Express, React + TanStack Query, TypeScript

---

## File Map

| File | Action | What changes |
|---|---|---|
| `packages/db/src/schema/companies.ts` | Modify | Add `adapterDefaults jsonb` column |
| `packages/shared/src/validators/company.ts` | Modify | Add `adapterDefaultsSchema`, extend `updateCompanySchema` |
| `packages/shared/src/index.ts` | Modify | Export `AdapterDefaults` type |
| `server/src/services/heartbeat.ts` | Modify | Fetch company, merge defaults before `execute()` |
| `ui/src/pages/CompanySettings.tsx` | Modify | Add Adapter Defaults section (LM Studio + Ollama URL fields) |
| `server/src/__tests__/companies-route.test.ts` | Create | Route-level test for adapterDefaults round-trip |

---

## Task 1: DB schema — add `adapterDefaults` column

**Files:**
- Modify: `packages/db/src/schema/companies.ts`

- [ ] **Step 1: Add `jsonb` import and column**

Open `packages/db/src/schema/companies.ts`. The import line currently reads:
```ts
import { pgTable, uuid, text, integer, timestamp, boolean, uniqueIndex } from "drizzle-orm/pg-core";
```

Change it to:
```ts
import { pgTable, uuid, text, integer, timestamp, boolean, uniqueIndex, jsonb } from "drizzle-orm/pg-core";
```

Add the column after `brandColor`:
```ts
    brandColor: text("brand_color"),
    adapterDefaults: jsonb("adapter_defaults"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
```

- [ ] **Step 2: Generate migration**

```bash
pnpm db:generate
```

Expected: a new file in `packages/db/drizzle/` like `0XXX_add_company_adapter_defaults.sql` containing `ALTER TABLE "companies" ADD COLUMN "adapter_defaults" jsonb;`

- [ ] **Step 3: Typecheck**

```bash
pnpm -r typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/schema/companies.ts packages/db/drizzle/
git commit -m "feat(db): add adapter_defaults jsonb column to companies"
```

---

## Task 2: Shared types — `AdapterDefaults` + validator

**Files:**
- Modify: `packages/shared/src/validators/company.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write failing type test**

Create `packages/shared/src/__tests__/adapter-defaults.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { updateCompanySchema } from "../validators/company.js";

describe("updateCompanySchema adapterDefaults", () => {
  it("accepts valid adapterDefaults", () => {
    const result = updateCompanySchema.safeParse({
      adapterDefaults: {
        lm_studio_local: { baseUrl: "http://192.168.1.10:1234" },
        ollama_local: { baseUrl: "http://192.168.1.10:11434" },
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts null adapterDefaults", () => {
    const result = updateCompanySchema.safeParse({ adapterDefaults: null });
    expect(result.success).toBe(true);
  });

  it("accepts partial adapterDefaults (only one adapter)", () => {
    const result = updateCompanySchema.safeParse({
      adapterDefaults: { ollama_local: { baseUrl: "http://10.0.0.1:11434" } },
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty adapterDefaults object", () => {
    const result = updateCompanySchema.safeParse({ adapterDefaults: {} });
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @paperclipai/shared test --run
```

Expected: FAIL — `adapterDefaults` not in schema.

- [ ] **Step 3: Add `adapterDefaultsSchema` and extend `updateCompanySchema`**

In `packages/shared/src/validators/company.ts`, add after the existing `brandColorSchema` line:

```ts
const adapterEndpointSchema = z
  .object({ baseUrl: z.string().min(1).optional() })
  .optional();

const adapterDefaultsSchema = z
  .object({
    lm_studio_local: adapterEndpointSchema,
    ollama_local: adapterEndpointSchema,
  })
  .nullable()
  .optional();

export type AdapterDefaults = NonNullable<z.infer<typeof adapterDefaultsSchema>>;
```

Then in `updateCompanySchema`, add `adapterDefaults` to the `.extend({...})` block:
```ts
export const updateCompanySchema = createCompanySchema
  .partial()
  .extend({
    status: z.enum(COMPANY_STATUSES).optional(),
    spentMonthlyCents: z.number().int().nonnegative().optional(),
    requireBoardApprovalForNewAgents: z.boolean().optional(),
    brandColor: brandColorSchema,
    logoAssetId: logoAssetIdSchema,
    adapterDefaults: adapterDefaultsSchema,
  });
```

- [ ] **Step 4: Export `AdapterDefaults` from shared index**

In `packages/shared/src/index.ts`, find where `updateCompanySchema` is exported. Add `AdapterDefaults` to the same export block:

```ts
export type { AdapterDefaults } from "./validators/company.js";
```

(or add it to the existing re-export line if it already re-exports named types from that file)

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm --filter @paperclipai/shared test --run
```

Expected: PASS

- [ ] **Step 6: Typecheck**

```bash
pnpm -r typecheck
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/validators/company.ts packages/shared/src/index.ts packages/shared/src/__tests__/adapter-defaults.test.ts
git commit -m "feat(shared): add AdapterDefaults type and extend updateCompanySchema"
```

---

## Task 3: Server route + service — pass `adapterDefaults` through

The route already uses `updateCompanySchema.parse(req.body)` and the service uses `Partial<typeof companies.$inferInsert>`, so `adapterDefaults` flows through automatically once the schema and DB column exist. This task adds a test to confirm.

**Files:**
- Create: `server/src/__tests__/companies-adapter-defaults.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { companyRoutes } from "../routes/companies.js";
import { createTestDb } from "./helpers/db.js";

describe("PATCH /api/companies/:id — adapterDefaults", () => {
  let app: express.Express;
  let db: Awaited<ReturnType<typeof createTestDb>>;
  let companyId: string;

  beforeEach(async () => {
    db = await createTestDb();
    app = express();
    app.use(express.json());
    // Mount with a board actor (no auth in tests)
    app.use((req, _res, next) => {
      (req as any).actor = { type: "board" };
      next();
    });
    app.use("/api/companies", companyRoutes(db));

    // Create a company to update
    const res = await request(app)
      .post("/api/companies")
      .send({ name: "Test Co" });
    companyId = res.body.id;
  });

  it("saves and returns adapterDefaults", async () => {
    const defaults = {
      lm_studio_local: { baseUrl: "http://10.0.0.5:1234" },
      ollama_local: { baseUrl: "http://10.0.0.5:11434" },
    };

    const res = await request(app)
      .patch(`/api/companies/${companyId}`)
      .send({ adapterDefaults: defaults });

    expect(res.status).toBe(200);
    expect(res.body.adapterDefaults).toEqual(defaults);
  });

  it("saves null adapterDefaults", async () => {
    const res = await request(app)
      .patch(`/api/companies/${companyId}`)
      .send({ adapterDefaults: null });

    expect(res.status).toBe(200);
    expect(res.body.adapterDefaults).toBeNull();
  });
});
```

> **Note:** If `createTestDb` or the test helper pattern differs from what's in the codebase, look at `server/src/__tests__/companies-route-path-guard.test.ts` for the correct helper import paths and test setup pattern — mirror that exactly.

- [ ] **Step 2: Run the test**

```bash
pnpm test:run --reporter=verbose 2>&1 | grep -A 5 "companies-adapter-defaults"
```

Expected: PASS (the route already passes through once schema + DB column exist from Tasks 1–2).

- [ ] **Step 3: Commit**

```bash
git add server/src/__tests__/companies-adapter-defaults.test.ts
git commit -m "test(server): verify adapterDefaults round-trip on company PATCH"
```

---

## Task 4: Heartbeat — merge company defaults before `execute()`

**Files:**
- Modify: `server/src/services/heartbeat.ts`

- [ ] **Step 1: Find the execute() call**

In `server/src/services/heartbeat.ts`, search for `adapter.execute({`. There is one call site around line 2538. The variables at that point are:
- `agent` — has `agent.companyId`, `agent.adapterType`, `agent.adapterConfig`
- `runtimeConfig` — the resolved adapterConfig passed as `config:` to execute

- [ ] **Step 2: Import `AdapterDefaults` and the company service**

Near the top of `heartbeat.ts`, the company service is likely already imported. If not, add:
```ts
import type { AdapterDefaults } from "@paperclipai/shared";
```

- [ ] **Step 3: Add the merge just before `adapter.execute()`**

Find the block that looks like:
```ts
const adapterResult = await adapter.execute({
  runId: run.id,
  agent,
  runtime: runtimeForAdapter,
  config: runtimeConfig,
  ...
```

Replace `config: runtimeConfig` with a merge that applies company defaults as fallback:

```ts
// Merge company adapter defaults (agent-level config wins)
const companyAdapterDefaults = await companySvc
  .get(agent.companyId)
  .then((co) => {
    if (!co?.adapterDefaults) return {};
    const key = agent.adapterType as keyof AdapterDefaults;
    return (co.adapterDefaults as AdapterDefaults)[key] ?? {};
  })
  .catch(() => ({}));

const mergedAdapterConfig = { ...companyAdapterDefaults, ...(runtimeConfig as Record<string, unknown>) };

const adapterResult = await adapter.execute({
  runId: run.id,
  agent,
  runtime: runtimeForAdapter,
  config: mergedAdapterConfig,
  ...
```

> **Check:** Confirm `companySvc` is already in scope at this point in the file. Search for `companySvc` or `companyService` near the top of the function. If not, use the `db` reference already available to create one: `const companySvc = companyService(db);` — look at the existing service instantiation pattern in this file.

- [ ] **Step 4: Typecheck**

```bash
pnpm -r typecheck
```

Expected: no errors.

- [ ] **Step 5: Run all tests**

```bash
pnpm test:run
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add server/src/services/heartbeat.ts
git commit -m "feat(server): merge company adapterDefaults into agent config before execute()"
```

---

## Task 5: UI — Adapter Defaults section in CompanySettings

**Files:**
- Modify: `ui/src/pages/CompanySettings.tsx`

- [ ] **Step 1: Add local state for adapterDefaults**

In `CompanySettings.tsx`, after the existing `const [brandColor, setBrandColor] = useState("")` line, add:

```ts
const [lmStudioBaseUrl, setLmStudioBaseUrl] = useState("");
const [ollamaBaseUrl, setOllamaBaseUrl] = useState("");
```

- [ ] **Step 2: Sync state from selectedCompany**

In the `useEffect` that syncs from `selectedCompany`, add:

```ts
setLmStudioBaseUrl(selectedCompany.adapterDefaults?.lm_studio_local?.baseUrl ?? "");
setOllamaBaseUrl(selectedCompany.adapterDefaults?.ollama_local?.baseUrl ?? "");
```

- [ ] **Step 3: Add dirty check**

Find `const generalDirty = ...`. Add a separate dirty flag:

```ts
const adapterDefaultsDirty =
  !!selectedCompany &&
  (lmStudioBaseUrl !== (selectedCompany.adapterDefaults?.lm_studio_local?.baseUrl ?? "") ||
   ollamaBaseUrl !== (selectedCompany.adapterDefaults?.ollama_local?.baseUrl ?? ""));
```

- [ ] **Step 4: Add save mutation**

After the existing `generalMutation`, add:

```ts
const adapterDefaultsMutation = useMutation({
  mutationFn: () =>
    companiesApi.update(selectedCompanyId!, {
      adapterDefaults: {
        lm_studio_local: lmStudioBaseUrl ? { baseUrl: lmStudioBaseUrl } : undefined,
        ollama_local: ollamaBaseUrl ? { baseUrl: ollamaBaseUrl } : undefined,
      },
    }),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
    pushToast({ title: "어댑터 기본값 저장됨", variant: "success" });
  },
});
```

- [ ] **Step 5: Add the UI section**

Find the existing "일반" or "General" section in the JSX (look for where `companyName` field is rendered). Add a new section after the Hiring/Approval section:

```tsx
{/* Adapter Defaults */}
<div className="space-y-4">
  <h3 className="text-sm font-medium">어댑터 기본값</h3>
  <p className="text-xs text-muted-foreground">
    에이전트에 Base URL이 설정되지 않은 경우 여기서 지정한 값이 사용됩니다.
  </p>
  <Field label="LM Studio Base URL">
    <input
      type="text"
      className="w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40"
      placeholder="http://192.168.x.x:1234"
      value={lmStudioBaseUrl}
      onChange={(e) => setLmStudioBaseUrl(e.target.value)}
    />
  </Field>
  <Field label="Ollama Base URL">
    <input
      type="text"
      className="w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40"
      placeholder="http://192.168.x.x:11434"
      value={ollamaBaseUrl}
      onChange={(e) => setOllamaBaseUrl(e.target.value)}
    />
  </Field>
  <Button
    onClick={() => adapterDefaultsMutation.mutate()}
    disabled={!adapterDefaultsDirty || adapterDefaultsMutation.isPending}
    size="sm"
  >
    {adapterDefaultsMutation.isPending ? "저장 중..." : "저장"}
  </Button>
</div>
```

> **Note:** `Field` is already imported from `../components/agent-config-primitives`. `Button` is already imported from `@/components/ui/button`. Follow the exact import/component patterns in the existing file.

- [ ] **Step 6: Typecheck**

```bash
pnpm -r typecheck
```

Expected: no errors. If `selectedCompany.adapterDefaults` shows a type error, the `Company` type in shared needs to include it — check that `packages/shared/src/types/` or wherever `Company` is inferred from includes the DB column.

- [ ] **Step 7: Build**

```bash
pnpm build
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add ui/src/pages/CompanySettings.tsx
git commit -m "feat(ui): add Adapter Defaults section in CompanySettings for LM Studio and Ollama"
```

---

## Task 6: Verification

- [ ] **Step 1: Run full check**

```bash
pnpm -r typecheck && pnpm test:run && pnpm build
```

Expected: all pass.

- [ ] **Step 2: Manual smoke test**

1. Start dev server: `pnpm dev`
2. Open `http://localhost:3100`
3. Go to Company Settings → find "어댑터 기본값" section
4. Enter `http://<ubuntu-server-ip>:1234` for LM Studio, save
5. Open an existing `lm_studio_local` agent — confirm its Base URL field is still empty
6. Trigger a heartbeat run — confirm in logs that the adapter receives the company default URL
7. Now set a Base URL directly on the agent → confirm that the agent-level value wins over the company default

- [ ] **Step 3: Final commit if any fixups**

```bash
git add -p
git commit -m "fix: address review findings for company adapter defaults"
```
