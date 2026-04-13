# Claude Code Skills Dynamic Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scan `~/.claude/skills/` and plugin skill directories at server startup and expose them as read-only instance-wide skills merged into every company's skill list — no DB schema changes.

**Architecture:** A singleton in-memory cache (`instanceSkillsCache`) scans both Claude Code skill directories on startup and on-demand refresh. The existing `GET /companies/:companyId/skills` handler merges cache entries (minus keys already present in DB) into its response. A new `POST /api/instance/skills/refresh` endpoint triggers a rescan. The UI adds a refresh button and badge rendering for the two new source types.

**Tech Stack:** Node.js `node:fs/promises`, `node:path`, `node:crypto` (deterministic IDs), Express Router, React + TanStack Query, Vitest

**Design doc:** `docs/llm/claude-code-skills-dynamic-loading.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `packages/shared/src/types/company-skill.ts` | Modify | Add `"claude_code"` and `"claude_plugin"` to source type and badge unions |
| `server/src/services/instance-skills-cache.ts` | **Create** | Singleton scanner + in-memory `Map<id, InstanceSkill>` |
| `server/src/__tests__/instance-skills-cache.test.ts` | **Create** | Unit tests for scanner (temp dirs) |
| `server/src/routes/instance-skills.ts` | **Create** | `POST /api/instance/skills/refresh` endpoint |
| `server/src/__tests__/instance-skills-routes.test.ts` | **Create** | Route tests |
| `server/src/routes/index.ts` | Modify | Export `instanceSkillRoutes` |
| `server/src/app.ts` | Modify | Mount `instanceSkillRoutes()` |
| `server/src/routes/company-skills.ts` | Modify | Merge instance skills into list; serve instance skill files; guard PATCH |
| `server/src/__tests__/company-skills-instance-merge.test.ts` | **Create** | Tests for merge + file serve behavior |
| `server/src/index.ts` | Modify | Fire-and-forget startup scan |
| `ui/src/api/companySkills.ts` | Modify | Add `refreshInstanceSkills()` |
| `ui/src/pages/CompanySkills.tsx` | Modify | Refresh button + `claude_code`/`claude_plugin` badge cases |

---

## Task 1: Extend shared source type unions

**Files:**
- Modify: `packages/shared/src/types/company-skill.ts:1,7`

- [ ] **Step 1: Edit the two union types**

In `packages/shared/src/types/company-skill.ts`, replace lines 1 and 7:

```ts
// line 1 — before:
export type CompanySkillSourceType = "local_path" | "github" | "url" | "catalog" | "skills_sh";

// line 1 — after:
export type CompanySkillSourceType = "local_path" | "github" | "url" | "catalog" | "skills_sh" | "claude_code" | "claude_plugin";

// line 7 — before:
export type CompanySkillSourceBadge = "paperclip" | "github" | "local" | "url" | "catalog" | "skills_sh";

// line 7 — after:
export type CompanySkillSourceBadge = "paperclip" | "github" | "local" | "url" | "catalog" | "skills_sh" | "claude_code" | "claude_plugin";
```

- [ ] **Step 2: Typecheck shared package**

```bash
pnpm --filter @paperclipai/shared typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/types/company-skill.ts
git commit -m "feat(shared): add claude_code and claude_plugin skill source types"
```

---

## Task 2: Instance skills cache service

**Files:**
- Create: `server/src/services/instance-skills-cache.ts`
- Create: `server/src/__tests__/instance-skills-cache.test.ts`

- [ ] **Step 1: Write failing tests**

Create `server/src/__tests__/instance-skills-cache.test.ts`:

```ts
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import {
  createInstanceSkillsCache,
  makeInstanceSkillId,
} from "../services/instance-skills-cache.js";

const cleanupDirs = new Set<string>();

afterEach(async () => {
  await Promise.all(
    Array.from(cleanupDirs, (d) => fs.rm(d, { recursive: true, force: true })),
  );
  cleanupDirs.clear();
});

async function makeTempDir(prefix: string) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  cleanupDirs.add(dir);
  return dir;
}

async function writeSkillDir(
  root: string,
  name: string,
  frontmatter: { name?: string; description?: string } = {},
) {
  const dir = path.join(root, name);
  await fs.mkdir(dir, { recursive: true });
  const fm = Object.entries(frontmatter)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  await fs.writeFile(
    path.join(dir, "SKILL.md"),
    `---\n${fm || `name: ${name}`}\n---\n\n# ${name}\n`,
  );
  return dir;
}

describe("makeInstanceSkillId", () => {
  it("returns a stable UUID-shaped string for the same key", () => {
    const id1 = makeInstanceSkillId("claude/research");
    const id2 = makeInstanceSkillId("claude/research");
    expect(id1).toBe(id2);
    expect(id1).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("returns different IDs for different keys", () => {
    expect(makeInstanceSkillId("claude/a")).not.toBe(makeInstanceSkillId("claude/b"));
  });
});

describe("instanceSkillsCache — claude_code skills", () => {
  it("loads skills from the claude skills directory", async () => {
    const root = await makeTempDir("cc-skills-");
    await writeSkillDir(root, "research", {
      name: "Research",
      description: "Multi-source research",
    });
    await writeSkillDir(root, "auto-dev", { name: "Auto Dev" });

    const cache = createInstanceSkillsCache({
      claudeSkillsDir: root,
      pluginsCacheDir: null,
    });
    const result = await cache.scan();

    expect(result.claudeCodeCount).toBe(2);
    expect(result.pluginCount).toBe(0);
    expect(result.count).toBe(2);

    const skills = cache.getAll();
    const research = skills.find((s) => s.key === "claude/research");
    expect(research).toBeDefined();
    expect(research!.name).toBe("Research");
    expect(research!.description).toBe("Multi-source research");
    expect(research!.sourceType).toBe("claude_code");
    expect(research!.sourceLabel).toBe("Claude Code");
    expect(research!.slug).toBe("research");
  });

  it("skips workspace directories", async () => {
    const root = await makeTempDir("cc-skills-ws-");
    await writeSkillDir(root, "real-skill");
    await writeSkillDir(root, "auto-dev-workspace"); // should be skipped

    const cache = createInstanceSkillsCache({
      claudeSkillsDir: root,
      pluginsCacheDir: null,
    });
    await cache.scan();

    const keys = cache.getAll().map((s) => s.key);
    expect(keys).toContain("claude/real-skill");
    expect(keys).not.toContain("claude/auto-dev-workspace");
  });

  it("skips _shared directory", async () => {
    const root = await makeTempDir("cc-skills-shared-");
    await writeSkillDir(root, "good-skill");
    const sharedDir = path.join(root, "_shared");
    await fs.mkdir(sharedDir);
    await fs.writeFile(path.join(sharedDir, "SKILL.md"), "---\nname: shared\n---\n");

    const cache = createInstanceSkillsCache({
      claudeSkillsDir: root,
      pluginsCacheDir: null,
    });
    await cache.scan();

    const keys = cache.getAll().map((s) => s.key);
    expect(keys).not.toContain("claude/_shared");
  });

  it("skips directories without SKILL.md", async () => {
    const root = await makeTempDir("cc-skills-nomd-");
    const noMdDir = path.join(root, "no-skill-md");
    await fs.mkdir(noMdDir);
    await fs.writeFile(path.join(noMdDir, "README.md"), "nothing");

    const cache = createInstanceSkillsCache({
      claudeSkillsDir: root,
      pluginsCacheDir: null,
    });
    await cache.scan();

    expect(cache.getAll()).toHaveLength(0);
  });

  it("returns empty list when claudeSkillsDir does not exist", async () => {
    const cache = createInstanceSkillsCache({
      claudeSkillsDir: "/nonexistent/path/that/does/not/exist",
      pluginsCacheDir: null,
    });
    const result = await cache.scan();
    expect(result.count).toBe(0);
    expect(cache.getAll()).toHaveLength(0);
  });

  it("getById returns skill by deterministic id", async () => {
    const root = await makeTempDir("cc-skills-byid-");
    await writeSkillDir(root, "pdf");

    const cache = createInstanceSkillsCache({
      claudeSkillsDir: root,
      pluginsCacheDir: null,
    });
    await cache.scan();

    const skill = cache.getAll()[0];
    expect(cache.getById(skill.id)).toBe(skill);
    expect(cache.getById("nonexistent-id")).toBeUndefined();
  });
});

describe("instanceSkillsCache — claude_plugin skills", () => {
  it("loads skills from plugin cache directories", async () => {
    const cacheRoot = await makeTempDir("cc-plugins-");
    // simulate: cache/claude-plugins-official/superpowers/5.0.7/skills/brainstorming/SKILL.md
    const skillsDir = path.join(
      cacheRoot,
      "claude-plugins-official",
      "superpowers",
      "5.0.7",
      "skills",
    );
    await writeSkillDir(skillsDir, "brainstorming", {
      name: "Brainstorming",
      description: "Idea refinement",
    });
    await writeSkillDir(skillsDir, "writing-plans", { name: "Writing Plans" });

    const cache = createInstanceSkillsCache({
      claudeSkillsDir: null,
      pluginsCacheDir: cacheRoot,
    });
    const result = await cache.scan();

    expect(result.pluginCount).toBe(2);
    expect(result.claudeCodeCount).toBe(0);

    const brainstorm = cache.getAll().find((s) => s.key === "claude-plugins/superpowers/brainstorming");
    expect(brainstorm).toBeDefined();
    expect(brainstorm!.sourceType).toBe("claude_plugin");
    expect(brainstorm!.pluginName).toBe("superpowers");
    expect(brainstorm!.pluginVersion).toBe("5.0.7");
    expect(brainstorm!.sourceLabel).toBe("superpowers 5.0.7");
  });

  it("returns empty list when pluginsCacheDir does not exist", async () => {
    const cache = createInstanceSkillsCache({
      claudeSkillsDir: null,
      pluginsCacheDir: "/nonexistent/plugins/cache",
    });
    const result = await cache.scan();
    expect(result.pluginCount).toBe(0);
  });
});

describe("instanceSkillsCache — getByKey", () => {
  it("looks up a skill by key", async () => {
    const root = await makeTempDir("cc-skills-bykey-");
    await writeSkillDir(root, "research");

    const cache = createInstanceSkillsCache({
      claudeSkillsDir: root,
      pluginsCacheDir: null,
    });
    await cache.scan();

    expect(cache.getByKey("claude/research")).toBeDefined();
    expect(cache.getByKey("claude/nonexistent")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
pnpm --filter server test instance-skills-cache
```

Expected: FAIL with "cannot find module `../services/instance-skills-cache.js`"

- [ ] **Step 3: Implement the service**

Create `server/src/services/instance-skills-cache.ts`:

```ts
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

export interface InstanceSkill {
  id: string;
  key: string;
  slug: string;
  name: string;
  description: string | null;
  diskPath: string;
  markdown: string;
  sourceType: "claude_code" | "claude_plugin";
  sourceLabel: string;
  pluginName?: string;
  pluginVersion?: string;
}

export interface InstanceSkillScanResult {
  count: number;
  claudeCodeCount: number;
  pluginCount: number;
}

export interface InstanceSkillsCacheOptions {
  claudeSkillsDir: string | null;
  pluginsCacheDir: string | null;
}

export function makeInstanceSkillId(key: string): string {
  const h = createHash("sha256").update(`instance-skill:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

function parseFrontmatter(content: string): { name?: string; description?: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const result: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const k = line.slice(0, colonIdx).trim();
    const v = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (k) result[k] = v;
  }
  return { name: result["name"], description: result["description"] };
}

async function tryReadFile(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}

async function tryReaddir(dir: string): Promise<string[]> {
  try {
    return await fs.readdir(dir);
  } catch {
    return [];
  }
}

async function scanClaudeSkillsDir(
  root: string,
): Promise<InstanceSkill[]> {
  const entries = await tryReaddir(root);
  const skills: InstanceSkill[] = [];

  for (const entry of entries) {
    if (entry === "_shared" || entry.endsWith("-workspace")) continue;
    const skillDir = path.join(root, entry);
    let stat: import("node:fs").Stats;
    try {
      stat = await fs.stat(skillDir);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;

    const skillMdPath = path.join(skillDir, "SKILL.md");
    const content = await tryReadFile(skillMdPath);
    if (!content) continue;

    const { name, description } = parseFrontmatter(content);
    const key = `claude/${entry}`;
    skills.push({
      id: makeInstanceSkillId(key),
      key,
      slug: entry,
      name: name ?? entry,
      description: description ?? null,
      diskPath: skillMdPath,
      markdown: content,
      sourceType: "claude_code",
      sourceLabel: "Claude Code",
    });
  }

  return skills;
}

async function scanPluginsCacheDir(
  cacheRoot: string,
): Promise<InstanceSkill[]> {
  const skills: InstanceSkill[] = [];
  const publishers = await tryReaddir(cacheRoot);

  for (const publisher of publishers) {
    const publisherDir = path.join(cacheRoot, publisher);
    const plugins = await tryReaddir(publisherDir);

    for (const pluginName of plugins) {
      const pluginDir = path.join(publisherDir, pluginName);
      const versions = await tryReaddir(pluginDir);

      for (const version of versions) {
        const skillsDir = path.join(pluginDir, version, "skills");
        const skillNames = await tryReaddir(skillsDir);

        for (const skillName of skillNames) {
          const skillDir = path.join(skillsDir, skillName);
          let stat: import("node:fs").Stats;
          try {
            stat = await fs.stat(skillDir);
          } catch {
            continue;
          }
          if (!stat.isDirectory()) continue;

          const skillMdPath = path.join(skillDir, "SKILL.md");
          const content = await tryReadFile(skillMdPath);
          if (!content) continue;

          const { name, description } = parseFrontmatter(content);
          const key = `claude-plugins/${pluginName}/${skillName}`;
          skills.push({
            id: makeInstanceSkillId(key),
            key,
            slug: skillName,
            name: name ?? skillName,
            description: description ?? null,
            diskPath: skillMdPath,
            markdown: content,
            sourceType: "claude_plugin",
            sourceLabel: `${pluginName} ${version}`,
            pluginName,
            pluginVersion: version,
          });
        }
      }
    }
  }

  return skills;
}

export function createInstanceSkillsCache(opts?: InstanceSkillsCacheOptions) {
  const defaultOpts: InstanceSkillsCacheOptions = {
    claudeSkillsDir: path.join(os.homedir(), ".claude", "skills"),
    pluginsCacheDir: path.join(os.homedir(), ".claude", "plugins", "cache"),
  };
  const options = opts ?? defaultOpts;

  const byId = new Map<string, InstanceSkill>();
  const byKey = new Map<string, InstanceSkill>();

  async function scan(): Promise<InstanceSkillScanResult> {
    byId.clear();
    byKey.clear();

    const claudeSkills = options.claudeSkillsDir
      ? await scanClaudeSkillsDir(options.claudeSkillsDir)
      : [];
    const pluginSkills = options.pluginsCacheDir
      ? await scanPluginsCacheDir(options.pluginsCacheDir)
      : [];

    for (const skill of [...claudeSkills, ...pluginSkills]) {
      byId.set(skill.id, skill);
      byKey.set(skill.key, skill);
    }

    return {
      count: byId.size,
      claudeCodeCount: claudeSkills.length,
      pluginCount: pluginSkills.length,
    };
  }

  return {
    scan,
    getAll: (): InstanceSkill[] => Array.from(byId.values()),
    getById: (id: string): InstanceSkill | undefined => byId.get(id),
    getByKey: (key: string): InstanceSkill | undefined => byKey.get(key),
  };
}

// Module-level singleton using default OS paths
export const instanceSkillsCache = createInstanceSkillsCache();
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
pnpm --filter server test instance-skills-cache
```

Expected: all tests PASS.

- [ ] **Step 5: Typecheck server**

```bash
pnpm --filter server typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add server/src/services/instance-skills-cache.ts server/src/__tests__/instance-skills-cache.test.ts
git commit -m "feat(server): add instance skills cache for Claude Code skill directories"
```

---

## Task 3: Instance skills refresh route

**Files:**
- Create: `server/src/routes/instance-skills.ts`
- Create: `server/src/__tests__/instance-skills-routes.test.ts`

- [ ] **Step 1: Write failing tests**

Create `server/src/__tests__/instance-skills-routes.test.ts`:

```ts
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { instanceSkillRoutes } from "../routes/instance-skills.js";
import { errorHandler } from "../middleware/index.js";

const mockCache = vi.hoisted(() => ({
  scan: vi.fn(),
  getAll: vi.fn(() => []),
  getById: vi.fn(),
  getByKey: vi.fn(),
}));

vi.mock("../services/instance-skills-cache.js", () => ({
  instanceSkillsCache: mockCache,
}));

function createApp(actor: Record<string, unknown>) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = actor;
    next();
  });
  app.use("/api", instanceSkillRoutes());
  app.use(errorHandler);
  return app;
}

const boardActor = {
  type: "board",
  userId: "user-1",
  companyIds: [],
  source: "local_implicit",
  isInstanceAdmin: false,
};

const agentActor = {
  type: "agent",
  agentId: "agent-1",
  companyId: "company-1",
};

describe("POST /api/instance/skills/refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCache.scan.mockResolvedValue({
      count: 5,
      claudeCodeCount: 3,
      pluginCount: 2,
    });
  });

  it("returns scan result for board actors", async () => {
    const res = await request(createApp(boardActor))
      .post("/api/instance/skills/refresh")
      .send();

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ count: 5, claudeCodeCount: 3, pluginCount: 2 });
    expect(mockCache.scan).toHaveBeenCalledOnce();
  });

  it("rejects agent actors with 403", async () => {
    const res = await request(createApp(agentActor))
      .post("/api/instance/skills/refresh")
      .send();

    expect(res.status).toBe(403);
    expect(mockCache.scan).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
pnpm --filter server test instance-skills-routes
```

Expected: FAIL with "cannot find module `../routes/instance-skills.js`"

- [ ] **Step 3: Implement the route**

Create `server/src/routes/instance-skills.ts`:

```ts
import { Router } from "express";
import { instanceSkillsCache } from "../services/instance-skills-cache.js";
import { forbidden } from "../errors.js";

export function instanceSkillRoutes() {
  const router = Router();

  router.post("/instance/skills/refresh", async (req, res) => {
    if (req.actor.type !== "board") {
      throw forbidden("Instance skill refresh requires board access");
    }
    const result = await instanceSkillsCache.scan();
    res.json(result);
  });

  return router;
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
pnpm --filter server test instance-skills-routes
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/instance-skills.ts server/src/__tests__/instance-skills-routes.test.ts
git commit -m "feat(server): add POST /api/instance/skills/refresh endpoint"
```

---

## Task 4: Wire route into app and export from routes index

**Files:**
- Modify: `server/src/routes/index.ts`
- Modify: `server/src/app.ts`

- [ ] **Step 1: Export from routes index**

In `server/src/routes/index.ts`, add at the end:

```ts
export { instanceSkillRoutes } from "./instance-skills.js";
```

- [ ] **Step 2: Mount in app.ts**

In `server/src/app.ts`, add the import at the top with the other route imports:

```ts
import { instanceSkillRoutes } from "./routes/instance-skills.js";
```

Then in the API routes block (after the existing `api.use(companySkillRoutes(db));` line), add:

```ts
api.use(instanceSkillRoutes());
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter server typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/index.ts server/src/app.ts
git commit -m "feat(server): mount instance skill routes in app"
```

---

## Task 5: Merge instance skills into company skills list + file handler

**Files:**
- Modify: `server/src/routes/company-skills.ts`
- Create: `server/src/__tests__/company-skills-instance-merge.test.ts`

- [ ] **Step 1: Write failing tests**

Create `server/src/__tests__/company-skills-instance-merge.test.ts`:

```ts
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { companySkillRoutes } from "../routes/company-skills.js";
import { errorHandler } from "../middleware/index.js";
import type { InstanceSkill } from "../services/instance-skills-cache.js";

const mockCache = vi.hoisted(() => ({
  scan: vi.fn(),
  getAll: vi.fn(() => [] as InstanceSkill[]),
  getById: vi.fn((_id: string) => undefined as InstanceSkill | undefined),
  getByKey: vi.fn((_key: string) => undefined as InstanceSkill | undefined),
}));

vi.mock("../services/instance-skills-cache.js", () => ({
  instanceSkillsCache: mockCache,
}));

const mockSkillService = vi.hoisted(() => ({
  list: vi.fn(),
  readFile: vi.fn(),
  updateFile: vi.fn(),
}));

const mockAgentService = vi.hoisted(() => ({ getById: vi.fn() }));
const mockAccessService = vi.hoisted(() => ({
  canUser: vi.fn(() => true),
  hasPermission: vi.fn(() => false),
}));
const mockLogActivity = vi.hoisted(() => vi.fn());

vi.mock("../services/index.js", () => ({
  accessService: () => mockAccessService,
  agentService: () => mockAgentService,
  companySkillService: () => mockSkillService,
  logActivity: mockLogActivity,
}));

const boardActor = {
  type: "board",
  userId: "user-1",
  companyIds: ["company-1"],
  source: "local_implicit",
  isInstanceAdmin: false,
};

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as any).actor = boardActor; next(); });
  app.use("/api", companySkillRoutes({} as any));
  app.use(errorHandler);
  return app;
}

function makeInstanceSkill(overrides: Partial<InstanceSkill> = {}): InstanceSkill {
  return {
    id: "aabbccdd-0000-0000-0000-112233445566",
    key: "claude/research",
    slug: "research",
    name: "Research",
    description: "Multi-source research",
    diskPath: "/fake/.claude/skills/research/SKILL.md",
    markdown: "# Research",
    sourceType: "claude_code",
    sourceLabel: "Claude Code",
    ...overrides,
  };
}

describe("GET /api/companies/:companyId/skills — instance skill merge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSkillService.list.mockResolvedValue([]);
    mockLogActivity.mockResolvedValue(undefined);
  });

  it("includes instance skills when DB list is empty", async () => {
    mockCache.getAll.mockReturnValue([makeInstanceSkill()]);

    const res = await request(createApp())
      .get("/api/companies/company-1/skills")
      .send();

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    const skill = res.body[0];
    expect(skill.key).toBe("claude/research");
    expect(skill.sourceType).toBe("claude_code");
    expect(skill.editable).toBe(false);
    expect(skill.sourceBadge).toBe("claude_code");
  });

  it("excludes instance skill when DB has a skill with same key", async () => {
    const dbSkill = {
      id: "db-id",
      key: "claude/research",
      slug: "research",
      name: "Custom Research",
      sourceType: "local_path",
      editable: true,
    };
    mockSkillService.list.mockResolvedValue([dbSkill]);
    mockCache.getAll.mockReturnValue([makeInstanceSkill()]);

    const res = await request(createApp())
      .get("/api/companies/company-1/skills")
      .send();

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe("db-id"); // company skill wins
  });

  it("includes both DB and non-conflicting instance skills", async () => {
    const dbSkill = { id: "db-id", key: "local/my-skill", slug: "my-skill" };
    mockSkillService.list.mockResolvedValue([dbSkill]);
    mockCache.getAll.mockReturnValue([makeInstanceSkill()]);

    const res = await request(createApp())
      .get("/api/companies/company-1/skills")
      .send();

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });
});

describe("GET /api/companies/:companyId/skills/:skillId/files — instance skill file", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLogActivity.mockResolvedValue(undefined);
  });

  it("serves SKILL.md content from disk for an instance skill", async () => {
    const skill = makeInstanceSkill({ markdown: "# Research\nContent here" });
    mockCache.getById.mockReturnValue(skill);

    const res = await request(createApp())
      .get(`/api/companies/company-1/skills/${skill.id}/files`)
      .send();

    expect(res.status).toBe(200);
    expect(res.body.content).toBe("# Research\nContent here");
    expect(res.body.path).toBe("SKILL.md");
    expect(res.body.skillId).toBe(skill.id);
    // DB readFile should NOT be called
    expect(mockSkillService.readFile).not.toHaveBeenCalled();
  });

  it("falls through to DB for non-instance skill IDs", async () => {
    mockCache.getById.mockReturnValue(undefined);
    mockSkillService.readFile.mockResolvedValue({
      skillId: "db-skill-id",
      path: "SKILL.md",
      kind: "skill",
      content: "DB content",
      language: "markdown",
      markdown: true,
    });

    const res = await request(createApp())
      .get("/api/companies/company-1/skills/db-skill-id/files")
      .send();

    expect(res.status).toBe(200);
    expect(mockSkillService.readFile).toHaveBeenCalled();
  });
});

describe("PATCH /api/companies/:companyId/skills/:skillId/files — instance skill guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLogActivity.mockResolvedValue(undefined);
    mockAccessService.canUser.mockResolvedValue(true);
  });

  it("rejects PATCH on an instance skill with 403", async () => {
    const skill = makeInstanceSkill();
    mockCache.getById.mockReturnValue(skill);

    const res = await request(createApp())
      .patch(`/api/companies/company-1/skills/${skill.id}/files`)
      .send({ path: "SKILL.md", content: "new content" });

    expect(res.status).toBe(403);
    expect(mockSkillService.updateFile).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
pnpm --filter server test company-skills-instance-merge
```

Expected: FAIL (routes don't merge instance skills yet).

- [ ] **Step 3: Modify company-skills.ts**

In `server/src/routes/company-skills.ts`, add the import at the top after existing imports:

```ts
import { instanceSkillsCache } from "../services/instance-skills-cache.js";
import type { CompanySkillListItem, CompanySkillFileDetail } from "@paperclipai/shared";
import type { InstanceSkill } from "../services/instance-skills-cache.js";
```

Add a projection helper before the `companySkillRoutes` function:

```ts
function instanceSkillToListItem(
  skill: InstanceSkill,
  companyId: string,
): CompanySkillListItem {
  const sentinel = new Date(0);
  return {
    id: skill.id,
    companyId,
    key: skill.key,
    slug: skill.slug,
    name: skill.name,
    description: skill.description,
    sourceType: skill.sourceType,
    sourceLocator: skill.diskPath,
    sourceRef: null,
    trustLevel: "markdown_only",
    compatibility: "compatible",
    fileInventory: [{ path: "SKILL.md", kind: "skill" }],
    createdAt: sentinel,
    updatedAt: sentinel,
    attachedAgentCount: 0,
    editable: false,
    editableReason: "Claude Code 디스크 스킬은 편집할 수 없습니다",
    sourceLabel: skill.sourceLabel,
    sourceBadge: skill.sourceType,
    sourcePath: skill.diskPath,
  };
}
```

Replace the list handler:

```ts
router.get("/companies/:companyId/skills", async (req, res) => {
  const companyId = req.params.companyId as string;
  assertCompanyAccess(req, companyId);

  const dbSkills = await svc.list(companyId);
  const dbKeys = new Set(dbSkills.map((s) => s.key));

  const instanceItems = instanceSkillsCache
    .getAll()
    .filter((s) => !dbKeys.has(s.key))
    .map((s) => instanceSkillToListItem(s, companyId));

  res.json([...dbSkills, ...instanceItems]);
});
```

Replace the file handler (add instance skill check at top):

```ts
router.get("/companies/:companyId/skills/:skillId/files", async (req, res) => {
  const companyId = req.params.companyId as string;
  const skillId = req.params.skillId as string;
  assertCompanyAccess(req, companyId);

  // Serve from disk for instance skills
  const instanceSkill = instanceSkillsCache.getById(skillId);
  if (instanceSkill) {
    const fileDetail: CompanySkillFileDetail = {
      skillId: instanceSkill.id,
      path: "SKILL.md",
      kind: "skill",
      content: instanceSkill.markdown,
      language: "markdown",
      markdown: true,
    };
    res.json(fileDetail);
    return;
  }

  const result = await svc.readFile(companyId, skillId, String(req.query.path ?? "SKILL.md"));
  if (!result) {
    res.status(404).json({ error: t("error.skillNotFound") });
    return;
  }
  res.json(result);
});
```

Add instance skill guard to the PATCH handler (at the top of the handler, before `assertCanMutateCompanySkills`):

```ts
router.patch(
  "/companies/:companyId/skills/:skillId/files",
  validate(companySkillFileUpdateSchema),
  async (req, res) => {
    const companyId = req.params.companyId as string;
    const skillId = req.params.skillId as string;

    // Guard: instance skills are read-only
    if (instanceSkillsCache.getById(skillId)) {
      throw forbidden("Claude Code 디스크 스킬은 편집할 수 없습니다");
    }

    await assertCanMutateCompanySkills(req, companyId);
    // ... rest of existing handler unchanged
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
pnpm --filter server test company-skills-instance-merge
```

Expected: all tests PASS.

- [ ] **Step 5: Typecheck**

```bash
pnpm --filter server typecheck
```

Expected: no errors.

- [ ] **Step 6: Run full server test suite**

```bash
pnpm --filter server test
```

Expected: all existing tests continue to PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/routes/company-skills.ts server/src/__tests__/company-skills-instance-merge.test.ts
git commit -m "feat(server): merge Claude Code instance skills into company skills list"
```

---

## Task 6: Startup scan in server/src/index.ts

**Files:**
- Modify: `server/src/index.ts`

- [ ] **Step 1: Add startup scan**

In `server/src/index.ts`, add the import near the other service imports (search for `reconcilePersistedRuntimeServicesOnStartup`):

```ts
import { instanceSkillsCache } from "./services/instance-skills-cache.js";
```

Then, after the `reconcilePersistedRuntimeServicesOnStartup` block (~line 554), add:

```ts
// Load Claude Code skills from disk — fire-and-forget, non-blocking
void instanceSkillsCache.scan().then((result) => {
  logger.info(result, "instance skills loaded from Claude Code directories");
}).catch((err) => {
  logger.warn({ err }, "instance skills scan failed at startup (non-fatal)");
});
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter server typecheck
```

Expected: no errors.

- [ ] **Step 3: Smoke test — start dev server and check logs**

```bash
pnpm dev
```

Expected: log line containing `"instance skills loaded from Claude Code directories"` with a `count` field greater than 0.

- [ ] **Step 4: Commit**

```bash
git add server/src/index.ts
git commit -m "feat(server): scan Claude Code skills at server startup"
```

---

## Task 7: UI — API client and CompanySkills page

**Files:**
- Modify: `ui/src/api/companySkills.ts`
- Modify: `ui/src/pages/CompanySkills.tsx`

- [ ] **Step 1: Add refreshInstanceSkills to API client**

In `ui/src/api/companySkills.ts`, append inside the `companySkillsApi` object (after the last existing method, before the closing `};`):

```ts
  refreshInstanceSkills: () =>
    api.post<{ count: number; claudeCodeCount: number; pluginCount: number }>(
      "/instance/skills/refresh",
    ),
```

- [ ] **Step 2: Add refresh mutation to CompanySkills page**

In `ui/src/pages/CompanySkills.tsx`, find the existing `scanProjects` mutation (around line 896) and add the new mutation immediately after it:

```tsx
const refreshInstanceSkills = useMutation({
  mutationFn: () => companySkillsApi.refreshInstanceSkills(),
  onSuccess: async (data) => {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.companySkills.list(selectedCompanyId!),
    });
    pushToast({
      tone: "success",
      title: "Claude Code 스킬 동기화 완료",
      body: `총 ${data.count}개 (Claude Code ${data.claudeCodeCount}개, 플러그인 ${data.pluginCount}개)`,
    });
  },
  onError: () => {
    pushToast({ tone: "error", title: "Claude Code 스킬 동기화 실패" });
  },
});
```

- [ ] **Step 3: Add refresh button to toolbar**

Find the existing scan button (around line 1061) — it looks like:

```tsx
<Button
  variant="ghost"
  size="icon-sm"
  onClick={() => scanProjects.mutate()}
  disabled={scanProjects.isPending}
  title="Scan project workspaces for skills"
>
  <RefreshCw className={cn("h-4 w-4", scanProjects.isPending && "animate-spin")} />
</Button>
```

Add the Claude Code sync button immediately before the scan button:

```tsx
<Tooltip>
  <TooltipTrigger asChild>
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => refreshInstanceSkills.mutate()}
      disabled={refreshInstanceSkills.isPending}
    >
      <Boxes className={cn("h-4 w-4", refreshInstanceSkills.isPending && "animate-spin")} />
    </Button>
  </TooltipTrigger>
  <TooltipContent>Claude Code 스킬 동기화</TooltipContent>
</Tooltip>
```

Confirm `Boxes` is already imported (line 36–51 of CompanySkills.tsx imports lucide icons). If not, add `Boxes` to the existing lucide import.

- [ ] **Step 4: Add badge cases to sourceMeta**

In `ui/src/pages/CompanySkills.tsx`, find the `sourceMeta` function (around line 145). It has a `switch(sourceBadge)` block. Add two new cases before the `default:` case:

```tsx
case "claude_code":
  return { icon: Boxes, label: "Claude Code", managedLabel: "Claude Code" };
case "claude_plugin":
  return { icon: Boxes, label: sourceLabel ?? "Claude 플러그인", managedLabel: "Claude 플러그인" };
```

- [ ] **Step 5: Typecheck UI**

```bash
pnpm --filter ui typecheck
```

Expected: no errors. If `CompanySkillSourceBadge` type error appears, confirm Task 1 (shared types) is complete and `pnpm --filter @paperclipai/shared build` has been run.

- [ ] **Step 6: Rebuild shared package if needed**

```bash
pnpm --filter @paperclipai/shared build
```

Then re-run typecheck.

- [ ] **Step 7: Verify in browser**

Start dev server (`pnpm dev`), open `http://localhost:3100`, navigate to a company's Skills page.

Check:
- Claude Code skills appear in the list with a badge
- Clicking a Claude Code skill opens its SKILL.md content
- The skill card does not show an Edit button
- Clicking the Boxes icon button triggers a toast confirming sync count
- The `[` keyboard shortcut still works (sidebar regression check)

- [ ] **Step 8: Commit**

```bash
git add ui/src/api/companySkills.ts ui/src/pages/CompanySkills.tsx
git commit -m "feat(ui): add Claude Code skill sync button and badge rendering"
```

---

## Task 8: Final verification

- [ ] **Step 1: Run full test suite**

```bash
pnpm -r typecheck && pnpm test:run && pnpm build
```

Expected: all pass with no errors.

- [ ] **Step 2: Commit any leftover changes**

```bash
git status
```

If clean, done. If any changes, commit them.
