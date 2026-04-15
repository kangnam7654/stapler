CREATE TABLE "workflow_briefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"intake_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"execution_target" text DEFAULT 'issue' NOT NULL,
	"author_agent_id" uuid,
	"author_user_id" text,
	"supersedes_brief_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"legacy_artifact_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"intake_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"decided_by_agent_id" uuid,
	"decided_by_user_id" text,
	"decision_note" text,
	"route_rule_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"decided_at" timestamp with time zone,
	"legacy_workflow_case_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_handoffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"intake_id" uuid NOT NULL,
	"decision_id" uuid,
	"execution_target" text NOT NULL,
	"linked_issue_id" uuid,
	"linked_approval_id" uuid,
	"status" text DEFAULT 'queued' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"legacy_workflow_case_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_intakes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"category" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"delegation_target_agent_id" uuid,
	"delegation_mode" text,
	"requested_by_agent_id" uuid,
	"requested_by_user_id" text,
	"requested_from_issue_id" uuid,
	"priority" text DEFAULT 'medium' NOT NULL,
	"route_rule_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"due_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"legacy_workflow_case_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"intake_id" uuid NOT NULL,
	"brief_id" uuid,
	"reviewer_role" text NOT NULL,
	"reviewer_agent_id" uuid,
	"reviewer_user_id" text,
	"status" text NOT NULL,
	"decision_note" text,
	"review_summary" text,
	"legacy_review_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workflow_briefs" ADD CONSTRAINT "workflow_briefs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_briefs" ADD CONSTRAINT "workflow_briefs_intake_id_workflow_intakes_id_fk" FOREIGN KEY ("intake_id") REFERENCES "public"."workflow_intakes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_briefs" ADD CONSTRAINT "workflow_briefs_author_agent_id_agents_id_fk" FOREIGN KEY ("author_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_decisions" ADD CONSTRAINT "workflow_decisions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_decisions" ADD CONSTRAINT "workflow_decisions_intake_id_workflow_intakes_id_fk" FOREIGN KEY ("intake_id") REFERENCES "public"."workflow_intakes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_decisions" ADD CONSTRAINT "workflow_decisions_decided_by_agent_id_agents_id_fk" FOREIGN KEY ("decided_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_handoffs" ADD CONSTRAINT "workflow_handoffs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_handoffs" ADD CONSTRAINT "workflow_handoffs_intake_id_workflow_intakes_id_fk" FOREIGN KEY ("intake_id") REFERENCES "public"."workflow_intakes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_handoffs" ADD CONSTRAINT "workflow_handoffs_decision_id_workflow_decisions_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."workflow_decisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_handoffs" ADD CONSTRAINT "workflow_handoffs_linked_issue_id_issues_id_fk" FOREIGN KEY ("linked_issue_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_handoffs" ADD CONSTRAINT "workflow_handoffs_linked_approval_id_approvals_id_fk" FOREIGN KEY ("linked_approval_id") REFERENCES "public"."approvals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_intakes" ADD CONSTRAINT "workflow_intakes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_intakes" ADD CONSTRAINT "workflow_intakes_delegation_target_agent_id_agents_id_fk" FOREIGN KEY ("delegation_target_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_intakes" ADD CONSTRAINT "workflow_intakes_requested_by_agent_id_agents_id_fk" FOREIGN KEY ("requested_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_intakes" ADD CONSTRAINT "workflow_intakes_requested_from_issue_id_issues_id_fk" FOREIGN KEY ("requested_from_issue_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_reviews" ADD CONSTRAINT "workflow_reviews_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_reviews" ADD CONSTRAINT "workflow_reviews_intake_id_workflow_intakes_id_fk" FOREIGN KEY ("intake_id") REFERENCES "public"."workflow_intakes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_reviews" ADD CONSTRAINT "workflow_reviews_brief_id_workflow_briefs_id_fk" FOREIGN KEY ("brief_id") REFERENCES "public"."workflow_briefs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_reviews" ADD CONSTRAINT "workflow_reviews_reviewer_agent_id_agents_id_fk" FOREIGN KEY ("reviewer_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_briefs_intake_version_uq" ON "workflow_briefs" USING btree ("intake_id","version");--> statement-breakpoint
CREATE INDEX "workflow_briefs_company_intake_version_idx" ON "workflow_briefs" USING btree ("company_id","intake_id","version");--> statement-breakpoint
CREATE INDEX "workflow_briefs_company_author_idx" ON "workflow_briefs" USING btree ("company_id","author_agent_id","created_at");--> statement-breakpoint
CREATE INDEX "workflow_briefs_legacy_artifact_idx" ON "workflow_briefs" USING btree ("company_id","legacy_artifact_id");--> statement-breakpoint
CREATE INDEX "workflow_decisions_company_intake_idx" ON "workflow_decisions" USING btree ("company_id","intake_id");--> statement-breakpoint
CREATE INDEX "workflow_decisions_company_decision_idx" ON "workflow_decisions" USING btree ("company_id","decision");--> statement-breakpoint
CREATE INDEX "workflow_decisions_legacy_workflow_case_idx" ON "workflow_decisions" USING btree ("company_id","legacy_workflow_case_id");--> statement-breakpoint
CREATE INDEX "workflow_handoffs_company_intake_idx" ON "workflow_handoffs" USING btree ("company_id","intake_id");--> statement-breakpoint
CREATE INDEX "workflow_handoffs_company_status_idx" ON "workflow_handoffs" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "workflow_handoffs_legacy_workflow_case_idx" ON "workflow_handoffs" USING btree ("company_id","legacy_workflow_case_id");--> statement-breakpoint
CREATE INDEX "workflow_intakes_company_status_category_idx" ON "workflow_intakes" USING btree ("company_id","status","category");--> statement-breakpoint
CREATE INDEX "workflow_intakes_company_requested_by_agent_idx" ON "workflow_intakes" USING btree ("company_id","requested_by_agent_id","status");--> statement-breakpoint
CREATE INDEX "workflow_intakes_legacy_workflow_case_idx" ON "workflow_intakes" USING btree ("company_id","legacy_workflow_case_id");--> statement-breakpoint
CREATE INDEX "workflow_reviews_company_intake_created_idx" ON "workflow_reviews" USING btree ("company_id","intake_id","created_at");--> statement-breakpoint
CREATE INDEX "workflow_reviews_company_role_status_idx" ON "workflow_reviews" USING btree ("company_id","reviewer_role","status");--> statement-breakpoint
CREATE INDEX "workflow_reviews_legacy_review_idx" ON "workflow_reviews" USING btree ("company_id","legacy_review_id");