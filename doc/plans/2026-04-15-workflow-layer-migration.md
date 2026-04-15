# Workflow Layer Migration Plan

## Goal

Move from the current combined workflow model to smaller layers:

- `intake`
- `brief`
- `review`
- `decision`
- `handoff`

The migration should preserve the existing UI and API during transition, avoid data loss, and keep old workflow data readable until the new read path is fully stable.

## Current Mapping

The existing tables map to the new layers like this:

- `workflow_cases` -> `workflow_intakes`
- `workflow_case_artifacts` -> `workflow_briefs`
- `workflow_case_reviews` -> `workflow_reviews`
- `workflow_route_rules` -> routing policy

The new tables that do not yet exist are:

- `workflow_decisions`
- `workflow_handoffs`

## Migration Strategy

Use a staged migration instead of a big-bang rename.

### Phase 1: Add New Tables

Create the new tables first while keeping the old ones intact.

Recommended tables:

- `workflow_intakes`
- `workflow_briefs`
- `workflow_reviews`
- `workflow_decisions`
- `workflow_handoffs`

Add the following compatibility fields where useful:

- `legacy_workflow_case_id`
- `legacy_artifact_id`
- `legacy_review_id`

These fields are optional and only needed during the transition for traceability and backfill verification.

### Phase 2: Dual Write

Update the workflow service so new writes are stored in both places:

- existing tables keep serving the current app
- new tables receive the same semantic records

Examples:

- creating a workflow request writes to `workflow_cases` and `workflow_intakes`
- creating a brief writes to `workflow_case_artifacts` and `workflow_briefs`
- creating a review writes to `workflow_case_reviews` and `workflow_reviews`

`decision` and `handoff` can initially be written only to the new tables because they do not yet exist in the old model.

### Phase 3: Backfill

Backfill historical rows from the current tables into the new schema.

Suggested ordering:

1. backfill `workflow_intakes` from `workflow_cases`
2. backfill `workflow_briefs` from `workflow_case_artifacts`
3. backfill `workflow_reviews` from `workflow_case_reviews`
4. derive `workflow_decisions` from the current `status` and approval records
5. derive `workflow_handoffs` from `linkedIssueId`, `linkedApprovalId`, and execution target

The backfill should be idempotent and keyed by the legacy ids so it can be re-run safely.

### Phase 4: Read Switch

Move the read path in this order:

1. read from the new tables when present
2. fall back to legacy tables only for unmigrated rows
3. once coverage is complete, read only from the new tables

This allows the UI to continue working while the backfill is rolling out.

### Phase 5: Cleanup

After verification:

- stop dual writes
- remove fallback reads
- optionally keep compatibility views or alias tables for a release cycle
- drop legacy columns only after a full retention window if desired

## Recommended Constraints

- Keep `route rules` separate from workflow state.
- Do not store execution runtime or LLM session data in the workflow tables.
- Keep `delegationTargetAgentId` in the intake layer, not runtime state.
- Keep `decision` immutable once created.
- Keep `handoff` rows append-only unless a handoff is explicitly retried.

## Rollout Checks

Before and after each phase:

- compare counts between legacy and new tables
- verify company scoping on every row
- check that `intake -> brief -> review -> decision -> handoff` ordering is preserved
- validate that created UI entries still render from the same company and selected case

## Risks

- A full rename would break the current UI and API too early.
- Backfill can accidentally change semantics if `decision` is inferred too aggressively.
- Dual write bugs can cause divergence if one side succeeds and the other fails.
- The safest path is to keep the legacy tables alive until the new tables are proven stable.

## Practical Recommendation

Start with this minimal cut:

- add `workflow_intakes`
- add `workflow_briefs`
- add `workflow_reviews`
- add `workflow_decisions`
- add `workflow_handoffs`
- keep existing tables as compatibility storage
- introduce service-level adapters that write both formats
- switch reads only after backfill verification

That gives us smaller layers without forcing a risky hard cutover.
