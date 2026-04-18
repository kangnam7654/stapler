ALTER TABLE "companies" ADD COLUMN "workspace_root_path" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "workspace_path_override" text;