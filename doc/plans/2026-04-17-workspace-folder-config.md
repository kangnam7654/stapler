# Workspace Folder Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 보드 사용자가 회사/프로젝트 단위로 산출물 폴더를 명시 지정하고, UI에서 actual 절대 경로를 확인하며, Finder/Copy/IDE 바로가기를 사용할 수 있게 한다.

**Architecture:** `companies.workspace_root_path` + `projects.workspace_path_override` 두 컬럼 추가, `packages/shared`에 fallback resolver 구현, `server` API 확장 + heartbeat 통합, UI는 회사 설정/프로젝트 상세에 입력 섹션과 바로가기 컴포넌트 추가, Desktop은 Tauri commands로 OS shell 호출.

**Tech Stack:** TypeScript (server/ui/shared), Drizzle ORM (Postgres/PGlite), Express + zod, React + TanStack Query, Tauri v2 + Rust, Vitest, Playwright, pnpm workspaces.

**Spec:** [doc/llm/workspace-folder-config.md](../llm/workspace-folder-config.md)

---

## Pre-flight

- [ ] **Step P1: Verify clean tree**

```bash
cd /Users/kangnam/projects/stapler
git status
```

Expected: clean working tree on a feature branch (or main with explicit user OK). If dirty, stop and ask.

- [ ] **Step P2: Confirm baseline build is green**

```bash
pnpm -r typecheck
```

Expected: PASS. If existing failures, surface them — don't add new work on a broken baseline.

---

## Task 1: DB Schema — 두 컬럼 + Migration

**Files:**
- Modify: `packages/db/src/schema/companies.ts`
- Modify: `packages/db/src/schema/projects.ts`
- Create: `packages/db/src/migrations/00XX_workspace_folder_columns.sql` (drizzle-generate)

- [ ] **Step 1.1: Add `workspaceRootPath` to companies schema**

Edit `packages/db/src/schema/companies.ts`. Add after `adapterDefaults` line:

```ts
adapterDefaults: jsonb("adapter_defaults"),
workspaceRootPath: text("workspace_root_path"),
createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
```

- [ ] **Step 1.2: Add `workspacePathOverride` to projects schema**

Edit `packages/db/src/schema/projects.ts`. Add after `executionWorkspacePolicy` line:

```ts
executionWorkspacePolicy: jsonb("execution_workspace_policy").$type<Record<string, unknown>>(),
workspacePathOverride: text("workspace_path_override"),
archivedAt: timestamp("archived_at", { withTimezone: true }),
```

- [ ] **Step 1.3: Generate migration**

```bash
cd /Users/kangnam/projects/stapler
pnpm db:generate
```

Expected: new SQL file in `packages/db/src/migrations/` with both `ALTER TABLE` statements. Check filename like `0054_xxx.sql`.

- [ ] **Step 1.4: Verify generated SQL**

Open the new migration file. It should contain (or equivalent):

```sql
ALTER TABLE "companies" ADD COLUMN "workspace_root_path" text;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "workspace_path_override" text;
```

If the diff includes anything else, stop — schema is out of sync somehow.

- [ ] **Step 1.5: Typecheck**

```bash
pnpm -r typecheck
```

Expected: PASS.

- [ ] **Step 1.6: Commit**

```bash
git add packages/db/src/schema/companies.ts \
        packages/db/src/schema/projects.ts \
        packages/db/src/migrations/
git commit -m "feat(db): add workspace_root_path/workspace_path_override columns"
```

---

## Task 2: Shared — `toWorkspaceSlug()` (TDD)

**Files:**
- Create: `packages/shared/src/workspace-path/slug.ts`
- Create: `packages/shared/src/__tests__/workspace-path-slug.test.ts`

- [ ] **Step 2.1: Write failing test**

Create `packages/shared/src/__tests__/workspace-path-slug.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { toWorkspaceSlug } from "../workspace-path/slug.js";

describe("toWorkspaceSlug", () => {
  it("ASCII alphanumeric → kebab-case lower", () => {
    expect(toWorkspaceSlug("Acme Corp")).toBe("acme-corp");
    expect(toWorkspaceSlug("Calculator V2")).toBe("calculator-v2");
  });

  it("strips special chars and collapses dashes", () => {
    expect(toWorkspaceSlug("Foo!! / Bar  Baz")).toBe("foo-bar-baz");
  });

  it("non-ASCII (Korean) → hash fallback with prefix", () => {
    const out = toWorkspaceSlug("디자인팀");
    expect(out).toMatch(/^name-[0-9a-f]{8}$/);
  });

  it("is deterministic for same input", () => {
    expect(toWorkspaceSlug("디자인팀")).toBe(toWorkspaceSlug("디자인팀"));
  });

  it("different non-ASCII inputs produce different hashes", () => {
    expect(toWorkspaceSlug("디자인팀")).not.toBe(toWorkspaceSlug("개발팀"));
  });

  it("trims leading/trailing dashes", () => {
    expect(toWorkspaceSlug("  -hello-  ")).toBe("hello");
  });

  it("empty input → hash of empty string", () => {
    const out = toWorkspaceSlug("");
    expect(out).toMatch(/^name-[0-9a-f]{8}$/);
  });
});
```

- [ ] **Step 2.2: Run test, verify it fails**

```bash
pnpm --filter @paperclipai/shared test workspace-path-slug
```

Expected: FAIL with module not found.

- [ ] **Step 2.3: Implement**

Create `packages/shared/src/workspace-path/slug.ts`:

```ts
import { createHash } from "node:crypto";

export function toWorkspaceSlug(name: string): string {
  const ascii = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (ascii.length > 0) return ascii;
  const hash = createHash("sha256").update(name).digest("hex").slice(0, 8);
  return `name-${hash}`;
}
```

- [ ] **Step 2.4: Run test, verify pass**

```bash
pnpm --filter @paperclipai/shared test workspace-path-slug
```

Expected: PASS, all 7 cases.

- [ ] **Step 2.5: Commit**

```bash
git add packages/shared/src/workspace-path/slug.ts \
        packages/shared/src/__tests__/workspace-path-slug.test.ts
git commit -m "feat(shared): toWorkspaceSlug helper with ASCII/hash fallback"
```

---

## Task 3: Shared — `workspacePathSchema` Validator (TDD)

**Files:**
- Modify: `packages/shared/src/validators/workspace-path.ts` (new)
- Modify: `packages/shared/src/validators/index.ts`
- Create: `packages/shared/src/__tests__/workspace-path-schema.test.ts`

- [ ] **Step 3.1: Write failing test**

Create `packages/shared/src/__tests__/workspace-path-schema.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { workspacePathSchema } from "../validators/workspace-path.js";

describe("workspacePathSchema", () => {
  it("accepts absolute POSIX path", () => {
    const r = workspacePathSchema.safeParse("/home/user/work");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe("/home/user/work");
  });

  it("accepts tilde-prefixed path", () => {
    const r = workspacePathSchema.safeParse("~/Stapler/acme");
    expect(r.success).toBe(true);
  });

  it("accepts null", () => {
    const r = workspacePathSchema.safeParse(null);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBeNull();
  });

  it("normalizes empty string to null", () => {
    const r = workspacePathSchema.safeParse("");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBeNull();
  });

  it("normalizes whitespace-only string to null", () => {
    const r = workspacePathSchema.safeParse("   ");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBeNull();
  });

  it("rejects relative path", () => {
    const r = workspacePathSchema.safeParse("relative/path");
    expect(r.success).toBe(false);
  });

  it("rejects path > 1024 chars", () => {
    const long = "/" + "x".repeat(1024);
    const r = workspacePathSchema.safeParse(long);
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 3.2: Run test, verify it fails**

```bash
pnpm --filter @paperclipai/shared test workspace-path-schema
```

Expected: FAIL (module not found).

- [ ] **Step 3.3: Implement validator**

Create `packages/shared/src/validators/workspace-path.ts`:

```ts
import { z } from "zod";

export const workspacePathSchema = z
  .union([z.string(), z.null()])
  .transform((v) => {
    if (v === null) return null;
    const trimmed = v.trim();
    return trimmed === "" ? null : trimmed;
  })
  .superRefine((v, ctx) => {
    if (v === null) return;
    if (v.length > 1024) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "path > 1024 chars" });
      return;
    }
    if (!/^(\/|~\/)/.test(v)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "absolute path required (/... or ~/...)",
      });
    }
  });

export type WorkspacePath = z.infer<typeof workspacePathSchema>;
```

- [ ] **Step 3.4: Re-export from validators barrel**

Edit `packages/shared/src/validators/index.ts`. Add at end of exports:

```ts
export { workspacePathSchema, type WorkspacePath } from "./workspace-path.js";
```

(Find existing export pattern in the file and follow it — likely a `export *` or named exports block.)

- [ ] **Step 3.5: Run test, verify pass**

```bash
pnpm --filter @paperclipai/shared test workspace-path-schema
```

Expected: PASS, all 7 cases.

- [ ] **Step 3.6: Commit**

```bash
git add packages/shared/src/validators/workspace-path.ts \
        packages/shared/src/validators/index.ts \
        packages/shared/src/__tests__/workspace-path-schema.test.ts
git commit -m "feat(shared): workspacePathSchema validator (absolute, nullable, ≤1024)"
```

---

## Task 4: Shared — `resolveProjectWorkspacePath()` Resolver (TDD)

**Files:**
- Create: `packages/shared/src/workspace-path/resolve.ts`
- Create: `packages/shared/src/__tests__/workspace-path-resolve.test.ts`

- [ ] **Step 4.1: Write failing test**

Create `packages/shared/src/__tests__/workspace-path-resolve.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolveProjectWorkspacePath } from "../workspace-path/resolve.js";

const DEFAULT_ROOT = "/home/user/Stapler";

describe("resolveProjectWorkspacePath", () => {
  it("project override wins", () => {
    const r = resolveProjectWorkspacePath({
      companySlug: "acme",
      projectSlug: "calc",
      companyRootPath: "/work/acme",
      projectPathOverride: "/dev/legacy",
      systemDefaultRoot: DEFAULT_ROOT,
    });
    expect(r.resolvedAbsolutePath).toBe("/dev/legacy");
    expect(r.source).toBe("project_override");
  });

  it("company root + project slug", () => {
    const r = resolveProjectWorkspacePath({
      companySlug: "acme",
      projectSlug: "calc",
      companyRootPath: "/work/acme",
      projectPathOverride: null,
      systemDefaultRoot: DEFAULT_ROOT,
    });
    expect(r.resolvedAbsolutePath).toBe("/work/acme/calc");
    expect(r.source).toBe("company_root");
  });

  it("system default fallback when both null", () => {
    const r = resolveProjectWorkspacePath({
      companySlug: "acme",
      projectSlug: "calc",
      companyRootPath: null,
      projectPathOverride: null,
      systemDefaultRoot: DEFAULT_ROOT,
    });
    expect(r.resolvedAbsolutePath).toBe("/home/user/Stapler/acme/calc");
    expect(r.source).toBe("system_default");
  });

  it("strips trailing slash from company root", () => {
    const r = resolveProjectWorkspacePath({
      companySlug: "acme",
      projectSlug: "calc",
      companyRootPath: "/work/acme/",
      projectPathOverride: null,
      systemDefaultRoot: DEFAULT_ROOT,
    });
    expect(r.resolvedAbsolutePath).toBe("/work/acme/calc");
  });

  it("strips trailing slash from override", () => {
    const r = resolveProjectWorkspacePath({
      companySlug: "acme",
      projectSlug: "calc",
      companyRootPath: null,
      projectPathOverride: "/dev/legacy/",
      systemDefaultRoot: DEFAULT_ROOT,
    });
    expect(r.resolvedAbsolutePath).toBe("/dev/legacy");
  });

  it("strips trailing slash from system default root", () => {
    const r = resolveProjectWorkspacePath({
      companySlug: "acme",
      projectSlug: "calc",
      companyRootPath: null,
      projectPathOverride: null,
      systemDefaultRoot: "/home/user/Stapler/",
    });
    expect(r.resolvedAbsolutePath).toBe("/home/user/Stapler/acme/calc");
  });
});
```

- [ ] **Step 4.2: Run test, verify it fails**

```bash
pnpm --filter @paperclipai/shared test workspace-path-resolve
```

Expected: FAIL (module not found).

- [ ] **Step 4.3: Implement resolver**

Create `packages/shared/src/workspace-path/resolve.ts`:

```ts
export interface ResolveProjectWorkspacePathInput {
  companySlug: string;
  projectSlug: string;
  companyRootPath: string | null;
  projectPathOverride: string | null;
  systemDefaultRoot: string;
}

export interface ResolvedProjectWorkspacePath {
  resolvedAbsolutePath: string;
  source: "project_override" | "company_root" | "system_default";
}

function stripTrailingSlash(p: string): string {
  return p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p;
}

export function resolveProjectWorkspacePath(
  input: ResolveProjectWorkspacePathInput,
): ResolvedProjectWorkspacePath {
  if (input.projectPathOverride) {
    return {
      resolvedAbsolutePath: stripTrailingSlash(input.projectPathOverride),
      source: "project_override",
    };
  }
  if (input.companyRootPath) {
    const root = stripTrailingSlash(input.companyRootPath);
    return {
      resolvedAbsolutePath: `${root}/${input.projectSlug}`,
      source: "company_root",
    };
  }
  const root = stripTrailingSlash(input.systemDefaultRoot);
  return {
    resolvedAbsolutePath: `${root}/${input.companySlug}/${input.projectSlug}`,
    source: "system_default",
  };
}
```

- [ ] **Step 4.4: Run test, verify pass**

```bash
pnpm --filter @paperclipai/shared test workspace-path-resolve
```

Expected: PASS, all 6 cases.

- [ ] **Step 4.5: Commit**

```bash
git add packages/shared/src/workspace-path/resolve.ts \
        packages/shared/src/__tests__/workspace-path-resolve.test.ts
git commit -m "feat(shared): resolveProjectWorkspacePath fallback chain"
```

---

## Task 5: Shared — Barrel Export

**Files:**
- Create: `packages/shared/src/workspace-path/index.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 5.1: Create barrel**

Create `packages/shared/src/workspace-path/index.ts`:

```ts
export { toWorkspaceSlug } from "./slug.js";
export {
  resolveProjectWorkspacePath,
  type ResolveProjectWorkspacePathInput,
  type ResolvedProjectWorkspacePath,
} from "./resolve.js";
```

- [ ] **Step 5.2: Re-export from main index**

Edit `packages/shared/src/index.ts`. Add a new export block (place near other workspace/types exports):

```ts
export {
  toWorkspaceSlug,
  resolveProjectWorkspacePath,
  type ResolveProjectWorkspacePathInput,
  type ResolvedProjectWorkspacePath,
} from "./workspace-path/index.js";
```

- [ ] **Step 5.3: Typecheck**

```bash
pnpm -r typecheck
```

Expected: PASS.

- [ ] **Step 5.4: Commit**

```bash
git add packages/shared/src/workspace-path/index.ts \
        packages/shared/src/index.ts
git commit -m "feat(shared): barrel export workspace-path module"
```

---

## Task 6: Server — Companies POST/PATCH 확장 (TDD)

**Files:**
- Modify: `packages/shared/src/validators/company.ts`
- Modify: `server/src/routes/companies.ts` (no change expected — validator drives behavior)
- Create: `server/src/__tests__/companies-workspace-root.test.ts`

- [ ] **Step 6.1: Write failing test**

Create `server/src/__tests__/companies-workspace-root.test.ts` modeled on the existing `companies-adapter-defaults.test.ts`:

```ts
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCompanyService = vi.hoisted(() => ({
  list: vi.fn(),
  stats: vi.fn(),
  getById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  archive: vi.fn(),
  remove: vi.fn(),
}));

const mockLogActivity = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockAccessService = vi.hoisted(() => ({
  ensureMembership: vi.fn().mockResolvedValue(undefined),
}));
const mockBudgetService = vi.hoisted(() => ({
  upsertPolicy: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../services/companies.js", () => ({ companyService: () => mockCompanyService }));
vi.mock("../services/activity.js", () => ({ logActivity: mockLogActivity }));
vi.mock("../services/access.js", () => ({ accessService: () => mockAccessService }));
vi.mock("../services/budgets.js", () => ({ budgetService: () => mockBudgetService }));
vi.mock("../services/company-docs.js", () => ({ ensureCompanyDocs: vi.fn() }));

import { companyRoutes } from "../routes/companies.js";
import { errorHandler } from "../middleware/index.js";

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = { type: "board", userId: "user-1", source: "local_implicit", isInstanceAdmin: true };
    next();
  });
  app.use("/api/companies", companyRoutes({} as any));
  app.use(errorHandler);
  return app;
}

function baseCompany(overrides: Record<string, unknown> = {}) {
  return {
    id: "company-1",
    name: "Acme",
    description: null,
    status: "active",
    budgetMonthlyCents: 0,
    spentMonthlyCents: 0,
    requireBoardApprovalForNewAgents: true,
    brandColor: null,
    adapterDefaults: null,
    workspaceRootPath: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("companies — workspaceRootPath round-trip", () => {
  beforeEach(() => {
    Object.values(mockCompanyService).forEach((fn) => fn.mockReset());
    mockLogActivity.mockReset();
  });

  it("PATCH persists workspaceRootPath and returns it", async () => {
    const updated = baseCompany({ workspaceRootPath: "/work/acme" });
    mockCompanyService.update.mockResolvedValue(updated);
    const app = createApp();
    const res = await request(app).patch("/api/companies/company-1").send({
      workspaceRootPath: "/work/acme",
    });
    expect(res.status).toBe(200);
    expect(res.body.workspaceRootPath).toBe("/work/acme");
    expect(mockCompanyService.update).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({ workspaceRootPath: "/work/acme" }),
    );
  });

  it("PATCH normalizes empty string to null", async () => {
    const updated = baseCompany({ workspaceRootPath: null });
    mockCompanyService.update.mockResolvedValue(updated);
    const app = createApp();
    const res = await request(app).patch("/api/companies/company-1").send({
      workspaceRootPath: "",
    });
    expect(res.status).toBe(200);
    expect(mockCompanyService.update).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({ workspaceRootPath: null }),
    );
  });

  it("PATCH rejects relative path with 400/422", async () => {
    const app = createApp();
    const res = await request(app).patch("/api/companies/company-1").send({
      workspaceRootPath: "relative/path",
    });
    expect([400, 422]).toContain(res.status);
    expect(mockCompanyService.update).not.toHaveBeenCalled();
  });

  it("POST accepts workspaceRootPath at create time", async () => {
    const created = baseCompany({ workspaceRootPath: "~/work/acme" });
    mockCompanyService.create.mockResolvedValue(created);
    const app = createApp();
    const res = await request(app).post("/api/companies").send({
      name: "Acme",
      workspaceRootPath: "~/work/acme",
    });
    expect(res.status).toBe(201);
    expect(res.body.workspaceRootPath).toBe("~/work/acme");
  });
});
```

- [ ] **Step 6.2: Run test, verify it fails**

```bash
pnpm --filter @paperclipai/server test companies-workspace-root
```

Expected: FAIL — likely workspaceRootPath is silently dropped (zod strips unknown), or the schema doesn't include it.

- [ ] **Step 6.3: Extend validators**

Edit `packages/shared/src/validators/company.ts`. Add import at top:

```ts
import { workspacePathSchema } from "./workspace-path.js";
```

Then in `createCompanySchema`, add field:

```ts
export const createCompanySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  budgetMonthlyCents: z.number().int().nonnegative().optional().default(0),
  workspaceRootPath: workspacePathSchema.optional(),
});
```

`updateCompanySchema` automatically inherits via `.partial().extend()` — but explicitly add to the `.extend({ ... })` block too for clarity:

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
    workspaceRootPath: workspacePathSchema.optional(),
  });
```

- [ ] **Step 6.4: Verify Company type includes new field**

Edit `packages/shared/src/types/company.ts` (read it first to find pattern). Add `workspaceRootPath: string | null` to the `Company` type. If the type is derived from a Drizzle inferred type via `InferSelectModel<typeof companies>`, the new column flows through automatically — verify by typecheck.

```bash
pnpm -r typecheck
```

Expected: PASS.

- [ ] **Step 6.5: Run test, verify pass**

```bash
pnpm --filter @paperclipai/server test companies-workspace-root
```

Expected: PASS, all 4 cases.

- [ ] **Step 6.6: Commit**

```bash
git add packages/shared/src/validators/company.ts \
        packages/shared/src/types/company.ts \
        server/src/__tests__/companies-workspace-root.test.ts
git commit -m "feat(server): companies POST/PATCH accept workspaceRootPath"
```

---

## Task 7: Server — Projects POST/PATCH 확장 (TDD)

**Files:**
- Modify: `packages/shared/src/validators/project.ts` (or wherever project validators live)
- Modify: `packages/shared/src/types/project.ts`
- Create: `server/src/__tests__/projects-workspace-override.test.ts`

- [ ] **Step 7.1: Locate project validators**

```bash
grep -rn "createProjectSchema\|updateProjectSchema" packages/shared/src/
```

Note the exact file path. Most likely `packages/shared/src/validators/project.ts`.

- [ ] **Step 7.2: Write failing test**

Create `server/src/__tests__/projects-workspace-override.test.ts` modeled on Task 6 (mock projectService etc.). Test cases:
- PATCH `/api/projects/:id` with `workspacePathOverride: "/dev/legacy"` → 200, persists, returns
- PATCH with `""` → null
- PATCH with `"relative"` → 400/422
- POST `/api/companies/:id/projects` with `workspacePathOverride: "~/dev/legacy"` → 201, returns

(Reference companies test for full mock structure. Adapt service mock names: `mockProjectService = { create, update, getById, ... }`. Mock paths: `vi.mock("../services/projects.js", ...)`)

Full code:

```ts
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockProjectService = vi.hoisted(() => ({
  list: vi.fn(),
  getById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  createWorkspace: vi.fn(),
}));
const mockLogActivity = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("../services/projects.js", () => ({ projectService: () => mockProjectService }));
vi.mock("../services/activity.js", () => ({ logActivity: mockLogActivity }));

import { projectRoutes } from "../routes/projects.js";
import { errorHandler } from "../middleware/index.js";

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = { type: "board", userId: "user-1", source: "local_implicit", isInstanceAdmin: true };
    next();
  });
  app.use("/api", projectRoutes({} as any));
  app.use(errorHandler);
  return app;
}

function baseProject(overrides: Record<string, unknown> = {}) {
  return {
    id: "project-1",
    companyId: "company-1",
    name: "Calc",
    description: null,
    status: "backlog",
    workspacePathOverride: null,
    archivedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("projects — workspacePathOverride round-trip", () => {
  beforeEach(() => {
    Object.values(mockProjectService).forEach((fn) => fn.mockReset());
    mockLogActivity.mockReset();
  });

  it("PATCH persists workspacePathOverride", async () => {
    mockProjectService.getById.mockResolvedValue(baseProject());
    mockProjectService.update.mockResolvedValue(baseProject({ workspacePathOverride: "/dev/legacy" }));
    const app = createApp();
    const res = await request(app).patch("/api/projects/project-1").send({
      workspacePathOverride: "/dev/legacy",
    });
    expect(res.status).toBe(200);
    expect(res.body.workspacePathOverride).toBe("/dev/legacy");
  });

  it("PATCH normalizes empty string to null", async () => {
    mockProjectService.getById.mockResolvedValue(baseProject({ workspacePathOverride: "/old" }));
    mockProjectService.update.mockResolvedValue(baseProject({ workspacePathOverride: null }));
    const app = createApp();
    const res = await request(app).patch("/api/projects/project-1").send({
      workspacePathOverride: "",
    });
    expect(res.status).toBe(200);
    expect(mockProjectService.update).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({ workspacePathOverride: null }),
    );
  });

  it("PATCH rejects relative path", async () => {
    mockProjectService.getById.mockResolvedValue(baseProject());
    const app = createApp();
    const res = await request(app).patch("/api/projects/project-1").send({
      workspacePathOverride: "relative",
    });
    expect([400, 422]).toContain(res.status);
  });

  it("POST accepts workspacePathOverride at create", async () => {
    mockProjectService.create.mockResolvedValue(baseProject({ workspacePathOverride: "~/dev/legacy" }));
    const app = createApp();
    const res = await request(app).post("/api/companies/company-1/projects").send({
      name: "Calc",
      workspacePathOverride: "~/dev/legacy",
    });
    expect(res.status).toBe(201);
    expect(res.body.workspacePathOverride).toBe("~/dev/legacy");
  });
});
```

- [ ] **Step 7.3: Run test, verify it fails**

```bash
pnpm --filter @paperclipai/server test projects-workspace-override
```

Expected: FAIL.

- [ ] **Step 7.4: Extend project validators**

Edit `packages/shared/src/validators/project.ts` (path from Step 7.1). Add `workspacePathSchema` import and field to both `createProjectSchema` and `updateProjectSchema`:

```ts
import { workspacePathSchema } from "./workspace-path.js";

// In createProjectSchema definition:
workspacePathOverride: workspacePathSchema.optional(),

// In updateProjectSchema (if it's not auto-extended):
workspacePathOverride: workspacePathSchema.optional(),
```

- [ ] **Step 7.5: Update Project type**

Edit `packages/shared/src/types/project.ts`. Add `workspacePathOverride: string | null` to the Project type (if not auto-derived from Drizzle).

- [ ] **Step 7.6: Run test, verify pass**

```bash
pnpm --filter @paperclipai/server test projects-workspace-override
pnpm -r typecheck
```

Expected: PASS.

- [ ] **Step 7.7: Commit**

```bash
git add packages/shared/src/validators/project.ts \
        packages/shared/src/types/project.ts \
        server/src/__tests__/projects-workspace-override.test.ts
git commit -m "feat(server): projects POST/PATCH accept workspacePathOverride"
```

---

## Task 8: Server — `GET /projects/:id/workspace-path` Endpoint (TDD)

**Files:**
- Create: `server/src/services/workspace-path-service.ts`
- Modify: `server/src/routes/projects.ts`
- Create: `server/src/__tests__/projects-workspace-path-get.test.ts`

- [ ] **Step 8.1: Write failing test**

Create `server/src/__tests__/projects-workspace-path-get.test.ts`:

```ts
import express from "express";
import request from "supertest";
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockProjectService = vi.hoisted(() => ({
  getById: vi.fn(),
}));
const mockCompanyService = vi.hoisted(() => ({
  getById: vi.fn(),
}));

vi.mock("../services/projects.js", () => ({ projectService: () => mockProjectService }));
vi.mock("../services/companies.js", () => ({ companyService: () => mockCompanyService }));

import { projectRoutes } from "../routes/projects.js";
import { errorHandler } from "../middleware/index.js";

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = { type: "board", userId: "user-1", source: "local_implicit" };
    next();
  });
  app.use("/api", projectRoutes({} as any));
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  mockProjectService.getById.mockReset();
  mockCompanyService.getById.mockReset();
});

describe("GET /api/projects/:id/workspace-path", () => {
  it("returns project_override when set", async () => {
    mockProjectService.getById.mockResolvedValue({
      id: "p1", companyId: "c1", name: "Calc",
      workspacePathOverride: "/dev/legacy",
    });
    mockCompanyService.getById.mockResolvedValue({
      id: "c1", name: "Acme", workspaceRootPath: "/work/acme",
    });
    const res = await request(createApp()).get("/api/projects/p1/workspace-path");
    expect(res.status).toBe(200);
    expect(res.body.resolvedAbsolutePath).toBe("/dev/legacy");
    expect(res.body.source).toBe("project_override");
  });

  it("returns company_root when override null", async () => {
    mockProjectService.getById.mockResolvedValue({
      id: "p1", companyId: "c1", name: "Calc",
      workspacePathOverride: null,
    });
    mockCompanyService.getById.mockResolvedValue({
      id: "c1", name: "Acme", workspaceRootPath: "/work/acme",
    });
    const res = await request(createApp()).get("/api/projects/p1/workspace-path");
    expect(res.status).toBe(200);
    expect(res.body.resolvedAbsolutePath).toBe("/work/acme/calc");
    expect(res.body.source).toBe("company_root");
  });

  it("returns system_default when both null", async () => {
    mockProjectService.getById.mockResolvedValue({
      id: "p1", companyId: "c1", name: "Calc",
      workspacePathOverride: null,
    });
    mockCompanyService.getById.mockResolvedValue({
      id: "c1", name: "Acme", workspaceRootPath: null,
    });
    const res = await request(createApp()).get("/api/projects/p1/workspace-path");
    expect(res.status).toBe(200);
    expect(res.body.source).toBe("system_default");
    expect(res.body.resolvedAbsolutePath).toMatch(/\/Stapler\/acme\/calc$/);
  });

  it("404 when project not found", async () => {
    mockProjectService.getById.mockResolvedValue(null);
    const res = await request(createApp()).get("/api/projects/p1/workspace-path");
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 8.2: Run, verify fail**

```bash
pnpm --filter @paperclipai/server test projects-workspace-path-get
```

Expected: FAIL — endpoint not exists, 404 on every case.

- [ ] **Step 8.3: Implement service**

Create `server/src/services/workspace-path-service.ts`:

```ts
import * as os from "node:os";
import {
  resolveProjectWorkspacePath,
  toWorkspaceSlug,
  type ResolvedProjectWorkspacePath,
} from "@paperclipai/shared";

export function systemDefaultRoot(): string {
  const env = process.env.STAPLER_WORKSPACE_ROOT;
  if (env && env.trim().length > 0) return env.trim();
  return `${os.homedir()}/Stapler`;
}

export interface ResolveForProjectInput {
  companyName: string;
  companyRootPath: string | null;
  projectName: string;
  projectPathOverride: string | null;
}

export function resolveForProject(input: ResolveForProjectInput): ResolvedProjectWorkspacePath {
  return resolveProjectWorkspacePath({
    companySlug: toWorkspaceSlug(input.companyName),
    projectSlug: toWorkspaceSlug(input.projectName),
    companyRootPath: input.companyRootPath,
    projectPathOverride: input.projectPathOverride,
    systemDefaultRoot: systemDefaultRoot(),
  });
}
```

- [ ] **Step 8.4: Add route**

Edit `server/src/routes/projects.ts`. After the existing `GET /projects/:id` handler, add:

```ts
import { resolveForProject } from "../services/workspace-path-service.js";
import { companyService } from "../services/companies.js";
// ... in route registration block:

router.get("/projects/:id/workspace-path", async (req, res) => {
  const id = req.params.id as string;
  const project = await svc.getById(id);
  if (!project) {
    res.status(404).json({ error: t("error.projectNotFound") });
    return;
  }
  assertCompanyAccess(req, project.companyId);
  const company = await companyService(db).getById(project.companyId);
  if (!company) {
    res.status(404).json({ error: t("error.companyNotFound") });
    return;
  }
  const resolved = resolveForProject({
    companyName: company.name,
    companyRootPath: company.workspaceRootPath ?? null,
    projectName: project.name,
    projectPathOverride: project.workspacePathOverride ?? null,
  });
  res.json(resolved);
});
```

(If the existing routes file imports `companyService` differently or uses a wrapper for `db`, follow that pattern.)

- [ ] **Step 8.5: Run test, verify pass**

```bash
pnpm --filter @paperclipai/server test projects-workspace-path-get
```

Expected: PASS, all 4 cases.

- [ ] **Step 8.6: Commit**

```bash
git add server/src/services/workspace-path-service.ts \
        server/src/routes/projects.ts \
        server/src/__tests__/projects-workspace-path-get.test.ts
git commit -m "feat(server): GET /projects/:id/workspace-path resolved path endpoint"
```

---

## Task 9: Heartbeat — Resolver 통합 (TDD)

**Files:**
- Modify: `server/src/services/heartbeat.ts` (around line 2055-2103, the workspace-policy section)
- Create: `server/src/__tests__/heartbeat-workspace-cwd.test.ts`

- [ ] **Step 9.1: Read existing heartbeat workspace section**

```bash
grep -n "resolveWorkspaceForRun\|executionWorkspaceMode\|cwd" server/src/services/heartbeat.ts | head -30
```

Identify where the resolved adapter `cwd` is finalized before being passed to the adapter runner. The integration point is: if config.cwd is empty after all existing resolution, inject the resolveForProject result.

- [ ] **Step 9.2: Write failing integration test**

Create `server/src/__tests__/heartbeat-workspace-cwd.test.ts`. Cover:
- Adapter config with explicit `cwd` → respected, resolver NOT called
- Adapter config with empty/missing `cwd` → resolver result injected

This test may need significant mocking since heartbeat is a deep service. Use vi.hoisted for `resolveForProject`, mock at the service module boundary:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockResolve = vi.hoisted(() => vi.fn());
vi.mock("../services/workspace-path-service.js", () => ({
  resolveForProject: mockResolve,
  systemDefaultRoot: () => "/tmp/Stapler",
}));

// Heartbeat is too large to test end-to-end here; we test the helper in isolation.
// If heartbeat exposes a sub-function, import and test it. Otherwise create
// a thin wrapper helper `applyWorkspaceCwdFallback(config, projectCtx)` and test that.

import { applyWorkspaceCwdFallback } from "../services/heartbeat-cwd-fallback.js";

beforeEach(() => mockResolve.mockReset());

describe("applyWorkspaceCwdFallback", () => {
  it("respects explicit cwd", () => {
    const out = applyWorkspaceCwdFallback(
      { cwd: "/explicit/cwd", model: "x" },
      { companyName: "Acme", projectName: "Calc", companyRootPath: null, projectPathOverride: null },
    );
    expect(out.cwd).toBe("/explicit/cwd");
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it("injects resolved path when cwd missing", () => {
    mockResolve.mockReturnValue({ resolvedAbsolutePath: "/work/acme/calc", source: "company_root" });
    const out = applyWorkspaceCwdFallback(
      { model: "x" },
      { companyName: "Acme", projectName: "Calc", companyRootPath: "/work/acme", projectPathOverride: null },
    );
    expect(out.cwd).toBe("/work/acme/calc");
  });

  it("injects when cwd is empty string", () => {
    mockResolve.mockReturnValue({ resolvedAbsolutePath: "/work/acme/calc", source: "company_root" });
    const out = applyWorkspaceCwdFallback(
      { cwd: "", model: "x" },
      { companyName: "Acme", projectName: "Calc", companyRootPath: "/work/acme", projectPathOverride: null },
    );
    expect(out.cwd).toBe("/work/acme/calc");
  });
});
```

- [ ] **Step 9.3: Run, verify fail**

```bash
pnpm --filter @paperclipai/server test heartbeat-workspace-cwd
```

Expected: FAIL — module not found.

- [ ] **Step 9.4: Implement helper**

Create `server/src/services/heartbeat-cwd-fallback.ts`:

```ts
import { resolveForProject } from "./workspace-path-service.js";

export interface CwdFallbackProjectCtx {
  companyName: string;
  companyRootPath: string | null;
  projectName: string;
  projectPathOverride: string | null;
}

export function applyWorkspaceCwdFallback<T extends Record<string, unknown> & { cwd?: string }>(
  config: T,
  projectCtx: CwdFallbackProjectCtx,
): T {
  if (typeof config.cwd === "string" && config.cwd.trim().length > 0) {
    return config;
  }
  const resolved = resolveForProject(projectCtx);
  return { ...config, cwd: resolved.resolvedAbsolutePath };
}
```

- [ ] **Step 9.5: Wire into heartbeat**

Edit `server/src/services/heartbeat.ts`. After `normalizeAdapterConfigForAdapterType(...)` (around line 2078), and before the resulting `config` is consumed, look up project (already loaded via `executionProjectId`) and apply fallback:

```ts
import { applyWorkspaceCwdFallback } from "./heartbeat-cwd-fallback.js";

// ... after `const config = normalizeAdapterConfigForAdapterType(...)` :
const projectForCwd = executionProjectId
  ? await db
      .select({ name: projects.name, workspacePathOverride: projects.workspacePathOverride })
      .from(projects)
      .where(and(eq(projects.id, executionProjectId), eq(projects.companyId, agent.companyId)))
      .then((rows) => rows[0] ?? null)
  : null;
const configWithCwd = (projectForCwd && company)
  ? applyWorkspaceCwdFallback(config, {
      companyName: company.name,
      companyRootPath: (company as any).workspaceRootPath ?? null,
      projectName: projectForCwd.name,
      projectPathOverride: projectForCwd.workspacePathOverride ?? null,
    })
  : config;
```

Then replace downstream `config` usage with `configWithCwd` (search for the next `config` reference within this function and update — keep variable rename minimal).

Also: ensure the resolved cwd directory exists before adapter starts. Add right before the adapter is invoked:

```ts
import { mkdir } from "node:fs/promises";
import { resolve as pathResolve } from "node:path";
import * as os from "node:os";

function expandTilde(p: string): string {
  if (p.startsWith("~/")) return pathResolve(os.homedir(), p.slice(2));
  return p;
}

if (typeof configWithCwd.cwd === "string" && configWithCwd.cwd.length > 0) {
  await mkdir(expandTilde(configWithCwd.cwd), { recursive: true });
}
```

- [ ] **Step 9.6: Run unit test, verify pass**

```bash
pnpm --filter @paperclipai/server test heartbeat-workspace-cwd
pnpm -r typecheck
```

Expected: PASS.

- [ ] **Step 9.7: Commit**

```bash
git add server/src/services/heartbeat.ts \
        server/src/services/heartbeat-cwd-fallback.ts \
        server/src/__tests__/heartbeat-workspace-cwd.test.ts
git commit -m "feat(server): heartbeat injects resolved cwd + mkdir before adapter run"
```

---

## Task 10: Tauri — Workspace Commands (Rust)

**Files:**
- Create: `desktop/src/workspace_commands.rs`
- Modify: `desktop/src/lib.rs`
- Modify: `desktop/Cargo.toml`

- [ ] **Step 10.1: Add `dirs` dependency**

Edit `desktop/Cargo.toml`. Under `[dependencies]`, add:

```toml
dirs = "5"
```

- [ ] **Step 10.2: Create commands module**

Create `desktop/src/workspace_commands.rs`:

```rust
use std::path::PathBuf;
use std::process::Command;
use tauri::command;

fn expand_tilde(p: &str) -> PathBuf {
    if let Some(stripped) = p.strip_prefix("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(stripped);
        }
    }
    PathBuf::from(p)
}

fn ensure_dir(p: &PathBuf) -> Result<(), String> {
    std::fs::create_dir_all(p).map_err(|e| format!("mkdir failed: {e}"))
}

#[command]
pub fn workspace_open_finder(abs_path: String) -> Result<(), String> {
    let path = expand_tilde(&abs_path);
    ensure_dir(&path)?;
    let cmd = if cfg!(target_os = "macos") {
        "open"
    } else if cfg!(target_os = "windows") {
        "explorer"
    } else {
        "xdg-open"
    };
    Command::new(cmd)
        .arg(&path)
        .spawn()
        .map_err(|e| format!("open failed: {e}"))?;
    Ok(())
}

#[command]
pub fn workspace_open_ide(abs_path: String) -> Result<(), String> {
    let path = expand_tilde(&abs_path);
    ensure_dir(&path)?;
    Command::new("code")
        .arg(&path)
        .spawn()
        .map_err(|e| format!("code launcher failed: {e}"))?;
    Ok(())
}
```

- [ ] **Step 10.3: Register commands in lib.rs**

Edit `desktop/src/lib.rs`. Add module declaration at the top (after existing `mod` lines):

```rust
mod workspace_commands;
```

Find the existing `tauri::generate_handler![...]` macro call (likely in a `run()` or `Builder::default().invoke_handler(...)` block). Add:

```rust
.invoke_handler(tauri::generate_handler![
    // ... existing commands ...
    workspace_commands::workspace_open_finder,
    workspace_commands::workspace_open_ide,
])
```

(If there are no existing commands, add the macro fresh in the appropriate builder chain.)

- [ ] **Step 10.4: Build desktop**

```bash
cd /Users/kangnam/projects/stapler/desktop
cargo build
```

Expected: PASS. If `dirs` crate not found, run `cargo update` first.

- [ ] **Step 10.5: Commit**

```bash
cd /Users/kangnam/projects/stapler
git add desktop/src/workspace_commands.rs \
        desktop/src/lib.rs \
        desktop/Cargo.toml \
        desktop/Cargo.lock
git commit -m "feat(desktop): Tauri commands workspace_open_finder/workspace_open_ide"
```

---

## Task 11: UI — `isDesktop()` Helper

**Files:**
- Create: `ui/src/runtime/desktop.ts`
- Create: `ui/src/__tests__/runtime-desktop.test.ts`

- [ ] **Step 11.1: Write failing test**

Create `ui/src/__tests__/runtime-desktop.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { isDesktop } from "../runtime/desktop.js";

describe("isDesktop", () => {
  afterEach(() => {
    delete (window as any).__TAURI_INTERNALS__;
  });

  it("returns false in plain browser", () => {
    expect(isDesktop()).toBe(false);
  });

  it("returns true when Tauri internals present", () => {
    (window as any).__TAURI_INTERNALS__ = {};
    expect(isDesktop()).toBe(true);
  });
});
```

- [ ] **Step 11.2: Run, verify fail**

```bash
pnpm --filter @paperclipai/ui test runtime-desktop
```

Expected: FAIL.

- [ ] **Step 11.3: Implement**

Create `ui/src/runtime/desktop.ts`:

```ts
export function isDesktop(): boolean {
  if (typeof window === "undefined") return false;
  return "__TAURI_INTERNALS__" in window;
}
```

- [ ] **Step 11.4: Run, verify pass**

```bash
pnpm --filter @paperclipai/ui test runtime-desktop
```

Expected: PASS.

- [ ] **Step 11.5: Commit**

```bash
git add ui/src/runtime/desktop.ts ui/src/__tests__/runtime-desktop.test.ts
git commit -m "feat(ui): isDesktop runtime helper (Tauri detection)"
```

---

## Task 12: UI — `WorkspacePathActions` Component (TDD)

**Files:**
- Create: `ui/src/components/WorkspacePathActions.tsx`
- Create: `ui/src/__tests__/workspace-path-actions.test.tsx`

- [ ] **Step 12.1: Write failing test**

Create `ui/src/__tests__/workspace-path-actions.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WorkspacePathActions } from "../components/WorkspacePathActions.js";

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: any[]) => mockInvoke(...a) }));

beforeEach(() => {
  mockInvoke.mockReset();
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

afterEach(() => {
  delete (window as any).__TAURI_INTERNALS__;
});

describe("WorkspacePathActions", () => {
  it("renders 3 buttons", () => {
    render(<WorkspacePathActions absolutePath="/test/path" />);
    expect(screen.getByLabelText(/finder|탐색기/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/copy|복사/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/ide|vs code/i)).toBeInTheDocument();
  });

  it("disables finder/ide buttons in web mode", () => {
    render(<WorkspacePathActions absolutePath="/test/path" />);
    expect(screen.getByLabelText(/finder|탐색기/i)).toBeDisabled();
    expect(screen.getByLabelText(/ide|vs code/i)).toBeDisabled();
    expect(screen.getByLabelText(/copy|복사/i)).not.toBeDisabled();
  });

  it("enables finder/ide in desktop mode", () => {
    (window as any).__TAURI_INTERNALS__ = {};
    render(<WorkspacePathActions absolutePath="/test/path" />);
    expect(screen.getByLabelText(/finder|탐색기/i)).not.toBeDisabled();
    expect(screen.getByLabelText(/ide|vs code/i)).not.toBeDisabled();
  });

  it("calls clipboard.writeText on copy click", async () => {
    render(<WorkspacePathActions absolutePath="/test/path" />);
    fireEvent.click(screen.getByLabelText(/copy|복사/i));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("/test/path");
  });

  it("calls Tauri invoke on Finder click in desktop mode", async () => {
    (window as any).__TAURI_INTERNALS__ = {};
    mockInvoke.mockResolvedValue(undefined);
    render(<WorkspacePathActions absolutePath="/test/path" />);
    fireEvent.click(screen.getByLabelText(/finder|탐색기/i));
    expect(mockInvoke).toHaveBeenCalledWith("workspace_open_finder", { absPath: "/test/path" });
  });
});
```

- [ ] **Step 12.2: Run, verify fail**

```bash
pnpm --filter @paperclipai/ui test workspace-path-actions
```

Expected: FAIL.

- [ ] **Step 12.3: Implement component**

Create `ui/src/components/WorkspacePathActions.tsx`:

```tsx
import { invoke } from "@tauri-apps/api/core";
import { isDesktop } from "../runtime/desktop.js";

export interface WorkspacePathActionsProps {
  absolutePath: string;
}

export function WorkspacePathActions({ absolutePath }: WorkspacePathActionsProps) {
  const desktop = isDesktop();

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(absolutePath);
    } catch (e) {
      console.error("clipboard copy failed", e);
    }
  };

  const onFinder = async () => {
    if (!desktop) return;
    try {
      await invoke("workspace_open_finder", { absPath: absolutePath });
    } catch (e) {
      console.error("open finder failed", e);
    }
  };

  const onIde = async () => {
    if (!desktop) return;
    try {
      await invoke("workspace_open_ide", { absPath: absolutePath });
    } catch (e) {
      console.error("open ide failed", e);
    }
  };

  const desktopOnlyTitle = desktop ? undefined : "Desktop 앱에서만 동작합니다";

  return (
    <div className="inline-flex items-center gap-1">
      <button
        type="button"
        aria-label="Finder에서 열기"
        title={desktopOnlyTitle ?? "Finder에서 열기"}
        disabled={!desktop || !absolutePath}
        onClick={onFinder}
        className="px-2 py-1 text-xs rounded border border-border hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed"
      >
        📁
      </button>
      <button
        type="button"
        aria-label="경로 복사"
        title="경로 복사"
        disabled={!absolutePath}
        onClick={onCopy}
        className="px-2 py-1 text-xs rounded border border-border hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed"
      >
        📋
      </button>
      <button
        type="button"
        aria-label="VS Code에서 열기 (IDE)"
        title={desktopOnlyTitle ?? "VS Code에서 열기"}
        disabled={!desktop || !absolutePath}
        onClick={onIde}
        className="px-2 py-1 text-xs rounded border border-border hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed"
      >
        ▶️
      </button>
    </div>
  );
}
```

- [ ] **Step 12.4: Run, verify pass**

```bash
pnpm --filter @paperclipai/ui test workspace-path-actions
```

Expected: PASS, all 5 cases.

- [ ] **Step 12.5: Commit**

```bash
git add ui/src/components/WorkspacePathActions.tsx \
        ui/src/__tests__/workspace-path-actions.test.tsx
git commit -m "feat(ui): WorkspacePathActions component (Finder/Copy/IDE shortcuts)"
```

---

## Task 13: UI — DesignGuide Registration

**Files:**
- Modify: `ui/src/pages/DesignGuide.tsx`

- [ ] **Step 13.1: Read existing DesignGuide structure**

```bash
grep -n "Showcase\|Section\|SubSection" ui/src/pages/DesignGuide.tsx | head -20
```

Locate where existing showcases are rendered (likely in a `<Section>` block in the main return).

- [ ] **Step 13.2: Add showcase**

In `ui/src/pages/DesignGuide.tsx`, add a showcase function near other Showcase components:

```tsx
import { WorkspacePathActions } from "../components/WorkspacePathActions.js";

function WorkspacePathActionsShowcase() {
  return (
    <SubSection title="Workspace Path Actions">
      <p className="text-xs text-muted-foreground">
        회사 설정 / 프로젝트 상세에서 산출물 폴더 옆에 표시되는 바로가기 버튼 그룹.
        웹 모드에서는 Finder/IDE 비활성, Desktop 모드에서 모두 활성.
      </p>
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-mono">/Users/me/Stapler/acme/calc</span>
          <WorkspacePathActions absolutePath="/Users/me/Stapler/acme/calc" />
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="font-mono text-muted-foreground italic">(빈 경로)</span>
          <WorkspacePathActions absolutePath="" />
        </div>
      </div>
    </SubSection>
  );
}
```

In the component's main return block, mount it inside an existing `<Section>` (or create a new `<Section title="Workspace">`):

```tsx
<Section title="Workspace">
  <WorkspacePathActionsShowcase />
</Section>
```

- [ ] **Step 13.3: Verify by visiting page (manual sanity)**

```bash
pnpm dev
```

Open `http://localhost:3100/design-guide`, scroll to "Workspace" section, confirm 3 buttons render. (Don't gate Task on this — it's manual.)

- [ ] **Step 13.4: Typecheck**

```bash
pnpm -r typecheck
```

Expected: PASS.

- [ ] **Step 13.5: Commit**

```bash
git add ui/src/pages/DesignGuide.tsx
git commit -m "feat(ui): register WorkspacePathActions in DesignGuide"
```

---

## Task 14: UI — API Client Updates

**Files:**
- Modify: `ui/src/api/companies.ts`
- Modify: `ui/src/api/projects.ts`

- [ ] **Step 14.1: Companies — add workspaceRootPath to update signature**

Edit `ui/src/api/companies.ts`. In the `update` method, extend the Pick:

```ts
update: (
  companyId: string,
  data: Partial<
    Pick<
      Company,
      | "name" | "description" | "status" | "budgetMonthlyCents"
      | "requireBoardApprovalForNewAgents" | "brandColor" | "logoAssetId"
      | "workspaceRootPath"
    >
  > & { adapterDefaults?: CompanyAdapterDefaults | null },
) => api.patch<Company>(`/companies/${companyId}`, data),
```

Also update `create` payload type:

```ts
create: (data: {
  name: string;
  description?: string | null;
  budgetMonthlyCents?: number;
  workspaceRootPath?: string | null;
}) => api.post<Company>("/companies", data),
```

- [ ] **Step 14.2: Projects — add workspacePathOverride + workspace-path call**

Edit `ui/src/api/projects.ts`. In the object literal `projectsApi`, the `update`/`create` use `Record<string, unknown>` already so no change needed. Add new method:

```ts
getWorkspacePath: (projectId: string, companyId?: string) =>
  api.get<{ resolvedAbsolutePath: string; source: string }>(
    projectPath(projectId, companyId, "/workspace-path"),
  ),
```

- [ ] **Step 14.3: Typecheck**

```bash
pnpm -r typecheck
```

Expected: PASS.

- [ ] **Step 14.4: Commit**

```bash
git add ui/src/api/companies.ts ui/src/api/projects.ts
git commit -m "feat(ui): API clients support workspace folder fields"
```

---

## Task 15: UI — CompanySettings 폴더 섹션

**Files:**
- Modify: `ui/src/pages/CompanySettings.tsx`

- [ ] **Step 15.1: Read current page structure**

Open `ui/src/pages/CompanySettings.tsx`. Identify:
- where local form state hooks are declared (`useState`)
- where mutations are defined (`useMutation`)
- where the rendered sections are (Card / form blocks)

Add new state and mutation alongside existing ones.

- [ ] **Step 15.2: Add state + mutation + section**

Add to imports:
```tsx
import { WorkspacePathActions } from "../components/WorkspacePathActions.js";
```

Add state (with other useState calls, e.g. after `setLogoUrl`):
```tsx
const [workspaceRootPath, setWorkspaceRootPath] = useState("");
const [workspacePathError, setWorkspacePathError] = useState<string | null>(null);
```

Add to the existing `useEffect` that syncs from selectedCompany:
```tsx
setWorkspaceRootPath(selectedCompany.workspaceRootPath ?? "");
```

Add new mutation:
```tsx
const workspacePathMutation = useMutation({
  mutationFn: (path: string | null) =>
    companiesApi.update(selectedCompanyId!, { workspaceRootPath: path }),
  onSuccess: () => {
    setWorkspacePathError(null);
    queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
    pushToast({ message: "산출물 폴더 저장됨", kind: "success" });
  },
  onError: (e: unknown) => {
    setWorkspacePathError(e instanceof Error ? e.message : "저장 실패");
  },
});
```

Add a save handler:
```tsx
const onSaveWorkspaceRoot = () => {
  const trimmed = workspaceRootPath.trim();
  workspacePathMutation.mutate(trimmed === "" ? null : trimmed);
};
```

Compute current resolved default for display (client-side mirror of resolver — keep simple):
```tsx
const defaultPreview = workspaceRootPath.trim() === ""
  ? `~/Stapler/<회사-slug>`
  : workspaceRootPath.trim();
```

Render the new section in the existing layout (place after general settings card):

```tsx
<div className="rounded-lg border border-border p-6 space-y-3">
  <div>
    <h3 className="text-sm font-semibold">산출물 폴더 (회사 default)</h3>
    <p className="text-xs text-muted-foreground">
      이 회사의 모든 프로젝트가 기본으로 사용할 폴더. 비워두면
      <code> ~/Stapler/&lt;회사-slug&gt; </code>이 사용됩니다.
    </p>
  </div>
  <div className="flex items-center gap-2">
    <input
      type="text"
      value={workspaceRootPath}
      onChange={(e) => setWorkspaceRootPath(e.target.value)}
      placeholder="~/work/acme 또는 /Users/me/work/acme"
      className="flex-1 px-3 py-2 text-sm rounded border border-border bg-background"
    />
    <button
      type="button"
      onClick={onSaveWorkspaceRoot}
      disabled={workspacePathMutation.isPending}
      className="px-3 py-2 text-sm rounded bg-primary text-primary-foreground disabled:opacity-50"
    >
      저장
    </button>
  </div>
  {workspacePathError && (
    <p className="text-xs text-destructive">{workspacePathError}</p>
  )}
  <div className="flex items-center gap-2 text-xs text-muted-foreground">
    <span>현재 default:</span>
    <span className="font-mono">{defaultPreview}</span>
    <WorkspacePathActions absolutePath={defaultPreview} />
  </div>
</div>
```

- [ ] **Step 15.3: Typecheck + manual sanity**

```bash
pnpm -r typecheck
pnpm dev
```

Visit Company Settings page, verify section renders, type a path, click Save, see toast.

- [ ] **Step 15.4: Commit**

```bash
git add ui/src/pages/CompanySettings.tsx
git commit -m "feat(ui): CompanySettings — workspace root path section"
```

---

## Task 16: UI — ProjectDetail 폴더 섹션

**Files:**
- Modify: `ui/src/pages/ProjectDetail.tsx`

- [ ] **Step 16.1: Identify a place for the section**

The page has tabs (overview / list / configuration / budget). Add a new card inside the "configuration" tab content (since it's project-level config). Locate by searching for `"configuration"` literal in the tab switch.

- [ ] **Step 16.2: Add useQuery + useMutation + section**

Add imports:
```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { projectsApi } from "../api/projects.js";
import { WorkspacePathActions } from "../components/WorkspacePathActions.js";
```

Inside the component (where project + companyId are accessible):

```tsx
const queryClient = useQueryClient();
const [overrideInput, setOverrideInput] = useState(project.workspacePathOverride ?? "");

const resolvedQuery = useQuery({
  queryKey: ["project-workspace-path", project.id],
  queryFn: () => projectsApi.getWorkspacePath(project.id, project.companyId),
  enabled: !!project.id,
});

const overrideMutation = useMutation({
  mutationFn: (path: string | null) =>
    projectsApi.update(project.id, { workspacePathOverride: path }, project.companyId),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["project-workspace-path", project.id] });
    queryClient.invalidateQueries({ queryKey: ["projects"] });
  },
});

const onSaveOverride = () => {
  const t = overrideInput.trim();
  overrideMutation.mutate(t === "" ? null : t);
};
```

In the configuration tab JSX, add the section:

```tsx
<div className="rounded-lg border border-border p-6 space-y-3">
  <div>
    <h3 className="text-sm font-semibold">산출물 폴더 (override)</h3>
    <p className="text-xs text-muted-foreground">
      이 프로젝트만 별도 폴더를 사용할 때 입력. 비워두면 회사 default를 사용합니다.
    </p>
  </div>
  <div className="flex items-center gap-2">
    <input
      type="text"
      value={overrideInput}
      onChange={(e) => setOverrideInput(e.target.value)}
      placeholder="비워두면 회사 default 사용"
      className="flex-1 px-3 py-2 text-sm rounded border border-border bg-background"
    />
    <button
      type="button"
      onClick={onSaveOverride}
      disabled={overrideMutation.isPending}
      className="px-3 py-2 text-sm rounded bg-primary text-primary-foreground disabled:opacity-50"
    >
      저장
    </button>
  </div>
  <div className="flex items-center gap-2 text-xs text-muted-foreground">
    <span>현재 사용 경로:</span>
    {resolvedQuery.data ? (
      <>
        <span className="font-mono">{resolvedQuery.data.resolvedAbsolutePath}</span>
        <span className="text-[10px]">({resolvedQuery.data.source})</span>
        <WorkspacePathActions absolutePath={resolvedQuery.data.resolvedAbsolutePath} />
      </>
    ) : (
      <span>로딩 중...</span>
    )}
  </div>
</div>
```

- [ ] **Step 16.3: Typecheck + sanity**

```bash
pnpm -r typecheck
pnpm dev
```

Open a project's Configuration tab, verify section, save override, see resolved path change.

- [ ] **Step 16.4: Commit**

```bash
git add ui/src/pages/ProjectDetail.tsx
git commit -m "feat(ui): ProjectDetail — workspace path override section + resolved view"
```

---

## Task 17: E2E — Playwright Spec

**Files:**
- Create: `tests/e2e/workspace-folder-config.spec.ts`

- [ ] **Step 17.1: Write E2E spec**

Create `tests/e2e/workspace-folder-config.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

const COMPANY = `WS-${Date.now()}`;
const PROJECT = `Calc-${Date.now()}`;
const ROOT_PATH = `/tmp/stapler-e2e-${Date.now()}`;

test.describe("Workspace folder configuration", () => {
  test("company root + project resolve flow", async ({ page }) => {
    // 1. Create company via UI (reuse onboarding wizard or company list)
    await page.goto("/companies");
    await page.getByRole("button", { name: /new company|새 회사/i }).click();
    await page.getByPlaceholder(/Acme Corp/i).fill(COMPANY);
    await page.getByRole("button", { name: /create|만들기/i }).click();

    // 2. Open company settings, set workspace root
    await page.goto("/settings");
    await page.getByPlaceholder(/work\/acme|Users\/me/).fill(ROOT_PATH);
    await page.getByRole("button", { name: /^저장$|^Save$/ }).click();
    await expect(page.getByText(/산출물 폴더 저장됨|saved/i)).toBeVisible({ timeout: 5000 });

    // 3. Create a project
    await page.goto("/projects");
    await page.getByRole("button", { name: /new project|새 프로젝트/i }).click();
    await page.getByPlaceholder(/project name|프로젝트 이름/i).fill(PROJECT);
    await page.getByRole("button", { name: /create|만들기/i }).click();

    // 4. Open project configuration tab, verify resolved path
    await page.getByText(PROJECT).click();
    await page.getByRole("tab", { name: /configuration|설정/i }).click();

    // expected slug: project name lowercased + dashes
    const expectedSlug = PROJECT.toLowerCase();
    await expect(
      page.locator("text=" + ROOT_PATH + "/" + expectedSlug),
    ).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=company_root")).toBeVisible();
  });

  test("project override changes resolved path", async ({ page }) => {
    // Assumes COMPANY/PROJECT from prior test exist; use unique names per run if isolation needed
    const overridePath = `/tmp/stapler-e2e-override-${Date.now()}`;
    await page.goto("/projects");
    await page.getByText(PROJECT).click();
    await page.getByRole("tab", { name: /configuration|설정/i }).click();

    const overrideInput = page.getByPlaceholder(/회사 default/);
    await overrideInput.fill(overridePath);
    await page.getByRole("button", { name: /^저장$|^Save$/ }).click();

    await expect(page.locator("text=" + overridePath)).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=project_override")).toBeVisible();
  });
});
```

- [ ] **Step 17.2: Run E2E**

```bash
pnpm e2e workspace-folder-config
```

Expected: PASS. If selectors don't match the actual UI (button names, placeholders), update spec to match what was implemented in Tasks 15-16.

- [ ] **Step 17.3: Commit**

```bash
git add tests/e2e/workspace-folder-config.spec.ts
git commit -m "test(e2e): workspace folder config — company root + project override"
```

---

## Task 18: SPEC-implementation.md Update

**Files:**
- Modify: `doc/SPEC-implementation.md`

- [ ] **Step 18.1: Locate sections**

Find:
- §7.1 (`companies` table definition) — add `workspace_root_path text null` row
- §7.5 (`projects` table definition) — add `workspace_path_override text null` row
- §10.5 (Projects API) — add `GET /projects/:id/workspace-path` endpoint description
- §10.4 (Companies API) — note `workspaceRootPath` field on POST/PATCH

Use grep:
```bash
grep -n "## 7\.1\|## 7\.5\|## 10\.5\|## 10\.4" doc/SPEC-implementation.md
```

- [ ] **Step 18.2: Edit sections inline**

For each section, add the field/endpoint following the existing format. Keep the additions minimal and consistent with existing entries.

Example for §7.1:
```diff
 - `adapter_defaults` jsonb null
+- `workspace_root_path` text null
 - `created_at` timestamptz not null default now()
```

Example for §10.5 (after `PATCH /projects/:projectId`):
```diff
 - `PATCH /projects/:projectId`
+- `GET /projects/:projectId/workspace-path` — returns `{ resolvedAbsolutePath, source }` for the project's resolved cwd
```

Add a brief note in §6 or wherever workspace policy is described:
```markdown
### Workspace folder resolution

When adapter `cwd` is empty, heartbeat resolves the working directory using:
1. `projects.workspace_path_override` if set
2. `companies.workspace_root_path` + project slug if set
3. `STAPLER_WORKSPACE_ROOT` env or `~/Stapler` + company slug + project slug

The resolved directory is auto-created (`mkdir -p`) before the adapter starts.
```

- [ ] **Step 18.3: Commit**

```bash
git add doc/SPEC-implementation.md
git commit -m "docs(spec): document workspace folder resolution + new endpoint"
```

---

## Task 19: Verification Gate

**Files:** none (run-only)

- [ ] **Step 19.1: Full typecheck**

```bash
pnpm -r typecheck
```

Expected: PASS.

- [ ] **Step 19.2: Full test suite**

```bash
pnpm test:run
```

Expected: PASS.

- [ ] **Step 19.3: Build**

```bash
pnpm build
```

Expected: PASS.

- [ ] **Step 19.4: Manual smoke (optional but recommended)**

```bash
rm -rf data/pglite
pnpm dev
```

Open `http://localhost:3100`:
1. Create a new company, set workspace root path.
2. Create a project under that company.
3. Open project Configuration tab, verify resolved path is `<root>/<project-slug>`.
4. Click "경로 복사" — paste somewhere, verify path.
5. (Desktop only, if testing Tauri build) Click "Finder" — folder opens.
6. (Desktop only) Click "VS Code" — code launches at the folder.

- [ ] **Step 19.5: Final commit (if any pending)**

```bash
git status
```

If clean, the feature is done. If not, commit any leftover formatting fixes.

---

## Summary

19 tasks, ~95 steps, ~14 commits. Follows TDD throughout (test → fail → impl → pass → commit). Touches DB / shared / server / UI / Tauri / docs / E2E — all 4-layer contract sync per stapler CLAUDE.md §5.2.

**Spec coverage check:**
- ✅ Schema (Task 1)
- ✅ Resolver, slug, validator (Tasks 2-5)
- ✅ Companies/Projects API (Tasks 6-8)
- ✅ Heartbeat integration + mkdir (Task 9)
- ✅ Tauri commands (Task 10)
- ✅ isDesktop helper (Task 11)
- ✅ WorkspacePathActions component (Task 12)
- ✅ DesignGuide registration (Task 13)
- ✅ API clients (Task 14)
- ✅ CompanySettings UI (Task 15)
- ✅ ProjectDetail UI (Task 16)
- ✅ E2E (Task 17)
- ✅ SPEC docs (Task 18)
- ✅ Verification (Task 19)
