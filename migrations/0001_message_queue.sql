ALTER TABLE "messages" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "next_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "delivered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "status_checked_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "messages_queue_idx" ON "messages" USING btree ("next_attempt_at") WHERE "messages"."status" = 'queued';--> statement-breakpoint
CREATE INDEX "messages_tracking_idx" ON "messages" USING btree ("sent_at") WHERE "messages"."status" in ('sent', 'delivered');