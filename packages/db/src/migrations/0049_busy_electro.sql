CREATE TABLE "workflow_case_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"workflow_case_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"author_agent_id" uuid,
	"author_user_id" text,
	"supersedes_artifact_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_case_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"workflow_case_id" uuid NOT NULL,
	"artifact_id" uuid,
	"reviewer_role" text NOT NULL,
	"reviewer_agent_id" uuid,
	"reviewer_user_id" text,
	"status" text NOT NULL,
	"decision_note" text,
	"review_summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"category" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"requested_by_agent_id" uuid,
	"requested_by_user_id" text,
	"requested_from_issue_id" uuid,
	"linked_issue_id" uuid,
	"linked_approval_id" uuid,
	"primary_reviewer_role" text NOT NULL,
	"secondary_reviewer_role" text,
	"final_approver_role" text NOT NULL,
	"board_approval_required" boolean DEFAULT false NOT NULL,
	"execution_target" text DEFAULT 'issue' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"route_rule_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"due_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_route_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"category" text NOT NULL,
	"primary_reviewer_role" text NOT NULL,
	"secondary_reviewer_role" text,
	"final_approver_role" text NOT NULL,
	"board_approval_required" boolean DEFAULT false NOT NULL,
	"execution_target" text DEFAULT 'issue' NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workflow_case_artifacts" ADD CONSTRAINT "workflow_case_artifacts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_case_artifacts" ADD CONSTRAINT "workflow_case_artifacts_workflow_case_id_workflow_cases_id_fk" FOREIGN KEY ("workflow_case_id") REFERENCES "public"."workflow_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_case_artifacts" ADD CONSTRAINT "workflow_case_artifacts_author_agent_id_agents_id_fk" FOREIGN KEY ("author_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_case_reviews" ADD CONSTRAINT "workflow_case_reviews_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_case_reviews" ADD CONSTRAINT "workflow_case_reviews_workflow_case_id_workflow_cases_id_fk" FOREIGN KEY ("workflow_case_id") REFERENCES "public"."workflow_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_case_reviews" ADD CONSTRAINT "workflow_case_reviews_artifact_id_workflow_case_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."workflow_case_artifacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_case_reviews" ADD CONSTRAINT "workflow_case_reviews_reviewer_agent_id_agents_id_fk" FOREIGN KEY ("reviewer_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_cases" ADD CONSTRAINT "workflow_cases_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_cases" ADD CONSTRAINT "workflow_cases_requested_by_agent_id_agents_id_fk" FOREIGN KEY ("requested_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_cases" ADD CONSTRAINT "workflow_cases_requested_from_issue_id_issues_id_fk" FOREIGN KEY ("requested_from_issue_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_cases" ADD CONSTRAINT "workflow_cases_linked_issue_id_issues_id_fk" FOREIGN KEY ("linked_issue_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_cases" ADD CONSTRAINT "workflow_cases_linked_approval_id_approvals_id_fk" FOREIGN KEY ("linked_approval_id") REFERENCES "public"."approvals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_route_rules" ADD CONSTRAINT "workflow_route_rules_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_case_artifacts_case_version_uq" ON "workflow_case_artifacts" USING btree ("workflow_case_id","version");--> statement-breakpoint
CREATE INDEX "workflow_case_artifacts_company_case_version_idx" ON "workflow_case_artifacts" USING btree ("company_id","workflow_case_id","version");--> statement-breakpoint
CREATE INDEX "workflow_case_artifacts_company_author_idx" ON "workflow_case_artifacts" USING btree ("company_id","author_agent_id","created_at");--> statement-breakpoint
CREATE INDEX "workflow_case_reviews_company_case_created_idx" ON "workflow_case_reviews" USING btree ("company_id","workflow_case_id","created_at");--> statement-breakpoint
CREATE INDEX "workflow_case_reviews_company_role_status_idx" ON "workflow_case_reviews" USING btree ("company_id","reviewer_role","status");--> statement-breakpoint
CREATE INDEX "workflow_cases_company_status_category_idx" ON "workflow_cases" USING btree ("company_id","status","category");--> statement-breakpoint
CREATE INDEX "workflow_cases_company_requested_by_agent_idx" ON "workflow_cases" USING btree ("company_id","requested_by_agent_id","status");--> statement-breakpoint
CREATE INDEX "workflow_cases_company_linked_issue_idx" ON "workflow_cases" USING btree ("company_id","linked_issue_id");--> statement-breakpoint
CREATE INDEX "workflow_cases_company_linked_approval_idx" ON "workflow_cases" USING btree ("company_id","linked_approval_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_route_rules_company_category_uq" ON "workflow_route_rules" USING btree ("company_id","category");--> statement-breakpoint
CREATE INDEX "workflow_route_rules_company_enabled_category_idx" ON "workflow_route_rules" USING btree ("company_id","is_enabled","category");