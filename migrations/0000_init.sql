CREATE TYPE "public"."membership_role" AS ENUM('owner', 'admin', 'staff');--> statement-breakpoint
CREATE TYPE "public"."contact_channel" AS ENUM('whatsapp', 'sms', 'call', 'email', 'letter');--> statement-breakpoint
CREATE TYPE "public"."learner_status" AS ENUM('active', 'transferred', 'graduated', 'left');--> statement-breakpoint
CREATE TYPE "public"."book_condition" AS ENUM('new', 'good', 'fair', 'poor', 'damaged');--> statement-breakpoint
CREATE TABLE "activity_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"actor_name" text,
	"actor_role" text,
	"action" text NOT NULL,
	"area" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"subject" text,
	"changes" jsonb,
	"meta" jsonb,
	"device_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "membership_role" NOT NULL,
	"permissions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"staff_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"invited_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"role" "membership_role" NOT NULL,
	"permissions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"staff_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"granted_by" uuid,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_admins" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school_secrets" (
	"school_id" uuid PRIMARY KEY NOT NULL,
	"whaple_api_key" text,
	"resend_api_key" text,
	"resend_from_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schools" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"registration_number" text,
	"phone" text,
	"email" text,
	"address" text,
	"timezone" text DEFAULT 'Africa/Johannesburg' NOT NULL,
	"currency" text DEFAULT 'ZAR' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schools_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"clerk_user_id" text NOT NULL,
	"email" text,
	"phone" text,
	"name" text,
	"image_url" text,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_clerk_user_id_unique" UNIQUE("clerk_user_id")
);
--> statement-breakpoint
CREATE TABLE "academic_years" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "class_groups" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"grade_id" uuid NOT NULL,
	"name" text NOT NULL,
	"teacher_id" uuid,
	"room" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "enrolments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"learner_id" uuid NOT NULL,
	"class_group_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"started_on" date DEFAULT now() NOT NULL,
	"ended_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grades" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "guardian_contacts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"guardian_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"value" text NOT NULL,
	"label" text,
	"whatsapp" boolean DEFAULT false NOT NULL,
	"sms" boolean DEFAULT false NOT NULL,
	"voice" boolean DEFAULT false NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "guardians" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"user_id" uuid,
	"title" text,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"id_number" text,
	"occupation" text,
	"address" text,
	"preferred_channel" "contact_channel",
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "learner_guardians" (
	"school_id" uuid NOT NULL,
	"learner_id" uuid NOT NULL,
	"guardian_id" uuid NOT NULL,
	"relationship" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"lives_with" boolean DEFAULT true NOT NULL,
	"can_collect" boolean DEFAULT true NOT NULL,
	"receives_notices" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learner_guardians_learner_id_guardian_id_pk" PRIMARY KEY("learner_id","guardian_id")
);
--> statement-breakpoint
CREATE TABLE "learners" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"admission_number" text,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"preferred_name" text,
	"date_of_birth" date,
	"gender" text,
	"id_number" text,
	"home_language" text,
	"medical_notes" text,
	"notes" text,
	"status" "learner_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"user_id" uuid,
	"staff_number" text,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"title" text,
	"position" text,
	"phone" text,
	"email" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "textbook_copies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"title_id" uuid NOT NULL,
	"copy_number" text NOT NULL,
	"condition" "book_condition" DEFAULT 'good' NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	"acquired_on" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "textbook_loans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"copy_id" uuid NOT NULL,
	"learner_id" uuid NOT NULL,
	"academic_year_id" uuid,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"issued_by_staff_id" uuid,
	"condition_out" "book_condition" NOT NULL,
	"due_on" date,
	"returned_at" timestamp with time zone,
	"received_by_staff_id" uuid,
	"condition_in" "book_condition",
	"outcome" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "textbook_titles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"title" text NOT NULL,
	"subject_id" uuid,
	"grade_id" uuid,
	"isbn" text,
	"publisher" text,
	"edition" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"learner_id" uuid NOT NULL,
	"reported_by_staff_id" uuid,
	"occurred_at" timestamp with time zone NOT NULL,
	"category" text NOT NULL,
	"severity" text DEFAULT 'low' NOT NULL,
	"description" text NOT NULL,
	"action_taken" text,
	"status" text DEFAULT 'open' NOT NULL,
	"guardian_notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "maintenance_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"location" text,
	"category" text NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"reported_by_user_id" uuid,
	"assigned_to" text,
	"vendor" text,
	"cost_cents" integer,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "meeting_attendees" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"meeting_id" uuid NOT NULL,
	"guardian_id" uuid,
	"staff_id" uuid,
	"response" text DEFAULT 'pending' NOT NULL,
	"attended" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"learner_id" uuid,
	"title" text NOT NULL,
	"purpose" text,
	"scheduled_at" timestamp with time zone NOT NULL,
	"duration_minutes" integer DEFAULT 30 NOT NULL,
	"location" text,
	"mode" text DEFAULT 'in_person' NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"organiser_staff_id" uuid,
	"minutes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"guardian_id" uuid,
	"channel" "contact_channel" NOT NULL,
	"recipient" text,
	"subject" text,
	"body" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"provider" text,
	"provider_message_id" text,
	"error" text,
	"related_type" text,
	"related_id" uuid,
	"created_by_user_id" uuid,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_mutations" (
	"client_mutation_id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"user_id" uuid,
	"device_id" text NOT NULL,
	"kind" text NOT NULL,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_grades" (
	"trip_id" uuid NOT NULL,
	"grade_id" uuid NOT NULL,
	CONSTRAINT "trip_grades_trip_id_grade_id_pk" PRIMARY KEY("trip_id","grade_id")
);
--> statement-breakpoint
CREATE TABLE "trip_participants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"learner_id" uuid NOT NULL,
	"consent" text DEFAULT 'pending' NOT NULL,
	"consent_guardian_id" uuid,
	"attended" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"learner_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"method" text NOT NULL,
	"reference" text,
	"received_by_staff_id" uuid,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reverses_payment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"title" text NOT NULL,
	"destination" text,
	"departs_at" timestamp with time zone NOT NULL,
	"returns_at" timestamp with time zone,
	"cost_cents" integer DEFAULT 0 NOT NULL,
	"payment_due_on" date,
	"status" text DEFAULT 'planned' NOT NULL,
	"notes" text,
	"organiser_staff_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_admins" ADD CONSTRAINT "platform_admins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_secrets" ADD CONSTRAINT "school_secrets_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_groups" ADD CONSTRAINT "class_groups_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_groups" ADD CONSTRAINT "class_groups_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_groups" ADD CONSTRAINT "class_groups_grade_id_grades_id_fk" FOREIGN KEY ("grade_id") REFERENCES "public"."grades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_groups" ADD CONSTRAINT "class_groups_teacher_id_staff_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrolments" ADD CONSTRAINT "enrolments_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrolments" ADD CONSTRAINT "enrolments_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrolments" ADD CONSTRAINT "enrolments_class_group_id_class_groups_id_fk" FOREIGN KEY ("class_group_id") REFERENCES "public"."class_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrolments" ADD CONSTRAINT "enrolments_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grades" ADD CONSTRAINT "grades_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_contacts" ADD CONSTRAINT "guardian_contacts_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_contacts" ADD CONSTRAINT "guardian_contacts_guardian_id_guardians_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."guardians"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_guardians" ADD CONSTRAINT "learner_guardians_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_guardians" ADD CONSTRAINT "learner_guardians_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_guardians" ADD CONSTRAINT "learner_guardians_guardian_id_guardians_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."guardians"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learners" ADD CONSTRAINT "learners_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "textbook_copies" ADD CONSTRAINT "textbook_copies_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "textbook_copies" ADD CONSTRAINT "textbook_copies_title_id_textbook_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."textbook_titles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "textbook_loans" ADD CONSTRAINT "textbook_loans_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "textbook_loans" ADD CONSTRAINT "textbook_loans_copy_id_textbook_copies_id_fk" FOREIGN KEY ("copy_id") REFERENCES "public"."textbook_copies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "textbook_loans" ADD CONSTRAINT "textbook_loans_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "textbook_loans" ADD CONSTRAINT "textbook_loans_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "textbook_loans" ADD CONSTRAINT "textbook_loans_issued_by_staff_id_staff_id_fk" FOREIGN KEY ("issued_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "textbook_loans" ADD CONSTRAINT "textbook_loans_received_by_staff_id_staff_id_fk" FOREIGN KEY ("received_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "textbook_titles" ADD CONSTRAINT "textbook_titles_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "textbook_titles" ADD CONSTRAINT "textbook_titles_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "textbook_titles" ADD CONSTRAINT "textbook_titles_grade_id_grades_id_fk" FOREIGN KEY ("grade_id") REFERENCES "public"."grades"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_reported_by_staff_id_staff_id_fk" FOREIGN KEY ("reported_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_reported_by_user_id_users_id_fk" FOREIGN KEY ("reported_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_attendees" ADD CONSTRAINT "meeting_attendees_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_attendees" ADD CONSTRAINT "meeting_attendees_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_attendees" ADD CONSTRAINT "meeting_attendees_guardian_id_guardians_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."guardians"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_attendees" ADD CONSTRAINT "meeting_attendees_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_organiser_staff_id_staff_id_fk" FOREIGN KEY ("organiser_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_guardian_id_guardians_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."guardians"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_mutations" ADD CONSTRAINT "sync_mutations_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_mutations" ADD CONSTRAINT "sync_mutations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_grades" ADD CONSTRAINT "trip_grades_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_grades" ADD CONSTRAINT "trip_grades_grade_id_grades_id_fk" FOREIGN KEY ("grade_id") REFERENCES "public"."grades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_participants" ADD CONSTRAINT "trip_participants_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_participants" ADD CONSTRAINT "trip_participants_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_participants" ADD CONSTRAINT "trip_participants_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_participants" ADD CONSTRAINT "trip_participants_consent_guardian_id_guardians_id_fk" FOREIGN KEY ("consent_guardian_id") REFERENCES "public"."guardians"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_payments" ADD CONSTRAINT "trip_payments_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_payments" ADD CONSTRAINT "trip_payments_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_payments" ADD CONSTRAINT "trip_payments_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_payments" ADD CONSTRAINT "trip_payments_received_by_staff_id_staff_id_fk" FOREIGN KEY ("received_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_organiser_staff_id_staff_id_fk" FOREIGN KEY ("organiser_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_school_created_idx" ON "activity_events" USING btree ("school_id","created_at");--> statement-breakpoint
CREATE INDEX "activity_entity_idx" ON "activity_events" USING btree ("school_id","entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "activity_area_idx" ON "activity_events" USING btree ("school_id","area","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "invites_open_email_uq" ON "invites" USING btree ("school_id",lower("email")) WHERE "invites"."accepted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_user_school_uq" ON "memberships" USING btree ("user_id","school_id");--> statement-breakpoint
CREATE UNIQUE INDEX "academic_years_name_uq" ON "academic_years" USING btree ("school_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "academic_years_current_uq" ON "academic_years" USING btree ("school_id") WHERE "academic_years"."is_current";--> statement-breakpoint
CREATE UNIQUE INDEX "class_groups_name_uq" ON "class_groups" USING btree ("school_id","academic_year_id","name");--> statement-breakpoint
CREATE INDEX "enrolments_class_idx" ON "enrolments" USING btree ("class_group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "enrolments_open_uq" ON "enrolments" USING btree ("learner_id","academic_year_id") WHERE "enrolments"."ended_on" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "grades_name_uq" ON "grades" USING btree ("school_id","name");--> statement-breakpoint
CREATE INDEX "guardian_contacts_guardian_idx" ON "guardian_contacts" USING btree ("guardian_id");--> statement-breakpoint
CREATE INDEX "guardian_contacts_value_idx" ON "guardian_contacts" USING btree ("value");--> statement-breakpoint
CREATE INDEX "guardians_school_name_idx" ON "guardians" USING btree ("school_id","last_name","first_name");--> statement-breakpoint
CREATE INDEX "guardians_user_idx" ON "guardians" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "learner_guardians_guardian_idx" ON "learner_guardians" USING btree ("guardian_id");--> statement-breakpoint
CREATE INDEX "learners_school_name_idx" ON "learners" USING btree ("school_id","last_name","first_name");--> statement-breakpoint
CREATE INDEX "learners_school_updated_idx" ON "learners" USING btree ("school_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "learners_admission_uq" ON "learners" USING btree ("school_id","admission_number") WHERE "learners"."admission_number" is not null;--> statement-breakpoint
CREATE INDEX "staff_school_idx" ON "staff" USING btree ("school_id","last_name");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_number_uq" ON "staff" USING btree ("school_id","staff_number") WHERE "staff"."staff_number" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "subjects_name_uq" ON "subjects" USING btree ("school_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "textbook_copies_number_uq" ON "textbook_copies" USING btree ("school_id",upper("copy_number"));--> statement-breakpoint
CREATE INDEX "textbook_copies_title_idx" ON "textbook_copies" USING btree ("title_id");--> statement-breakpoint
CREATE UNIQUE INDEX "textbook_loans_open_copy_uq" ON "textbook_loans" USING btree ("copy_id") WHERE "textbook_loans"."returned_at" is null;--> statement-breakpoint
CREATE INDEX "textbook_loans_learner_idx" ON "textbook_loans" USING btree ("learner_id","issued_at");--> statement-breakpoint
CREATE INDEX "textbook_loans_school_updated_idx" ON "textbook_loans" USING btree ("school_id","updated_at");--> statement-breakpoint
CREATE INDEX "textbook_titles_school_idx" ON "textbook_titles" USING btree ("school_id","title");--> statement-breakpoint
CREATE INDEX "incidents_school_when_idx" ON "incidents" USING btree ("school_id","occurred_at");--> statement-breakpoint
CREATE INDEX "incidents_learner_idx" ON "incidents" USING btree ("learner_id","occurred_at");--> statement-breakpoint
CREATE INDEX "maintenance_school_status_idx" ON "maintenance_requests" USING btree ("school_id","status","created_at");--> statement-breakpoint
CREATE INDEX "meeting_attendees_meeting_idx" ON "meeting_attendees" USING btree ("meeting_id");--> statement-breakpoint
CREATE INDEX "meetings_school_when_idx" ON "meetings" USING btree ("school_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "meetings_learner_idx" ON "meetings" USING btree ("learner_id");--> statement-breakpoint
CREATE INDEX "messages_school_created_idx" ON "messages" USING btree ("school_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_related_idx" ON "messages" USING btree ("related_type","related_id");--> statement-breakpoint
CREATE INDEX "messages_status_idx" ON "messages" USING btree ("school_id","status");--> statement-breakpoint
CREATE INDEX "sync_mutations_school_idx" ON "sync_mutations" USING btree ("school_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "trip_participants_uq" ON "trip_participants" USING btree ("trip_id","learner_id");--> statement-breakpoint
CREATE INDEX "trip_payments_trip_learner_idx" ON "trip_payments" USING btree ("trip_id","learner_id");--> statement-breakpoint
CREATE INDEX "trips_school_when_idx" ON "trips" USING btree ("school_id","departs_at");