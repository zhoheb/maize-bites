ALTER TYPE "public"."audience" ADD VALUE 'unknown';--> statement-breakpoint
ALTER TYPE "public"."report_kind" ADD VALUE 'wrong_audience';--> statement-breakpoint
ALTER TABLE "classifications" ADD COLUMN "audience_evidence" text;