CREATE TYPE "public"."device_class" AS ENUM('mobile', 'desktop');--> statement-breakpoint
CREATE TABLE "analytics_daily" (
	"day" date PRIMARY KEY NOT NULL,
	"unique_visitors" integer NOT NULL,
	"page_views" integer NOT NULL,
	"signed_in_visitors" integer NOT NULL,
	"event_visitors" integer NOT NULL,
	"top_paths" jsonb NOT NULL,
	"top_referrers" jsonb NOT NULL,
	"mobile_share" double precision NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_salts" (
	"day" date PRIMARY KEY NOT NULL,
	"salt" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day" date NOT NULL,
	"visitor_id" text NOT NULL,
	"path" text NOT NULL,
	"referrer_host" text,
	"device" "device_class" NOT NULL,
	"is_signed_in" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "exclude_from_analytics" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX "page_views_day_idx" ON "page_views" USING btree ("day");--> statement-breakpoint
CREATE INDEX "page_views_day_visitor_idx" ON "page_views" USING btree ("day","visitor_id");