CREATE TABLE "agent_delegations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"parent_delegation_id" uuid,
	"root_issue_id" uuid,
	"linked_issue_id" uuid,
	"source_message_id" uuid,
	"delegator_agent_id" uuid NOT NULL,
	"delegate_agent_id" uuid NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"title" text NOT NULL,
	"brief" text,
	"acceptance_criteria" text,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result" text,
	"priority" text DEFAULT 'medium' NOT NULL,
	"due_at" timestamp with time zone,
	"idempotency_key" text,
	"created_run_id" uuid,
	"claimed_run_id" uuid,
	"completed_run_id" uuid,
	"claimed_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"reported_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_delegations" ADD CONSTRAINT "agent_delegations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_delegations" ADD CONSTRAINT "agent_delegations_parent_delegation_id_agent_delegations_id_fk" FOREIGN KEY ("parent_delegation_id") REFERENCES "public"."agent_delegations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_delegations" ADD CONSTRAINT "agent_delegations_root_issue_id_issues_id_fk" FOREIGN KEY ("root_issue_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_delegations" ADD CONSTRAINT "agent_delegations_linked_issue_id_issues_id_fk" FOREIGN KEY ("linked_issue_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_delegations" ADD CONSTRAINT "agent_delegations_source_message_id_agent_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."agent_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_delegations" ADD CONSTRAINT "agent_delegations_delegator_agent_id_agents_id_fk" FOREIGN KEY ("delegator_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_delegations" ADD CONSTRAINT "agent_delegations_delegate_agent_id_agents_id_fk" FOREIGN KEY ("delegate_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_delegations" ADD CONSTRAINT "agent_delegations_created_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("created_run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_delegations" ADD CONSTRAINT "agent_delegations_claimed_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("claimed_run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_delegations" ADD CONSTRAINT "agent_delegations_completed_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("completed_run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_delegations_company_status_idx" ON "agent_delegations" USING btree ("company_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "agent_delegations_delegate_status_idx" ON "agent_delegations" USING btree ("company_id","delegate_agent_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "agent_delegations_delegator_status_idx" ON "agent_delegations" USING btree ("company_id","delegator_agent_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "agent_delegations_parent_idx" ON "agent_delegations" USING btree ("company_id","parent_delegation_id");--> statement-breakpoint
CREATE INDEX "agent_delegations_root_issue_idx" ON "agent_delegations" USING btree ("company_id","root_issue_id");--> statement-breakpoint
CREATE INDEX "agent_delegations_linked_issue_idx" ON "agent_delegations" USING btree ("company_id","linked_issue_id");--> statement-breakpoint
CREATE INDEX "agent_delegations_idempotency_idx" ON "agent_delegations" USING btree ("company_id","idempotency_key");