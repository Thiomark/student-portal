import { sql } from "drizzle-orm";
import { date, index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./_columns";
import { schoolRef } from "./_school";
import { classGroups, learners, staff } from "./people";

// One register per class per school day. Its existence means "the register
// was taken", even when everyone was present, so the office can see which
// classes haven't done theirs.
export const attendanceRegisters = pgTable(
  "attendance_registers",
  {
    id: id(),
    schoolId: schoolRef(),
    classGroupId: uuid("class_group_id")
      .notNull()
      .references(() => classGroups.id),
    // The school day, in the school's timezone.
    date: date("date").notNull(),
    takenByStaffId: uuid("taken_by_staff_id").references(() => staff.id),
    // When the teacher pressed submit (on their device, possibly offline).
    takenAt: timestamp("taken_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("attendance_registers_class_date_uq").on(t.classGroupId, t.date),
    index("attendance_registers_school_date_idx").on(t.schoolId, t.date),
    index("attendance_registers_school_updated_idx").on(t.schoolId, t.updatedAt),
  ],
);

export const attendanceStatus = pgEnum("attendance_status", ["present", "absent", "late", "excused"]);

// A learner's mark for a day. Retaking a register overwrites the marks.
export const attendanceRecords = pgTable(
  "attendance_records",
  {
    id: id(),
    schoolId: schoolRef(),
    registerId: uuid("register_id")
      .notNull()
      .references(() => attendanceRegisters.id, { onDelete: "cascade" }),
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => learners.id),
    date: date("date").notNull(),
    status: attendanceStatus("status").notNull(),
    reason: text("reason"),
    // Set once parents have been told about an absence, so a corrected
    // register doesn't message them twice.
    guardiansNotifiedAt: timestamp("guardians_notified_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("attendance_records_learner_date_uq").on(t.learnerId, t.date),
    index("attendance_records_register_idx").on(t.registerId),
    index("attendance_records_school_date_idx").on(t.schoolId, t.date),
    index("attendance_records_absent_idx")
      .on(t.schoolId, t.learnerId, t.date)
      .where(sql`${t.status} <> 'present'`),
    index("attendance_records_school_updated_idx").on(t.schoolId, t.updatedAt),
  ],
);
