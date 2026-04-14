CREATE TABLE "agent_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"thread_id" uuid,
	"sender_agent_id" uuid NOT NULL,
	"recipient_agent_id" uuid NOT NULL,
	"message_type" text DEFAULT 'direct' NOT NULL,
	"body" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "adapter_defaults" jsonb;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "source_message_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_thread_id_agent_messages_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."agent_messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_sender_agent_id_agents_id_fk" FOREIGN KEY ("sender_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_recipient_agent_id_agents_id_fk" FOREIGN KEY ("recipient_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_messages_recipient_idx" ON "agent_messages" USING btree ("company_id","recipient_agent_id","status","created_at");--> statement-breakpoint
CREATE INDEX "agent_messages_sender_idx" ON "agent_messages" USING btree ("company_id","sender_agent_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_messages_thread_idx" ON "agent_messages" USING btree ("thread_id","created_at");--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_source_message_id_agent_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."agent_messages"("id") ON DELETE set null ON UPDATE no action;