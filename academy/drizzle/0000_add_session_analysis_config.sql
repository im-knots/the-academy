CREATE TYPE "public"."experiment_run_status" AS ENUM('running', 'paused', 'completed', 'failed', 'stopped');--> statement-breakpoint
CREATE TYPE "public"."experiment_status" AS ENUM('pending', 'running', 'paused', 'completed', 'failed', 'stopped');--> statement-breakpoint
CREATE TYPE "public"."participant_status" AS ENUM('idle', 'active', 'thinking', 'error');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('active', 'inactive', 'paused', 'completed');--> statement-breakpoint
CREATE TABLE "analysis_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"message_count_at_analysis" integer NOT NULL,
	"participant_count_at_analysis" integer NOT NULL,
	"provider" text NOT NULL,
	"conversation_phase" text NOT NULL,
	"analysis" jsonb NOT NULL,
	"conversation_context" jsonb NOT NULL,
	"analysis_type" text DEFAULT 'full',
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_errors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"provider" text NOT NULL,
	"operation" text NOT NULL,
	"attempt" integer NOT NULL,
	"max_attempts" integer NOT NULL,
	"error" text NOT NULL,
	"session_id" text,
	"participant_id" text
);
--> statement-breakpoint
CREATE TABLE "experiment_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experiment_id" uuid NOT NULL,
	"status" "experiment_run_status" NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"total_sessions" integer NOT NULL,
	"completed_sessions" integer DEFAULT 0 NOT NULL,
	"failed_sessions" integer DEFAULT 0 NOT NULL,
	"average_message_count" integer DEFAULT 0 NOT NULL,
	"results" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"session_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "experiments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"config" jsonb NOT NULL,
	"status" "experiment_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"participant_id" text NOT NULL,
	"participant_name" text NOT NULL,
	"participant_type" text NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"status" "participant_status" DEFAULT 'active' NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"characteristics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"system_prompt" text DEFAULT '' NOT NULL,
	"avatar" text,
	"color" text,
	"last_active" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" "session_status" DEFAULT 'active' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"moderator_settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"analysis_provider" text DEFAULT 'claude' NOT NULL,
	"analysis_model" text DEFAULT 'claude-sonnet-4-5-20250929' NOT NULL,
	"analysis_message_window" integer DEFAULT 10 NOT NULL,
	"analysis_custom_prompt" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analysis_snapshots" ADD CONSTRAINT "analysis_snapshots_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_runs" ADD CONSTRAINT "experiment_runs_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analysis_snapshots_session_id_idx" ON "analysis_snapshots" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "analysis_snapshots_timestamp_idx" ON "analysis_snapshots" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "analysis_snapshots_provider_idx" ON "analysis_snapshots" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "api_errors_timestamp_idx" ON "api_errors" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "api_errors_session_id_idx" ON "api_errors" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "api_errors_provider_idx" ON "api_errors" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "experiment_runs_experiment_id_idx" ON "experiment_runs" USING btree ("experiment_id");--> statement-breakpoint
CREATE INDEX "experiment_runs_status_idx" ON "experiment_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "experiments_status_idx" ON "experiments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "messages_session_id_idx" ON "messages" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "messages_timestamp_idx" ON "messages" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "participants_session_id_idx" ON "participants" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "sessions_status_idx" ON "sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sessions_updated_at_idx" ON "sessions" USING btree ("updated_at");