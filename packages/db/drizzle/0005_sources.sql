ALTER TYPE "public"."event_source" ADD VALUE 'maizepages' BEFORE 'submission';--> statement-breakpoint
CREATE TABLE "http_cache" (
	"url" text PRIMARY KEY NOT NULL,
	"etag" text,
	"last_modified" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "ingestion_runs_started_at_idx";--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "maizepages_event_id" text;--> statement-breakpoint
-- Every run before this migration was a Happening run.
ALTER TABLE "ingestion_runs" ADD COLUMN "source" "event_source" DEFAULT 'happening' NOT NULL;--> statement-breakpoint
ALTER TABLE "ingestion_runs" ALTER COLUMN "source" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "ingestion_runs" ADD COLUMN "not_modified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ingestion_runs" ADD COLUMN "skipped_duplicates" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ingestion_runs" ADD COLUMN "ttl_minutes" integer;--> statement-breakpoint
CREATE INDEX "events_maizepages_event_id_idx" ON "events" USING btree ("maizepages_event_id");--> statement-breakpoint
CREATE INDEX "ingestion_runs_started_at_idx" ON "ingestion_runs" USING btree ("source","started_at");--> statement-breakpoint
-- Happening rows already ingested keep their Maize Pages origin in the raw payload.
UPDATE "events" SET "maizepages_event_id" = "raw"->'maizepages_import'->>'maizepages_event_id'
WHERE "source" = 'happening' AND "raw"->'maizepages_import'->>'maizepages_event_id' IS NOT NULL;