import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { deletedAt, id, timestamps } from "./_columns";
import { schoolRef } from "./_school";
import { users } from "./tenancy";

// Teachers and other employees. Tracked whether or not they ever sign in.
export const staff = pgTable(
  "staff",
  {
    id: id(),
    schoolId: schoolRef(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    staffNumber: text("staff_number"),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    title: text("title"),
    position: text("position"),
    phone: text("phone"),
    email: text("email"),
    status: text("status", { enum: ["active", "on_leave", "left"] }).notNull().default("active"),
    ...timestamps,
    deletedAt: deletedAt(),
  },
  (t) => [
    index("staff_school_idx").on(t.schoolId, t.lastName),
    uniqueIndex("staff_number_uq")
      .on(t.schoolId, t.staffNumber)
      .where(sql`${t.staffNumber} is not null`),
  ],
);

export const academicYears = pgTable(
  "academic_years",
  {
    id: id(),
    schoolId: schoolRef(),
    name: text("name").notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    isCurrent: boolean("is_current").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("academic_years_name_uq").on(t.schoolId, t.name),
    uniqueIndex("academic_years_current_uq").on(t.schoolId).where(sql`${t.isCurrent}`),
  ],
);

export const grades = pgTable(
  "grades",
  {
    id: id(),
    schoolId: schoolRef(),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
    deletedAt: deletedAt(),
  },
  (t) => [uniqueIndex("grades_name_uq").on(t.schoolId, t.name)],
);

// A class for one academic year, e.g. "8A" in 2027.
export const classGroups = pgTable(
  "class_groups",
  {
    id: id(),
    schoolId: schoolRef(),
    academicYearId: uuid("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    gradeId: uuid("grade_id")
      .notNull()
      .references(() => grades.id),
    name: text("name").notNull(),
    teacherId: uuid("teacher_id").references(() => staff.id, { onDelete: "set null" }),
    room: text("room"),
    ...timestamps,
    deletedAt: deletedAt(),
  },
  (t) => [uniqueIndex("class_groups_name_uq").on(t.schoolId, t.academicYearId, t.name)],
);

export const learnerStatus = pgEnum("learner_status", [
  "active",
  "transferred",
  "graduated",
  "left",
]);

export const learners = pgTable(
  "learners",
  {
    id: id(),
    schoolId: schoolRef(),
    admissionNumber: text("admission_number"),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    preferredName: text("preferred_name"),
    dateOfBirth: date("date_of_birth"),
    gender: text("gender", { enum: ["female", "male", "other"] }),
    idNumber: text("id_number"),
    homeLanguage: text("home_language"),
    // Allergies, chronic conditions and similar; visible to learners.view.
    medicalNotes: text("medical_notes"),
    notes: text("notes"),
    status: learnerStatus("status").notNull().default("active"),
    ...timestamps,
    deletedAt: deletedAt(),
  },
  (t) => [
    index("learners_school_name_idx").on(t.schoolId, t.lastName, t.firstName),
    index("learners_school_updated_idx").on(t.schoolId, t.updatedAt),
    uniqueIndex("learners_admission_uq")
      .on(t.schoolId, t.admissionNumber)
      .where(sql`${t.admissionNumber} is not null`),
  ],
);

// Which class a learner sits in for a year. Moving class closes one row and
// opens another, so the history stays.
export const enrolments = pgTable(
  "enrolments",
  {
    id: id(),
    schoolId: schoolRef(),
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => learners.id),
    classGroupId: uuid("class_group_id")
      .notNull()
      .references(() => classGroups.id),
    academicYearId: uuid("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    startedOn: date("started_on").notNull().defaultNow(),
    endedOn: date("ended_on"),
    ...timestamps,
  },
  (t) => [
    index("enrolments_class_idx").on(t.classGroupId),
    uniqueIndex("enrolments_open_uq")
      .on(t.learnerId, t.academicYearId)
      .where(sql`${t.endedOn} is null`),
  ],
);

export const contactChannel = pgEnum("contact_channel", [
  "whatsapp",
  "sms",
  "call",
  "email",
  // No phone, no email: the school sends a printed letter home with the learner.
  "letter",
]);

// Parents and guardians. Rows are per school; one person with children at two
// schools has two rows that share user_id once they sign in to the portal.
export const guardians = pgTable(
  "guardians",
  {
    id: id(),
    schoolId: schoolRef(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    title: text("title"),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    idNumber: text("id_number"),
    occupation: text("occupation"),
    address: text("address"),
    preferredChannel: contactChannel("preferred_channel"),
    notes: text("notes"),
    ...timestamps,
    deletedAt: deletedAt(),
  },
  (t) => [
    index("guardians_school_name_idx").on(t.schoolId, t.lastName, t.firstName),
    index("guardians_user_idx").on(t.userId),
  ],
);

// Each number records what it can do: a WhatsApp-only number, a landline that
// can only take calls, a cellphone that does all three.
export const guardianContacts = pgTable(
  "guardian_contacts",
  {
    id: id(),
    schoolId: schoolRef(),
    guardianId: uuid("guardian_id")
      .notNull()
      .references(() => guardians.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["phone", "email"] }).notNull(),
    // E.164 for phones (+27...), lower-cased for email.
    value: text("value").notNull(),
    label: text("label"),
    whatsapp: boolean("whatsapp").notNull().default(false),
    sms: boolean("sms").notNull().default(false),
    voice: boolean("voice").notNull().default(false),
    isPrimary: boolean("is_primary").notNull().default(false),
    ...timestamps,
    deletedAt: deletedAt(),
  },
  (t) => [
    index("guardian_contacts_guardian_idx").on(t.guardianId),
    index("guardian_contacts_value_idx").on(t.value),
  ],
);

export const learnerGuardians = pgTable(
  "learner_guardians",
  {
    schoolId: schoolRef(),
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => learners.id, { onDelete: "cascade" }),
    guardianId: uuid("guardian_id")
      .notNull()
      .references(() => guardians.id, { onDelete: "cascade" }),
    relationship: text("relationship", {
      enum: ["mother", "father", "guardian", "grandparent", "sibling", "foster_parent", "other"],
    }).notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    livesWith: boolean("lives_with").notNull().default(true),
    canCollect: boolean("can_collect").notNull().default(true),
    receivesNotices: boolean("receives_notices").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.learnerId, t.guardianId] }),
    index("learner_guardians_guardian_idx").on(t.guardianId),
  ],
);
