CREATE TYPE "public"."attendance_status" AS ENUM('present', 'absent', 'late', 'excused');--> statement-breakpoint
CREATE TABLE "attendance_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"register_id" uuid NOT NULL,
	"learner_id" uuid NOT NULL,
	"date" date NOT NULL,
	"status" "attendance_status" NOT NULL,
	"reason" text,
	"guardians_notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_registers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"class_group_id" uuid NOT NULL,
	"date" date NOT NULL,
	"taken_by_staff_id" uuid,
	"taken_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_register_id_attendance_registers_id_fk" FOREIGN KEY ("register_id") REFERENCES "public"."attendance_registers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_registers" ADD CONSTRAINT "attendance_registers_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_registers" ADD CONSTRAINT "attendance_registers_class_group_id_class_groups_id_fk" FOREIGN KEY ("class_group_id") REFERENCES "public"."class_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_registers" ADD CONSTRAINT "attendance_registers_taken_by_staff_id_staff_id_fk" FOREIGN KEY ("taken_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_records_learner_date_uq" ON "attendance_records" USING btree ("learner_id","date");--> statement-breakpoint
CREATE INDEX "attendance_records_register_idx" ON "attendance_records" USING btree ("register_id");--> statement-breakpoint
CREATE INDEX "attendance_records_school_date_idx" ON "attendance_records" USING btree ("school_id","date");--> statement-breakpoint
CREATE INDEX "attendance_records_absent_idx" ON "attendance_records" USING btree ("school_id","learner_id","date") WHERE "attendance_records"."status" <> 'present';--> statement-breakpoint
CREATE INDEX "attendance_records_school_updated_idx" ON "attendance_records" USING btree ("school_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_registers_class_date_uq" ON "attendance_registers" USING btree ("class_group_id","date");--> statement-breakpoint
CREATE INDEX "attendance_registers_school_date_idx" ON "attendance_registers" USING btree ("school_id","date");--> statement-breakpoint
CREATE INDEX "attendance_registers_school_updated_idx" ON "attendance_registers" USING btree ("school_id","updated_at");