CREATE TABLE "agent_team_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"role_in_team" text DEFAULT 'member' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'product_squad' NOT NULL,
	"parent_team_id" uuid,
	"lead_agent_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_team_memberships" ADD CONSTRAINT "agent_team_memberships_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_team_memberships" ADD CONSTRAINT "agent_team_memberships_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_team_memberships" ADD CONSTRAINT "agent_team_memberships_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_parent_team_id_teams_id_fk" FOREIGN KEY ("parent_team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_lead_agent_id_agents_id_fk" FOREIGN KEY ("lead_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_team_memberships_company_team_idx" ON "agent_team_memberships" USING btree ("company_id","team_id");--> statement-breakpoint
CREATE INDEX "agent_team_memberships_company_agent_idx" ON "agent_team_memberships" USING btree ("company_id","agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_team_memberships_agent_team_idx" ON "agent_team_memberships" USING btree ("agent_id","team_id");--> statement-breakpoint
CREATE INDEX "teams_company_status_idx" ON "teams" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "teams_company_parent_idx" ON "teams" USING btree ("company_id","parent_team_id");--> statement-breakpoint
CREATE INDEX "teams_company_lead_idx" ON "teams" USING btree ("company_id","lead_agent_id");