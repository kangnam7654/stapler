# Budget Policy Creation on Costs Page + Sidebar Toggle Button

Date: 2026-04-13
Scope: UI-only. No DB/API/schema changes.

## Purpose

Two independent UX fixes reported by the product owner:

1. **Budgets tab cannot create policies.** `ui/src/pages/Costs.tsx` only renders
   budget policies that already exist (`if (rows.length === 0) return null;`
   on line 908). There is no UI path to create a `scopeType: "company"` policy
   anywhere in the app. Agent and project budgets can only be created by
   navigating to each `AgentDetail` / `ProjectDetail` page, which is tedious.
2. **Sidebar collapse has no visible affordance.** `[` keyboard shortcut in
   `ui/src/hooks/useKeyboardShortcuts.ts` works, but desktop users cannot
   discover or use it without a button. When the sidebar collapses to `w-0`
   (Layout.tsx line 352), there is no way to re-open it except the shortcut.

Completion criteria (verifiable):

- From `Costs > Budgets` tab, a user can create a new company/agent/project
  budget policy via one dialog without leaving the page.
- Agents/projects that already have a policy are disabled in the selector with
  a "이미 설정됨" label.
- `BreadcrumbBar` shows a toggle button on all viewport widths; clicking it
  calls `useSidebar().toggleSidebar`. Icon reflects open/closed state.
- `pnpm -r typecheck && pnpm test:run && pnpm build` passes.

## File Changes

| File | Change |
|---|---|
| `ui/src/components/BudgetPolicyDialog.tsx` | **NEW.** Dialog: scope radio + target select + amount input + save. |
| `ui/src/pages/Costs.tsx` | Add `+ 예산 추가` button in Budgets tab header. Wire dialog open state. Keep existing per-section rendering but always show all three section headers (company/agent/project), each with an inline `+` button when section is empty. Replace empty-state `Card` with CTA prompting dialog. |
| `ui/src/components/BreadcrumbBar.tsx` | Replace `isMobile`-only `Menu` button with always-visible `PanelLeft`/`PanelLeftOpen` toggle. Add tooltip `[`. |
| `ui/src/i18n/ko.json` | Add `costs.addBudget`, `costs.selectAgent`, `costs.selectProject`, `costs.budgetScopeCompany`, `costs.budgetScopeAgent`, `costs.budgetScopeProject`, `costs.budgetAmountUsd`, `costs.alreadyConfigured`, `costs.noAvailableTargets`. |
| `ui/src/components/BudgetPolicyDialog.test.tsx` | **NEW.** Unit tests (see Tests section). |
| `ui/src/components/BreadcrumbBar.test.tsx` | **NEW.** Toggle click calls `toggleSidebar`. |

Out of scope: server/API, DB, `packages/shared`, `packages/db` — all budget
endpoints and types already exist.

## Implementation Order

### Step 1 — `BudgetPolicyDialog.tsx`

Create `ui/src/components/BudgetPolicyDialog.tsx`.

Component signature:

```ts
export interface BudgetPolicyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  existingPolicies: BudgetPolicySummary[]; // to filter out already-configured targets
}

export function BudgetPolicyDialog(props: BudgetPolicyDialogProps): JSX.Element;
```

Internal state:

```ts
type ScopeChoice = "company" | "agent" | "project";
const [scope, setScope] = useState<ScopeChoice>("company");
const [targetId, setTargetId] = useState<string | null>(null);
const [amountUsd, setAmountUsd] = useState<string>("");
const [error, setError] = useState<string | null>(null);
```

Data sources:

- `useQuery({ queryKey: queryKeys.agents.list(companyId), queryFn: () =>
  agentsApi.list(companyId), enabled: open && scope === "agent" })`
- `useQuery({ queryKey: queryKeys.projects.list(companyId), queryFn: () =>
  projectsApi.list(companyId), enabled: open && scope === "project" })`

Filtering:

```ts
const existingAgentIds = new Set(
  existingPolicies.filter((p) => p.scopeType === "agent").map((p) => p.scopeId),
);
const existingProjectIds = new Set(
  existingPolicies.filter((p) => p.scopeType === "project").map((p) => p.scopeId),
);
const companyPolicyExists = existingPolicies.some((p) => p.scopeType === "company");
```

Scope-specific behavior:

| Scope | Target selector | `windowKind` | Disabled condition |
|---|---|---|---|
| `company` | hidden | `calendar_month_utc` | `companyPolicyExists` |
| `agent` | `<Select>` of agents | `calendar_month_utc` | no selectable agents |
| `project` | `<Select>` of projects | `lifetime` | no selectable projects |

On submit:

```ts
const cents = parseDollarInput(amountUsd); // reuse helper, lift to lib/utils
if (cents === null || cents <= 0) { setError("유효한 금액을 입력하세요."); return; }
mutation.mutate({
  scopeType: scope,
  scopeId: scope === "company" ? companyId : targetId!,
  amount: cents,
  windowKind: scope === "project" ? "lifetime" : "calendar_month_utc",
});
```

`mutation` uses `budgetsApi.upsertPolicy(companyId, ...)`. On success:
`queryClient.invalidateQueries({ queryKey: queryKeys.budgets.overview(companyId) })`,
reset form, call `onOpenChange(false)`.

Extract `parseDollarInput` from `BudgetPolicyCard.tsx` to `lib/utils.ts`
(already has currency helpers). Update `BudgetPolicyCard.tsx` import.

### Step 2 — Wire into `Costs.tsx`

In `ui/src/pages/Costs.tsx`:

1. Add state: `const [budgetDialogOpen, setBudgetDialogOpen] = useState(false);`
2. In `<TabsContent value="budgets">`, after the incidents block and before the
   `{(["company", "agent", "project"] as const).map(...)}` section, add:

   ```tsx
   <div className="flex items-center justify-between">
     <div>
       <h2 className="text-lg font-semibold">{t("costs.budgets")}</h2>
       <p className="text-sm text-muted-foreground">
         {t("costs.budgetsDescription")}
       </p>
     </div>
     <Button onClick={() => setBudgetDialogOpen(true)}>
       <Plus className="h-4 w-4 mr-1" />
       {t("costs.addBudget")}
     </Button>
   </div>
   ```

3. Replace the current `budgetPolicies.length === 0 ? <Card>...<empty>...` with
   an empty-state card that includes a primary CTA button opening the dialog.
4. Keep the per-scope `section` rendering loop, but remove the
   `if (rows.length === 0) return null;` short-circuit — render empty sections
   with a small "아직 설정된 예산이 없습니다" line. (Rationale: makes scope
   visibility consistent regardless of policy count.)
5. Mount `<BudgetPolicyDialog>` once at the bottom of the tab content, passing
   `companyId`, `open={budgetDialogOpen}`, `onOpenChange={setBudgetDialogOpen}`,
   and `existingPolicies={budgetPolicies}`.

### Step 3 — `BreadcrumbBar` toggle button

In `ui/src/components/BreadcrumbBar.tsx`:

1. Import `PanelLeft, PanelLeftClose` from `lucide-react`. Remove `Menu` import.
2. Replace the `isMobile && <Button ... Menu ...>` block with an always-visible
   button:

   ```tsx
   const toggleButton = (
     <Tooltip>
       <TooltipTrigger asChild>
         <Button
           variant="ghost"
           size="icon-sm"
           className="mr-2 shrink-0"
           onClick={toggleSidebar}
           aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
         >
           {sidebarOpen ? <PanelLeftClose className="h-5 w-5" /> : <PanelLeft className="h-5 w-5" />}
         </Button>
       </TooltipTrigger>
       <TooltipContent>{sidebarOpen ? "접기" : "펼치기"} · [</TooltipContent>
     </Tooltip>
   );
   ```

3. Replace all existing `{menuButton}` references with `{toggleButton}`.
4. Include `toggleButton` even in the `breadcrumbs.length === 0` branch (align
   left instead of hiding).
5. Destructure `sidebarOpen` from `useSidebar()`.

### Step 4 — i18n strings

Add to `ui/src/i18n/ko.json` under `costs`:

```json
"addBudget": "예산 추가",
"budgetsDescription": "에이전트·프로젝트·회사 단위 예산 정책을 관리합니다.",
"budgetScopeCompany": "회사 (총합)",
"budgetScopeAgent": "에이전트",
"budgetScopeProject": "프로젝트",
"selectAgent": "에이전트 선택",
"selectProject": "프로젝트 선택",
"budgetAmountUsd": "금액 (USD)",
"alreadyConfigured": "이미 설정됨",
"noAvailableTargets": "선택 가능한 항목이 없습니다.",
"budgetCreatedSuccess": "예산이 생성되었습니다."
```

### Step 5 — Tests

`ui/src/components/BudgetPolicyDialog.test.tsx`:

- Renders with `scope=company` by default.
- Switching scope to `agent` loads agent list via mocked `agentsApi.list`.
- Agents with existing policy appear disabled.
- Submitting with empty amount shows validation error.
- Submitting with valid amount calls `budgetsApi.upsertPolicy` with the correct
  `scopeType`, `scopeId`, `amount`, and `windowKind`.
- On success, `onOpenChange(false)` is called.

`ui/src/components/BreadcrumbBar.test.tsx`:

- Toggle button is present when `breadcrumbs.length === 0`, 1, and 2+.
- Click invokes `toggleSidebar` mock.
- Icon switches based on `sidebarOpen` value.

Use existing patterns from `ui/src/components/MarkdownBody.test.tsx` and
`ui/src/lib/inbox.test.ts` (vitest + @testing-library/react).

## Constraints

- **Do not touch server, API contracts, DB, or `packages/*`.** All required
  endpoints (`budgetsApi.upsertPolicy`, `agentsApi.list`, `projectsApi.list`)
  already exist in `ui/src/api/*.ts`.
- Reuse `parseDollarInput` / `centsInputValue` currency helpers. Move them to
  `lib/utils.ts` rather than duplicating.
- `BudgetPolicyUpsertInput` from `@paperclipai/shared` already accepts all
  three scopes. Do not add a new type.
- `scopeType: "agent"` uses `windowKind: "calendar_month_utc"`.
  `scopeType: "project"` uses `windowKind: "lifetime"` (matches
  AgentDetail.tsx:705 and ProjectDetail.tsx usage).
- Do not regress the existing mobile swipe-to-open gesture in Layout.tsx.
- Naming: Korean labels for user-facing strings; English for code identifiers.

## Decisions

- **Single dialog vs per-section "+" buttons.** Chose single dialog. Rationale:
  the primary friction is discovering that company-scope budgets can be created
  at all — one prominent button solves that. Per-section buttons were rejected
  because users don't think in scope sections first; they think "add budget",
  then pick scope.
- **Keep rendering empty sections with header.** Rejected the current "hide
  empty section" behavior. Rationale: consistency — always show all three
  scopes so users can see what's configurable, and the per-section headers act
  as ambient labels.
- **Always-visible sidebar toggle in BreadcrumbBar.** Rejected placing toggle
  inside the sidebar footer. Rationale: once sidebar collapses the footer
  disappears with it — impossible to re-open without the shortcut. BreadcrumbBar
  is always rendered and a natural location.
- **No cents input (USD only).** Existing `BudgetPolicyCard` uses USD input
  with automatic cents conversion via `parseDollarInput`. Keep the same
  convention for the create flow.
- **`warnPercent`, `hardStopEnabled`, etc. use backend defaults.** The
  `upsertPolicy` endpoint accepts these as optional; backend applies sensible
  defaults. Do not surface them in the create dialog. Users can tune them
  later per-policy via existing `BudgetPolicyCard` (future work if needed).
