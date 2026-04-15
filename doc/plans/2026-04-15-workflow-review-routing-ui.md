# Workflow Review Routing UI Draft

Date: 2026-04-15
Related plans:

- `doc/plans/2026-04-15-workflow-review-routing.md`
- `doc/plans/2026-04-15-workflow-review-routing-schema.md`
- `doc/plans/2026-04-15-workflow-review-routing-api.md`

## Goal

Design the UI for workflow-oriented collaboration so the operator can see:

- what kind of work is happening
- who should review it
- what draft version is current
- what decision was made
- what execution happened afterward

The UI should stay board-level and readable.
It should not become a generic chat app.

## Core UI Principle

The workflow UI should make the decision path obvious:

`request -> draft -> review -> decision -> handoff -> execution`

Raw logs remain available, but they are secondary.

## Proposed Navigation

### Agent detail page

Replace the current `대화` tab with a `Workflow` tab.

Suggested tabs:

- `Overview`
- `Instructions`
- `Workflow`
- `Runs`
- `Budget`

If we keep the existing `Messages` concept, it should become a smaller auxiliary view inside Workflow or live elsewhere in the company-level inbox.

### Company-level page

Add a new board-facing page:

- `Workflow Inbox`

This page should show every active workflow case in one place, grouped by reviewer role and status.

### Approval adjacency

Existing approvals remain visible in the inbox and on approval pages.
Workflow cases should link to them when a board gate is needed.

## Agent Detail: Workflow Tab

This is the main screen for a single agent's workflow activity.

### Layout

Use a three-column responsive layout on desktop and a stacked layout on mobile.

- Left column: case list
- Middle column: selected case timeline
- Right column: artifacts, review state, linked issue/approval, execution summary

### Left column: case list

Each case row should show:

- title
- category badge
- current status badge
- primary reviewer role
- last activity time
- unread or action-needed indicator

Sorting:

- most recently active first
- review-needed cases pinned above passive cases

### Middle column: case timeline

The selected case should show a human-readable timeline:

- request created
- draft v1 saved
- CTO review requested
- revision requested
- draft v2 saved
- approved
- issue created / hire created / config updated

Each timeline item should display:

- actor name
- role
- time
- short summary

### Right column: detail panel

This panel should expose:

- current routing rule
- current reviewer chain
- current artifact version
- final decision
- linked issue or approval
- execution handoff state

This is where we expose the structured truth of the workflow.

## Review Queue Page

Add a dedicated company-level queue for reviewers.

### Purpose

This page answers:

- what do I need to review right now?
- why did this get routed to me?
- what version am I looking at?
- what happens if I approve?

### Grouping

Group by reviewer role:

- CTO queue
- CHRO queue
- CFO queue
- COO queue
- CMO queue
- CEO queue

Inside each group:

- pending review
- revision requested
- ready for final approval
- blocked by board gate

### Card content

Each card should include:

- case title
- case category
- requester
- current artifact version
- route rule summary
- decision deadline if any
- action buttons

## Case Detail Screen

This is the deep-dive view for one workflow case.

### Sections

1. Header
2. Status strip
3. Artifact editor / preview
4. Review decision panel
5. Execution handoff panel
6. Raw logs and comments

### Header

Show:

- case title
- category badge
- status badge
- assigned reviewer chain
- linked issue / approval badges

### Status strip

Use a compact horizontal progress indicator:

`draft -> in_review -> decision -> executing -> done`

Each step should show whether it is:

- current
- complete
- blocked
- skipped

### Artifact editor / preview

Depending on role:

- requester sees draft editing controls
- reviewer sees read-only preview plus review tools
- approver sees decision summary plus handoff

Artifacts should be versioned cards, not a single mutable text area.

### Review decision panel

For reviewer roles, show:

- `Approve`
- `Request revision`
- `Reject`
- note field
- optional structured rubric fields later

The panel should explain the effect of the action:

- approve -> case can be handed off
- revision -> case returns to draft state
- reject -> case stops

### Execution handoff panel

Once approved, show the resulting action:

- created issue
- created hire request
- updated config
- created board approval

The point is to make the result visible, not hidden behind logs.

### Raw logs and comments

Keep these collapsed by default:

- stdout
- tool calls
- transcript
- internal agent messages

This preserves the debugging surface without dominating the workflow screen.

## UI States

### Empty state

If no cases exist:

- show a calm empty state
- explain that workflow cases will appear when agents create plans or requests
- provide a primary CTA like `Create workflow case`

### Loading state

Use skeletons aligned with the card and timeline layout.

### Error state

Show API failure clearly.

Do not silently fall back to raw logs.

## Mobile Behavior

On mobile:

- collapse to a single column
- use segmented tabs or a select for sections
- keep the current case visible at the top
- move artifact and review actions below the timeline

The mobile version should still answer:

- what is this?
- who reviews it?
- what is the next action?

## Visual Language

The workflow UI should feel like a control plane, not a messenger app.

Recommended visual hierarchy:

- status badges
- role chips
- version chips
- timeline dots
- review decision cards

Avoid:

- chat bubbles as the primary metaphor
- noisy transcript-first layouts
- oversized free-form text blocks

## Components to Add

Suggested reusable components:

- `WorkflowCaseList`
- `WorkflowCaseCard`
- `WorkflowCaseTimeline`
- `WorkflowArtifactPanel`
- `WorkflowReviewPanel`
- `WorkflowDecisionStrip`
- `WorkflowRouteRuleBadge`
- `WorkflowExecutionHandoff`

Optional helpers:

- `ReviewerQueueGroup`
- `CaseStatusStepper`
- `ArtifactVersionTabs`

## Relationship to Existing Screens

### Agent detail

Replace the current conversation-centric tab with workflow-centric content.

### Approvals page

Keep it as the explicit board-governance gate page.
Workflow cases can link into approvals when needed.

### Inbox

Keep it as the broad signal surface.
Workflow review requests can appear there as actionable inbox items.

### Messages

Keep direct agent messaging as a utility surface only.
It should not be the primary workflow UI.

## Interaction Flows

### 1. Create hiring case

1. CEO opens a hiring workflow case.
2. CHRO drafts the proposal.
3. CTO reviews technical fit.
4. CEO approves.
5. The UI shows the created hire/request outcome.

### 2. Request revision

1. CTO reviews a technical planning case.
2. CTO requests revision.
3. The case returns to draft.
4. A new artifact version appears in the timeline.

### 3. Board-gated decision

1. CFO approves a budget case.
2. UI indicates board approval required.
3. Board resolves the approval.
4. Workflow case completes execution.

## Implementation Order

1. Add the company-level workflow inbox page.
2. Add the agent detail workflow tab.
3. Add case detail view.
4. Add reviewer action cards.
5. Hide raw transcript by default under the workflow detail.
6. Connect the approval and issue handoff states.

## V1 Scope

For the first pass, the UI should support:

- case list
- case detail
- artifact version list
- review decision buttons
- approval linkage
- execution handoff summary

Defer:

- rich inline editing with diffs
- rubric scoring
- multi-reviewer voting
- custom company theme rules

## Recommendation

The product should stop presenting collaboration as "messages between agents" and instead present it as "structured work moving through review."

That keeps the control plane honest:

- work has a reason
- work has a reviewer
- work has a decision
- work has an execution result

This is the UI that matches the workflow model we just designed.
