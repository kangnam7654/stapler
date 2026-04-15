# Workflow Layer Schema

## Goal

Separate the decision flow into smaller layers so the workflow system stays readable:

- `intake` = request entry
- `brief` = proposal / draft
- `review` = critique / feedback
- `decision` = approve / revise / reject
- `handoff` = execution handoff to issue or approval

## Compatibility Mapping

The current tables stay in place for now:

- `workflow_cases` -> `intake`
- `workflow_case_artifacts` -> `brief`
- `workflow_case_reviews` -> `review`
- `workflow_route_rules` -> `routing policy`

`decision` and `handoff` should become their own tables later, once the UI and service logic are ready to split them cleanly.

## Proposed Tables

### `workflow_intakes`

The request entry layer.

Fields:
- `id`
- `company_id`
- `kind`
- `category`
- `title`
- `summary`
- `details`
- `delegation_target_agent_id`
- `delegation_mode`
- `requested_by_agent_id`
- `requested_by_user_id`
- `requested_from_issue_id`
- `priority`
- `status`
- `route_rule_snapshot`
- `created_at`
- `updated_at`

### `workflow_briefs`

The drafted proposal layer.

Fields:
- `id`
- `company_id`
- `intake_id`
- `version`
- `title`
- `body`
- `execution_target`
- `author_agent_id`
- `author_user_id`
- `supersedes_brief_id`
- `metadata`
- `created_at`
- `updated_at`

### `workflow_reviews`

The review / critique layer.

Fields:
- `id`
- `company_id`
- `intake_id`
- `brief_id`
- `reviewer_role`
- `reviewer_agent_id`
- `reviewer_user_id`
- `status`
- `decision_note`
- `review_summary`
- `created_at`
- `updated_at`

### `workflow_decisions`

The final choice layer.

Fields:
- `id`
- `company_id`
- `intake_id`
- `decision`
- `decided_by_agent_id`
- `decided_by_user_id`
- `decision_note`
- `decided_at`
- `created_at`
- `updated_at`

### `workflow_handoffs`

The execution handoff layer.

Fields:
- `id`
- `company_id`
- `intake_id`
- `decision_id`
- `execution_target`
- `linked_issue_id`
- `linked_approval_id`
- `status`
- `started_at`
- `completed_at`
- `created_at`
- `updated_at`

## Design Notes

- Keep routing policy separate from runtime execution.
- Let `delegation_target_agent_id` short-circuit routing when present.
- Use `kind` to pick the template, `category` to pick the reviewer, and `decision` to pick the handoff.
- Do not overload the runtime state tables with workflow routing metadata.
