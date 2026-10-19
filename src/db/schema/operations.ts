import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  date,
} from "drizzle-orm/pg-core";
import { deletedAt, id, timestamps } from "./_columns";
import { schoolRef } from "./_school";
import { contactChannel, grades, guardians, learners, staff } from "./people";
import { users } from "./tenancy";

// ── Parent meetings ──────────────────────────────────────────────────────────

export const meetings = pgTable(
  "meetings",
  {
    id: id(),
    schoolId: schoolRef(),
    learnerId: uuid("learner_id").references(() => learners.id),
    title: text("title").notNull(),
    purpose: text("purpose"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    durationMinutes: integer("duration_minutes").notNull().default(30),
    location: text("location"),
    mode: text("mode", { enum: ["in_person", "phone", "video"] }).notNull().default("in_person"),
    status: text("status", { enum: ["scheduled", "completed", "cancelled", "no_show"] })
      .notNull()
      .default("scheduled"),
    organiserStaffId: uuid("organiser_staff_id").references(() => staff.id),
    // Minutes of what was discussed and agreed.
    minutes: text("minutes"),
    ...timestamps,
    deletedAt: deletedAt(),
  },
  (t) => [
    index("meetings_school_when_idx").on(t.schoolId, t.scheduledAt),
    index("meetings_learner_idx").on(t.learnerId),
  ],
);

export const meetingAttendees = pgTable(
  "meeting_attendees",
  {
    id: id(),
    schoolId: schoolRef(),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    guardianId: uuid("guardian_id").references(() => guardians.id),
    staffId: uuid("staff_id").references(() => staff.id),
    response: text("response", { enum: ["pending", "accepted", "declined"] })
      .notNull()
      .default("pending"),
    attended: boolean("attended"),
    ...timestamps,
  },
  (t) => [index("meeting_attendees_meeting_idx").on(t.meetingId)],
);

// ── Messages to guardians ────────────────────────────────────────────────────

// Every notice sent, or that needs sending by hand. "letter" and "call" rows
// are work items for the office: print it, or phone the number.
export const messages = pgTable(
  "messages",
  {
    id: id(),
    schoolId: schoolRef(),
    guardianId: uuid("guardian_id").references(() => guardians.id),
    channel: contactChannel("channel").notNull(),
    recipient: text("recipient"),
    subject: text("subject"),
    body: text("body").notNull(),
    status: text("status", {
      enum: ["queued", "sent", "delivered", "read", "failed", "needs_action", "done"],
    })
      .notNull()
      .default("queued"),
    provider: text("provider"),
    providerMessageId: text("provider_message_id"),
    error: text("error"),
    relatedType: text("related_type"),
    relatedId: uuid("related_id"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("messages_school_created_idx").on(t.schoolId, t.createdAt),
    index("messages_related_idx").on(t.relatedType, t.relatedId),
    index("messages_status_idx").on(t.schoolId, t.status),
  ],
);

// ── Learner incidents ────────────────────────────────────────────────────────

export const incidents = pgTable(
  "incidents",
  {
    id: id(),
    schoolId: schoolRef(),
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => learners.id),
    reportedByStaffId: uuid("reported_by_staff_id").references(() => staff.id),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    category: text("category", {
      enum: ["behaviour", "bullying", "injury", "health", "academic", "uniform", "attendance", "property", "other"],
    }).notNull(),
    severity: text("severity", { enum: ["low", "medium", "high"] }).notNull().default("low"),
    description: text("description").notNull(),
    actionTaken: text("action_taken"),
    status: text("status", { enum: ["open", "resolved"] }).notNull().default("open"),
    guardianNotifiedAt: timestamp("guardian_notified_at", { withTimezone: true }),
    ...timestamps,
    deletedAt: deletedAt(),
  },
  (t) => [
    index("incidents_school_when_idx").on(t.schoolId, t.occurredAt),
    index("incidents_learner_idx").on(t.learnerId, t.occurredAt),
  ],
);

// ── School trips ─────────────────────────────────────────────────────────────

export const trips = pgTable(
  "trips",
  {
    id: id(),
    schoolId: schoolRef(),
    title: text("title").notNull(),
    destination: text("destination"),
    departsAt: timestamp("departs_at", { withTimezone: true }).notNull(),
    returnsAt: timestamp("returns_at", { withTimezone: true }),
    // Money is stored in cents to avoid float rounding.
    costCents: integer("cost_cents").notNull().default(0),
    paymentDueOn: date("payment_due_on"),
    status: text("status", { enum: ["planned", "confirmed", "completed", "cancelled"] })
      .notNull()
      .default("planned"),
    notes: text("notes"),
    organiserStaffId: uuid("organiser_staff_id").references(() => staff.id),
    ...timestamps,
    deletedAt: deletedAt(),
  },
  (t) => [index("trips_school_when_idx").on(t.schoolId, t.departsAt)],
);

export const tripGrades = pgTable(
  "trip_grades",
  {
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    gradeId: uuid("grade_id")
      .notNull()
      .references(() => grades.id),
  },
  (t) => [primaryKey({ columns: [t.tripId, t.gradeId] })],
);

export const tripParticipants = pgTable(
  "trip_participants",
  {
    id: id(),
    schoolId: schoolRef(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => learners.id),
    consent: text("consent", { enum: ["pending", "given", "declined"] }).notNull().default("pending"),
    consentGuardianId: uuid("consent_guardian_id").references(() => guardians.id),
    attended: boolean("attended"),
    ...timestamps,
  },
  (t) => [uniqueIndex("trip_participants_uq").on(t.tripId, t.learnerId)],
);

export const tripPayments = pgTable(
  "trip_payments",
  {
    id: id(),
    schoolId: schoolRef(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => learners.id),
    amountCents: integer("amount_cents").notNull(),
    method: text("method", { enum: ["cash", "eft", "card", "other"] }).notNull(),
    reference: text("reference"),
    receivedByStaffId: uuid("received_by_staff_id").references(() => staff.id),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
    // Payments are never edited or deleted; a mistake is reversed with a
    // negative entry that points at the original.
    reversesPaymentId: uuid("reverses_payment_id"),
    ...timestamps,
  },
  (t) => [index("trip_payments_trip_learner_idx").on(t.tripId, t.learnerId)],
);

// ── Facilities maintenance ───────────────────────────────────────────────────

export const maintenanceRequests = pgTable(
  "maintenance_requests",
  {
    id: id(),
    schoolId: schoolRef(),
    title: text("title").notNull(),
    description: text("description"),
    location: text("location"),
    category: text("category", {
      enum: ["electrical", "plumbing", "building", "furniture", "it", "grounds", "security", "other"],
    }).notNull(),
    priority: text("priority", { enum: ["low", "normal", "urgent"] }).notNull().default("normal"),
    status: text("status", { enum: ["open", "in_progress", "done", "cancelled"] })
      .notNull()
      .default("open"),
    reportedByUserId: uuid("reported_by_user_id").references(() => users.id),
    assignedTo: text("assigned_to"),
    vendor: text("vendor"),
    costCents: integer("cost_cents"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
    deletedAt: deletedAt(),
  },
  (t) => [index("maintenance_school_status_idx").on(t.schoolId, t.status, t.createdAt)],
);

// ── Offline sync bookkeeping ─────────────────────────────────────────────────

// Each mutation a device pushes carries a client id. Recording it makes the
// push idempotent: a device that lost the response can safely resend.
export const syncMutations = pgTable(
  "sync_mutations",
  {
    clientMutationId: uuid("client_mutation_id").primaryKey(),
    schoolId: schoolRef(),
    userId: uuid("user_id").references(() => users.id),
    deviceId: text("device_id").notNull(),
    kind: text("kind").notNull(),
    result: jsonb("result").$type<Record<string, unknown>>(),
    createdAt: timestamps.createdAt,
  },
  (t) => [index("sync_mutations_school_idx").on(t.schoolId, t.createdAt)],
);
