# Progressive Onboarding Design

## Purpose

Redesign the onboarding experience to reduce adapter/model selection confusion for non-technical users (managers, PMs) and provide guided post-onboarding steps so users know what to do after their first agent is running.

**Completion criteria:**
- Non-developer users can complete onboarding with at most 3 decisions (company name, AI tool selection via 1-click, first task description)
- Adapter auto-detection identifies locally installed tools and pre-fills configuration
- Post-onboarding Getting Started checklist guides users through 6 steps with auto-completion tracking
- Users see live agent status immediately after onboarding completion

## File Changes

| File | Action | Summary |
|------|--------|---------|
| `ui/src/components/OnboardingWizard.tsx` | Modify | Restructure from 4 steps to 3 steps; replace adapter manual selection with auto-detect + recommendation UI; merge Step 3+4 into single step |
| `ui/src/components/GettingStartedPanel.tsx` | Create | Side panel checklist component with 6 items, progress bar, collapse/expand, contextual tips |
| `ui/src/lib/onboarding-route.ts` | Modify | Update route resolution for new 3-step flow (remove step 4 handling) |
| `ui/src/lib/onboarding-launch.ts` | Modify | Simplify launch logic — single "create & start" action instead of separate summary step |
| `ui/src/App.tsx` | Modify | Mount GettingStartedPanel in board layout; add onboarding-progress query |
| `ui/src/lib/api.ts` (or equivalent) | Modify | Add `getAdapterDetection()` and `getOnboardingProgress()` API client functions |
| `server/src/routes/adapters.ts` (or new file) | Create/Modify | Add `GET /api/adapters/detect` endpoint for auto-detection |
| `server/src/routes/companies.ts` | Modify | Add `GET /api/companies/:id/onboarding-progress` endpoint |
| `server/src/services/adapter-detection.ts` | Create | Service to detect locally installed CLI tools and running servers |
| `packages/shared/src/types/onboarding.ts` | Create | Shared types for detection results, onboarding progress, checklist items |
| `tests/e2e/onboarding.spec.ts` | Modify | Update E2E test for new 3-step flow (remove step 4 assertions, add auto-detect and Getting Started panel tests) |

## Implementation Order

1. **Shared types** — Define `AdapterDetectionResult`, `OnboardingProgress`, `ChecklistItem` types in `packages/shared/src/types/onboarding.ts`. Export from package index.

2. **Adapter detection service** — Implement `server/src/services/adapter-detection.ts`:
   - `detectInstalledAdapters()`: Run `which <cli>` for CLI adapters (claude, codex, gemini, cursor) and HTTP health checks for server adapters (Ollama at localhost:11434, LM Studio at localhost:1234). Execute all checks in parallel with 2-second per-check timeout.
   - Return `{ detected: AdapterDetectionItem[], recommended: AdapterDetectionItem | null }` sorted by priority (Claude Code > Codex > Gemini CLI > Ollama > LM Studio > others).

3. **Detection API endpoint** — Add `GET /api/adapters/detect` route in `server/src/routes/adapters.ts`. Call `detectInstalledAdapters()`, return results. No auth required (pre-company-creation context).

4. **Onboarding progress endpoint** — Add `GET /api/companies/:id/onboarding-progress` route in `server/src/routes/companies.ts`:
   - Query existing data to derive step completion: company exists (step 1), agent exists (step 2), issue exists (step 3), agent has activity (step 4), agent count >= 2 (step 5), company budget set (step 6).
   - Return `{ completedSteps: number[], totalSteps: 6, currentStep: number }`.

5. **OnboardingWizard refactor** — Modify `ui/src/components/OnboardingWizard.tsx`:
   - Step 1 (Company): Add goal placeholder example. Minimal changes.
   - Step 2 (Agent Connection): Replace adapter grid with auto-detect flow. On mount, call `/api/adapters/detect`. Show detected adapters with "Detected" badge at top for 1-click selection. If nothing detected, show recommendation question ("What AI service do you use?") with 5 options:

     | User selection | Recommended adapter | Action |
     |---------------|-------------------|--------|
     | Anthropic (Claude) | `claude_local` (Claude Code) | Show install guide link + "Re-detect" button |
     | OpenAI (ChatGPT/Codex) | `codex_local` (Codex) | Show install guide link + "Re-detect" button |
     | Google (Gemini) | `gemini_cli` (Gemini CLI) | Show install guide link + "Re-detect" button |
     | Local models (Ollama etc.) | `ollama` (Ollama) | Show install guide link + "Re-detect" button |
     | I don't know | `openclaw_gateway` (OpenClaw) | Pre-fill gateway URL, no install needed |

     Agent name auto-set to "CEO". Hide CLI command/args/URL fields behind collapsible "Advanced Settings" accordion. Model auto-selected per adapter default, changeable via "Change model" link.
   - Step 3 (First Mission): Merge current Steps 3+4. Task title/description input + single "Create & Start" button that creates project + issue + navigates to board in one action.

6. **GettingStartedPanel component** — Create `ui/src/components/GettingStartedPanel.tsx`:
   - Render 6 checklist items with states: completed (green check, strikethrough), active (indigo highlight), pending (gray).
   - Progress bar at top (completed/total).
   - Each incomplete item is clickable — navigates to relevant page (deep link).
   - Contextual tip box at bottom for current step.
   - Collapse/expand toggle. Collapsed state shows floating "3/6" badge.
   - UI state (collapsed/dismissed) stored in `localStorage` keyed by company ID.
   - Fetch progress from `/api/companies/:id/onboarding-progress` on mount, poll every 5 seconds for step 4 (agent activity detection).
   - On step 4 completion: show toast notification "CEO agent has started working!".
   - On all 6 complete: show congratulations message, auto-collapse after 3 seconds, permanently hide on next dismiss.

7. **App integration** — Mount `<GettingStartedPanel />` in `ui/src/App.tsx` board layout. Show only when company has incomplete onboarding steps. Pass company ID as prop.

8. **Update onboarding-route.ts** — Remove step 4 handling from `resolveRouteOnboardingOptions()`. Adjust step range to 1-3.

9. **Update onboarding-launch.ts** — Remove `buildOnboardingProjectPayload` separation. Combine into single `launchOnboarding()` function called from Step 3's "Create & Start".

## Function/API Signatures

### Server

```typescript
// server/src/services/adapter-detection.ts
interface AdapterDetectionItem {
  type: string;           // e.g. "claude_local", "ollama"
  name: string;           // e.g. "Claude Code", "Ollama"
  version?: string;       // e.g. "1.2.3" if detectable
  defaultModel: string;   // e.g. "claude-sonnet-4-20250514"
  connectionInfo: {       // auto-filled config
    command?: string;
    args?: string[];
    baseUrl?: string;
  };
}

interface AdapterDetectionResult {
  detected: AdapterDetectionItem[];
  recommended: AdapterDetectionItem | null;  // highest priority detected
}

function detectInstalledAdapters(): Promise<AdapterDetectionResult>

// server/src/routes/adapters.ts
// GET /api/adapters/detect → AdapterDetectionResult

// server/src/routes/companies.ts
interface OnboardingProgress {
  completedSteps: number[];  // e.g. [1, 2, 3]
  totalSteps: 6;
  currentStep: number;       // first incomplete step
}

// GET /api/companies/:id/onboarding-progress → OnboardingProgress
```

### Client

```typescript
// ui/src/lib/api.ts
function getAdapterDetection(): Promise<AdapterDetectionResult>
function getOnboardingProgress(companyId: string): Promise<OnboardingProgress>
```

### Components

```typescript
// ui/src/components/GettingStartedPanel.tsx
interface GettingStartedPanelProps {
  companyId: string;
}
function GettingStartedPanel(props: GettingStartedPanelProps): JSX.Element

// ui/src/components/OnboardingWizard.tsx (modified)
// Internal state changes:
//   - Remove step 4 state
//   - Add: adapterDetection: AdapterDetectionResult | null
//   - Add: detectionLoading: boolean
//   - Add: recommendationMode: boolean (true when nothing detected)
```

## Constraints

1. **Preserve existing adapter config format.** The detection system produces the same `adapterConfig` shape that the current manual form generates. No changes to how configs are stored in the `agents` table.

2. **No DB schema changes.** Onboarding progress is derived from existing tables (companies, agents, issues, activity_log). The `GET /api/companies/:id/onboarding-progress` endpoint queries these tables.

3. **Backward compatibility.** Users who already completed onboarding (have companies + agents) should not see the Getting Started panel unless they have incomplete steps (5 or 6). If all 6 conditions are met, panel never appears.

4. **Detection endpoint has no auth.** It runs before company creation, so no company-scoped auth is possible. The endpoint only reports what CLI tools/servers are locally available — no sensitive data exposure.

5. **i18n.** All new UI strings must have Korean translations. Follow existing `useTranslation()` patterns in OnboardingWizard.

6. **Follow existing UI patterns.** GettingStartedPanel must use the project's design system tokens (colors, spacing, typography) per `.claude/skills/design-guide/SKILL.md`. Add the component to `DesignGuide.tsx` showcase.

7. **Detection timeout.** Each adapter check has a 2-second timeout. All checks run in parallel. Total detection should complete within ~3 seconds worst case. Show a loading skeleton in Step 2 during detection.

8. **Graceful degradation.** If detection endpoint fails (e.g., server can't execute `which`), fall back to recommendation question flow. Never block onboarding on detection failure.

## Decisions

- **3-step wizard over conversational UI.** Conversational onboarding has lower cognitive load but much higher implementation complexity and diverges from the existing UI paradigm. The 3-step wizard achieves similar simplification with lower risk.
- **Derived progress over stored state.** Storing checklist completion in a new DB column would be simpler to query but introduces schema changes, sync issues, and a source of truth problem. Deriving from existing data is more robust and requires no migration.
- **Side panel over top banner.** The side panel provides persistent visibility of remaining steps without requiring an extra click (modal), directly addressing the "what do I do next" problem.
- **Auto-detect over manual-only setup.** Manual adapter selection requires domain knowledge that non-developer users don't have. Auto-detection with 1-click confirmation dramatically reduces the decision burden.
- **6-item checklist over open-ended tour.** A bounded checklist with clear completion criteria is more motivating than an open-ended feature tour. 6 items is small enough to feel achievable.
