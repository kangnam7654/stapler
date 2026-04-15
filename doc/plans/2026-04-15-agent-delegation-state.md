# Agent Delegation State MVP

Date: 2026-04-15

## Purpose

Add a first-class delegation state for agent-to-agent work routing so the board can talk mainly to the CEO while still inspecting how work moves through the internal company.

The current `issues` model is good for board-visible work and audit history. The current `agent_messages` model is good for communication. Neither is a durable workflow graph for internal delegation. This MVP adds `agent_delegations` as the missing middle layer.

## Model Boundaries

- `issues`: board-facing work records, checkout, workspace execution, comments, and final audit trail.
- `agent_messages`: communication and inbox notifications between agents.
- `agent_delegations`: internal work routing state, ownership, status, parent-child delegation graph, reports.
- `agent_wakeup_requests`: runtime queue for waking agents.
- `heartbeat_runs.context_snapshot`: thin pointer payload passed into agent runs.

## Data Flow

1. An agent creates a delegation for another agent.
2. The server validates both agents are in the same company and not terminated.
3. The server inserts `agent_delegations`.
4. The server creates an optional `delegation` message.
5. The server wakes the delegate with `contextSnapshot.delegationId`.
6. The delegate reads `GET /api/delegations/:delegationId`.
7. The delegate can claim, update, or report the delegation.
8. Reporting wakes the delegator with `wakeReason=delegation_reported`.

## MVP API

- `GET /api/companies/:companyId/delegations`
- `POST /api/companies/:companyId/delegations`
- `GET /api/companies/:companyId/delegations/:delegationId`
- `PATCH /api/delegations/:delegationId`
- `POST /api/delegations/:delegationId/claim`
- `POST /api/delegations/:delegationId/report`
- `POST /api/delegations/:delegationId/cancel`

## UI

Add an agent delegation panel to `/workflow` so the board can inspect internal routing without reading every message thread.

The first UI should answer:

- Who delegated work?
- Who received it?
- What is the title/brief?
- Is it queued, active, blocked, reported, done, or cancelled?
- Which issue or parent delegation is it connected to?
- What was reported back?

## Context Delivery

Delegation rows are not passed wholesale to every LLM run. The server passes thin pointers:

```json
{
  "wakeReason": "delegation_assigned",
  "delegationId": "uuid",
  "rootIssueId": "uuid",
  "linkedIssueId": "uuid"
}
```

The agent then fetches current details through the API.

## Guardrails

- Delegator and delegate must be in the same company.
- Terminated agents cannot send or receive delegations.
- Delegation status transitions are explicit.
- Mutations write activity log entries.
- Delegate wakeups include `delegationId` in `contextSnapshot`.
- Report wakeups notify the delegator.

## Deferred

- Deep automatic parent completion when all children are done.
- Rule-based role routing such as `role=cto`.
- Graph visualization.
- Fine-grained permissions between manager/subordinate lines.
- Max depth and max child delegation policy enforcement.
