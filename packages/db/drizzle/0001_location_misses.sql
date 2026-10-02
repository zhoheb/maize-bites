CREATE TABLE "location_misses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"normalized_name" text NOT NULL,
	"location_name" text NOT NULL,
	"seen_count" integer DEFAULT 0 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "location_misses_normalized_name_unique" UNIQUE("normalized_name")
);
--> statement-breakpoint
ALTER TABLE "ingestion_runs" ADD COLUMN "removed" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ingestion_runs" ADD COLUMN "complete" boolean DEFAULT false NOT NULL;