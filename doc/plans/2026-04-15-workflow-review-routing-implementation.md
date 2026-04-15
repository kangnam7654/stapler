# Workflow Review Routing Implementation Order

Date: 2026-04-15
Related plans:

- `doc/plans/2026-04-15-workflow-review-routing.md`
- `doc/plans/2026-04-15-workflow-review-routing-schema.md`
- `doc/plans/2026-04-15-workflow-review-routing-api.md`
- `doc/plans/2026-04-15-workflow-review-routing-ui.md`

## Goal

Turn the workflow review design into a working vertical slice without breaking the current task / approval system.

The implementation should be incremental:

1. add the data model
2. add the API
3. add the UI shell
4. wire the handoff
5. add tests and migration validation

## Implementation Strategy

### Phase 1: Schema and shared contracts

Start with the new workflow tables and the shared types/validators needed by the API and UI.

Files to touch:

- `packages/db/src/schema/workflow_cases.ts`
- `packages/db/src/schema/workflow_case_artifacts.ts`
- `packages/db/src/schema/workflow_case_reviews.ts`
- `packages/db/src/schema/workflow_route_rules.ts`
- `packages/db/src/schema/index.ts`
- `packages/shared/src/types/...`
- `packages/shared/src/validators/...`

Primary goals:

- company scoping
- route rule persistence
- versioned artifacts
- structured reviews

### Phase 2: Server routes

Add a dedicated workflow route module and register it with the server.

Files to touch:

- `server/src/routes/workflows.ts`
- `server/src/routes/index.ts`
- `server/src/services/...` as needed
- `server/src/__tests__/...`

Primary goals:

- list/create workflow cases
- list/create artifacts
- submit reviews
- approve/reject cases
- read routing rules
- write activity log entries

### Phase 3: UI shell

Expose the workflow screen in the existing agent detail page and add the company-level review queue.

Files to touch:

- `ui/src/pages/AgentDetail.tsx`
- `ui/src/pages/WorkflowInbox.tsx`
- `ui/src/components/WorkflowCaseCard.tsx`
- `ui/src/components/WorkflowCaseTimeline.tsx`
- `ui/src/components/WorkflowReviewPanel.tsx`
- `ui/src/components/WorkflowArtifactPanel.tsx`
- `ui/src/components/PageTabBar.tsx` if tab labels need any adjustments
- `ui/src/App.tsx`
- `ui/src/lib/queryKeys.ts`
- `ui/src/api/workflows.ts`

Primary goals:

- replace the conversational feel with workflow-first content
- show what is pending review
- show the current artifact version
- show the review decision controls

### Phase 4: Execution handoff

When a case is approved, create the real downstream object.

Handoff targets:

- `issue` creation for execution work
- `agent` hire flow for hiring cases
- `approval` creation or resolution for board-gated cases

Files to touch:

- `server/src/services/...`
- `server/src/routes/workflows.ts`
- `server/src/routes/agents.ts` if hire flow needs reuse
- `server/src/routes/issues.ts` if case approval creates issues
- `server/src/routes/approvals.ts` if workflow approval bridges into approvals

Primary goals:

- no duplicate objects
- clear audit trail
- explicit state transition

### Phase 5: Notifications and inbox integration

Surface workflow cases in the existing inbox and badge system.

Files to touch:

- `ui/src/hooks/useInboxBadge.ts`
- `ui/src/pages/Inbox.tsx`
- `ui/src/context/LiveUpdatesProvider.tsx`
- `server/src/routes/sidebar-badges.ts`

Primary goals:

- workflow review requests show up as actionable inbox items
- reviewer queues are visible at a glance
- cases needing attention are surfaced without opening the detail page

## Suggested First Vertical Slice

The smallest useful slice is:

1. create a workflow case
2. create one artifact
3. submit one review
4. approve or request revision
5. write an activity log entry
6. show it on the agent detail page

That slice is enough to prove the model before we add richer review routing.

## Validation Plan

Run the normal repo gates after each major phase:

- `pnpm -r typecheck`
- `pnpm test:run`
- `pnpm build`

Add targeted tests for:

- workflow route rule lookup
- workflow case creation and status transition
- review submission
- approval handoff
- agent detail workflow tab rendering

## Risks

### 1. Duplicating approvals

If workflow cases and approvals drift apart, the UI will become confusing.

Mitigation:

- keep approvals as the explicit board gate
- keep workflow cases as orchestration only

### 2. Over-modeling chat

If the UI leans too hard on messages, the product will regress into a chat app.

Mitigation:

- present artifacts, reviews, and decisions first
- hide raw transcript by default

### 3. Too much schema too early

If we add participant, event, and routing variants all at once, the first migration becomes hard to reason about.

Mitigation:

- start with the four core tables only
- defer optional participant/event tables

## Recommendation

Implement the workflow layer as a narrow, additive vertical slice.
Do not wait for a perfect general-purpose workflow engine.
The first version should be opinionated enough to support the CEO -> CHRO -> CTO pattern cleanly, while staying compatible with the rest of Paperclip's task and approval primitives.
