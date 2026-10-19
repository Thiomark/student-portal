import { sql } from "drizzle-orm";
import { index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, date } from "drizzle-orm/pg-core";
import { deletedAt, id, timestamps } from "./_columns";
import { schoolRef } from "./_school";
import { academicYears, grades, learners, staff } from "./people";

export const subjects = pgTable(
  "subjects",
  {
    id: id(),
    schoolId: schoolRef(),
    name: text("name").notNull(),
    code: text("code"),
    ...timestamps,
    deletedAt: deletedAt(),
  },
  (t) => [uniqueIndex("subjects_name_uq").on(t.schoolId, t.name)],
);

// A book the school stocks, e.g. "Platinum Mathematics Grade 8".
export const textbookTitles = pgTable(
  "textbook_titles",
  {
    id: id(),
    schoolId: schoolRef(),
    title: text("title").notNull(),
    subjectId: uuid("subject_id").references(() => subjects.id, { onDelete: "set null" }),
    gradeId: uuid("grade_id").references(() => grades.id, { onDelete: "set null" }),
    isbn: text("isbn"),
    publisher: text("publisher"),
    edition: text("edition"),
    ...timestamps,
    deletedAt: deletedAt(),
  },
  (t) => [index("textbook_titles_school_idx").on(t.schoolId, t.title)],
);

export const bookCondition = pgEnum("book_condition", ["new", "good", "fair", "poor", "damaged"]);

// One physical book, identified by the number written or stuck inside it.
export const textbookCopies = pgTable(
  "textbook_copies",
  {
    id: id(),
    schoolId: schoolRef(),
    titleId: uuid("title_id")
      .notNull()
      .references(() => textbookTitles.id),
    copyNumber: text("copy_number").notNull(),
    condition: bookCondition("condition").notNull().default("good"),
    status: text("status", { enum: ["available", "issued", "lost", "written_off"] })
      .notNull()
      .default("available"),
    acquiredOn: date("acquired_on"),
    notes: text("notes"),
    ...timestamps,
    deletedAt: deletedAt(),
  },
  (t) => [
    // The number on the book is unique within the school, so the issuing desk
    // can type it without picking a title first.
    uniqueIndex("textbook_copies_number_uq").on(t.schoolId, sql`upper(${t.copyNumber})`),
    index("textbook_copies_title_idx").on(t.titleId),
  ],
);

// Handing a copy to a learner, and getting it back.
export const textbookLoans = pgTable(
  "textbook_loans",
  {
    id: id(),
    schoolId: schoolRef(),
    copyId: uuid("copy_id")
      .notNull()
      .references(() => textbookCopies.id),
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => learners.id),
    academicYearId: uuid("academic_year_id").references(() => academicYears.id),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    issuedByStaffId: uuid("issued_by_staff_id").references(() => staff.id),
    conditionOut: bookCondition("condition_out").notNull(),
    dueOn: date("due_on"),
    returnedAt: timestamp("returned_at", { withTimezone: true }),
    receivedByStaffId: uuid("received_by_staff_id").references(() => staff.id),
    conditionIn: bookCondition("condition_in"),
    outcome: text("outcome", { enum: ["returned", "lost", "damaged"] }),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    // A copy can only be out with one learner at a time.
    uniqueIndex("textbook_loans_open_copy_uq").on(t.copyId).where(sql`${t.returnedAt} is null`),
    index("textbook_loans_learner_idx").on(t.learnerId, t.issuedAt),
    index("textbook_loans_school_updated_idx").on(t.schoolId, t.updatedAt),
  ],
);
