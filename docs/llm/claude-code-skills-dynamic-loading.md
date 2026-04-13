# Claude Code Skills Dynamic Loading — LLM Design Doc

## Purpose

Load Claude Code's skills (`~/.claude/skills/` and `~/.claude/plugins/cache/*/skills/`) dynamically and make them available instance-wide without DB schema changes or per-company import.

**Completion criteria:**
- Server startup triggers automatic scan of both directories
- Scanned skills appear in every company's skill list with `sourceType: "claude_code"` or `"claude_plugin"`
- `POST /api/instance/skills/refresh` rescans and returns updated counts
- UI Skills page shows a "Claude Code 동기화" refresh button
- Instance skills are read-only (`editable: false`) but attachable to agents
- If a company has a skill with the same key, the company skill takes precedence (instance skill hidden)

---

## Architecture

```
Server startup
  └→ instanceSkillsCache.scan()
        ├─ ~/.claude/skills/*/SKILL.md           → sourceType: "claude_code"
        └─ ~/.claude/plugins/cache/*/skills/*/SKILL.md → sourceType: "claude_plugin"
              ↓
        in-memory Map<key, InstanceSkill>

GET /companies/:companyId/skills
  ├─ DB → company skills (existing)
  └─ instanceSkillsCache.getAll()
        → filter out keys already present in company skills
        → map to CompanySkillListItem shape
        → concat and return unified list

GET /companies/:companyId/skills/:skillId/files
  → if skillId matches an instance skill → fs.readFile(diskPath)
  → else → existing DB logic

POST /api/instance/skills/refresh   (board operator only)
  └→ instanceSkillsCache.scan()
  → returns { count, claudeCodeCount, pluginCount }
```

---

## File Changes

| File | Change |
|------|--------|
| `packages/shared/src/types/company-skill.ts` | Add `"claude_code"` and `"claude_plugin"` to `CompanySkillSourceType` and `CompanySkillSourceBadge` unions |
| `server/src/services/instance-skills-cache.ts` | **NEW** — singleton scanner + in-memory cache |
| `server/src/routes/instance-skills.ts` | **NEW** — `POST /api/instance/skills/refresh` |
| `server/src/routes/company-skills.ts` | Modify list and file-read handlers to merge instance skills |
| `server/src/index.ts` | Call `instanceSkillsCache.scan()` at startup (fire-and-forget) |
| `ui/src/api/companySkills.ts` | Add `refreshInstanceSkills()` function |
| `ui/src/pages/CompanySkills.tsx` | Add refresh button; handle `"claude_code"` / `"claude_plugin"` badge |

---

## Implementation Order

### Step 1 — `packages/shared/src/types/company-skill.ts`

Extend the two union types:

```ts
// Before:
export type CompanySkillSourceType =
  | "local_path" | "github" | "url" | "catalog" | "skills_sh";

export type CompanySkillSourceBadge =
  | "paperclip" | "github" | "local" | "url" | "catalog" | "skills_sh";

// After:
export type CompanySkillSourceType =
  | "local_path" | "github" | "url" | "catalog" | "skills_sh"
  | "claude_code" | "claude_plugin";

export type CompanySkillSourceBadge =
  | "paperclip" | "github" | "local" | "url" | "catalog" | "skills_sh"
  | "claude_code" | "claude_plugin";
```

No other shared type changes. `CompanySkillListItem`, `CompanySkill`, `CompanySkillDetail` all remain the same — instance skills are projected into these shapes at the server layer.

### Step 2 — `server/src/services/instance-skills-cache.ts` (NEW)

```ts
export interface InstanceSkill {
  id: string;           // deterministic UUID from key via uuidv5(key, NAMESPACE)
  key: string;          // "claude/research" | "claude-plugins/superpowers/brainstorming"
  slug: string;         // last path segment: "research", "brainstorming"
  name: string;         // from SKILL.md frontmatter.name, fallback: slug
  description: string;  // from SKILL.md frontmatter.description, fallback: ""
  diskPath: string;     // absolute path to SKILL.md
  sourceType: "claude_code" | "claude_plugin";
  sourceLabel: string;  // "Claude Code" | "superpowers 5.0.7"
  pluginName?: string;  // "superpowers" (plugin skills only)
  pluginVersion?: string; // "5.0.7" (plugin skills only)
  markdown: string;     // full SKILL.md text (cached in memory)
}
```

**Key generation rules:**
- `~/.claude/skills/research/SKILL.md` → key `claude/research`
- `~/.claude/plugins/cache/claude-plugins-official/superpowers/5.0.7/skills/brainstorming/SKILL.md` → key `claude-plugins/superpowers/brainstorming`
- Plugin path pattern: `cache/{publisher}/{plugin}/{version}/skills/{skillName}/SKILL.md`

**Scan directories:**
```ts
const SKILL_DIRS: Array<{ root: string; sourceType: InstanceSkill["sourceType"] }> = [
  { root: path.join(os.homedir(), ".claude", "skills"), sourceType: "claude_code" },
  { root: path.join(os.homedir(), ".claude", "plugins", "cache"), sourceType: "claude_plugin" },
];
```

**Skip patterns (for `~/.claude/skills/`):**
- Directories ending with `-workspace`
- `_shared` directory
- Entries without a `SKILL.md` file

**For plugin cache:** traverse `cache/{publisher}/{plugin}/{version}/skills/{skillName}/SKILL.md` — max depth 5.

**SKILL.md parsing:**
```ts
function parseFrontmatter(content: string): { name?: string; description?: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  // parse YAML: only read `name:` and `description:` lines
  const lines = match[1].split("\n");
  const result: Record<string, string> = {};
  for (const line of lines) {
    const [k, ...v] = line.split(":");
    if (k && v.length) result[k.trim()] = v.join(":").trim().replace(/^["']|["']$/g, "");
  }
  return { name: result.name, description: result.description };
}
```

**Singleton export:**
```ts
export const instanceSkillsCache = createInstanceSkillsCache();

// Public API:
instanceSkillsCache.scan(): Promise<{ count: number; claudeCodeCount: number; pluginCount: number }>
instanceSkillsCache.getAll(): InstanceSkill[]
instanceSkillsCache.getById(id: string): InstanceSkill | undefined
instanceSkillsCache.getByKey(key: string): InstanceSkill | undefined
```

**Error handling:** If a directory doesn't exist or a SKILL.md is malformed, log a warning and skip — never throw. Scan is non-blocking (fire-and-forget at startup).

### Step 3 — `server/src/routes/instance-skills.ts` (NEW)

```ts
export function instanceSkillRoutes() {
  const router = Router();

  router.post("/instance/skills/refresh", async (req, res) => {
    // Board operator only — agent keys cannot call this
    if (req.actor.type !== "board") {
      throw forbidden("Instance skill refresh requires board access");
    }
    const result = await instanceSkillsCache.scan();
    res.json(result);
  });

  return router;
}
```

Mount in main app after existing routes: `app.use("/api", instanceSkillRoutes())`.

### Step 4 — `server/src/routes/company-skills.ts`

**Modify `GET /companies/:companyId/skills`:**
```ts
router.get("/companies/:companyId/skills", async (req, res) => {
  const companyId = req.params.companyId as string;
  assertCompanyAccess(req, companyId);

  const dbSkills = await svc.list(companyId);           // existing
  const dbKeys = new Set(dbSkills.map((s) => s.key));

  const instanceItems = instanceSkillsCache
    .getAll()
    .filter((s) => !dbKeys.has(s.key))                  // company skill wins on collision
    .map((s) => toCompanySkillListItem(s, companyId));  // project to CompanySkillListItem

  res.json([...dbSkills, ...instanceItems]);
});
```

**`toCompanySkillListItem(s: InstanceSkill, companyId: string): CompanySkillListItem`:**
```ts
{
  id: s.id,
  companyId,
  key: s.key,
  slug: s.slug,
  name: s.name,
  description: s.description,
  sourceType: s.sourceType,
  sourceLocator: s.diskPath,
  sourceRef: null,
  trustLevel: "markdown_only",
  compatibility: "compatible",
  fileInventory: [{ path: "SKILL.md", kind: "skill" }],
  metadata: {},
  createdAt: new Date(0).toISOString(), // stable sentinel
  updatedAt: new Date(0).toISOString(),
  attachedAgentCount: 0,                // not tracked for instance skills
  editable: false,
  editableReason: "Claude Code 디스크 스킬은 편집할 수 없습니다",
  sourceLabel: s.sourceLabel,
  sourceBadge: s.sourceType,            // "claude_code" | "claude_plugin"
}
```

**Modify `GET /companies/:companyId/skills/:skillId/files`:**
```ts
// At the top of the handler, before DB lookup:
const instanceSkill = instanceSkillsCache.getById(skillId);
if (instanceSkill) {
  const content = await fs.readFile(instanceSkill.diskPath, "utf-8");
  return res.json({ path: "SKILL.md", content });
}
// ... existing DB logic below
```

### Step 5 — `server/src/index.ts`

Add startup scan after existing startup reconciliation block (~line 554):

```ts
// Fire-and-forget: non-blocking, errors are logged inside scan()
void instanceSkillsCache.scan().then((result) => {
  logger.info(result, "instance skills loaded from Claude Code directories");
}).catch((err) => {
  logger.warn({ err }, "instance skills scan failed at startup");
});
```

### Step 6 — `ui/src/api/companySkills.ts`

Add one function:

```ts
export async function refreshInstanceSkills(): Promise<{
  count: number;
  claudeCodeCount: number;
  pluginCount: number;
}> {
  const res = await fetch("/api/instance/skills/refresh", { method: "POST" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
```

### Step 7 — `ui/src/pages/CompanySkills.tsx`

**Refresh button** (add to page toolbar, alongside existing "Import" / "Scan" buttons):

```tsx
const refreshMutation = useMutation({
  mutationFn: companySkillsApi.refreshInstanceSkills,
  onSuccess: (data) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.skills.list(companyId) });
    showToast(`Claude Code 스킬 동기화 완료 (${data.count}개)`);
  },
  onError: () => showToast("동기화 실패", "error"),
});

// In JSX toolbar:
<Button
  variant="outline"
  size="sm"
  onClick={() => refreshMutation.mutate()}
  disabled={refreshMutation.isPending}
>
  <RefreshCw className={cn("h-4 w-4 mr-1", refreshMutation.isPending && "animate-spin")} />
  Claude Code 동기화
</Button>
```

**Badge rendering** — existing `sourceBadge` switch already renders per-badge UI; add cases:
```tsx
case "claude_code":   return <Badge>Claude Code</Badge>;
case "claude_plugin": return <Badge>{skill.sourceLabel}</Badge>; // e.g. "superpowers 5.0.7"
```

---

## Function/API Signatures

```ts
// server/src/services/instance-skills-cache.ts
function createInstanceSkillsCache(): {
  scan(): Promise<{ count: number; claudeCodeCount: number; pluginCount: number }>;
  getAll(): InstanceSkill[];
  getById(id: string): InstanceSkill | undefined;
  getByKey(key: string): InstanceSkill | undefined;
}

// server/src/routes/instance-skills.ts
function instanceSkillRoutes(): Router;

// ui/src/api/companySkills.ts
function refreshInstanceSkills(): Promise<{ count: number; claudeCodeCount: number; pluginCount: number }>;
```

---

## Constraints

- Do not touch `packages/db` schema — no migrations.
- Instance skills are **always read-only** — reject any PATCH/DELETE on instance skill IDs in existing handlers.
- `attachedAgentCount` for instance skills is `0` (not tracked). Agent attachment still works via `adapterConfig.paperclipSkillSyncPreference.desiredSkills` — skills are referenced by key, not ID, at runtime.
- Scan is **non-blocking** at startup. If the Claude dirs don't exist (CI, Docker), scan returns `{ count: 0, ... }` silently.
- ID generation must be deterministic: `uuidv5(key, "claude-code-skills-ns-uuid")` so IDs are stable across restarts.
- Do not scan `*-workspace` directories or `_shared` under `~/.claude/skills/`.
- Plugin scan must handle the `{publisher}/{plugin}/{version}/skills/{name}` depth — do not flatten arbitrarily.

---

## Decisions

- **In-memory over DB**: "Dynamic loading" requires disk reads per scan; DB would add a migration and complicate the "always fresh" requirement. Memory cache is rebuilt on startup and on demand, which satisfies both.
- **Company skill wins on collision**: A locally customized skill should override the instance default without errors. No UI warning needed — omitting the instance skill from the list is sufficient.
- **Deterministic IDs via uuidv5**: Stable IDs let the file-read handler (`/files`) find instance skills even if the list response was cached client-side across a rescan.
- **`attachedAgentCount: 0` for instance skills**: Computing real counts would require a full agent config scan per request. Not worth the cost for read-only skills that agents already find by key.
- **No file-writing for instance skills**: `editable: false` + reject PATCH in the handler. Disk skill content is managed by the user outside Stapler.
