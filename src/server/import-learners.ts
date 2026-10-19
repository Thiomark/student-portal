import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import type { SchoolContext } from "@/lib/auth/context";
import { uuidv7 } from "@/lib/ids";
import { isLandline, type ImportedLearner, type ImportRow } from "@/lib/import/learners";
import { getCurrentYear, listCurrentClasses } from "./school-data";

const { learners, enrolments, guardians, guardianContacts, learnerGuardians } = schema;

export type ImportSummary = {
  learnersCreated: number;
  learnersUpdated: number;
  classesAssigned: number;
  parentsCreated: number;
  // Parents already on file (e.g. a sibling's), matched by phone or email.
  parentsReused: number;
  links: number;
  skipped: number;
  // Per-row notes from the import itself (unknown class names).
  notes: { line: number; message: string }[];
};

// Writes the valid rows. Matching rules:
// - a learner with an admission number already on file is updated, not
//   duplicated (blank cells keep what's there);
// - a parent whose phone or email is already on file (from any learner) is
//   reused, so siblings share one parent record;
// - a class name is matched against the current year's classes.
// Everything is written in bulk inside one transaction: all or nothing.
export async function applyLearnerImport(ctx: SchoolContext, rows: ImportRow[]): Promise<ImportSummary> {
  const schoolId = ctx.school.id;
  const db = getDb();
  const valid = rows.filter((r): r is ImportRow & { learner: ImportedLearner } => r.learner !== null);
  const summary: ImportSummary = {
    learnersCreated: 0,
    learnersUpdated: 0,
    classesAssigned: 0,
    parentsCreated: 0,
    parentsReused: 0,
    links: 0,
    skipped: rows.length - valid.length,
    notes: [],
  };
  if (valid.length === 0) return summary;

  const year = await getCurrentYear(schoolId);
  const classes = new Map((await listCurrentClasses(schoolId)).map((c) => [c.name.toLowerCase(), c.id]));

  const admissionNumbers = valid.map((r) => r.learner.admissionNumber).filter((a): a is string => Boolean(a));
  const contactValues = [
    ...new Set(valid.flatMap((r) => r.learner.parents.flatMap((p) => [p.phone, p.email]).filter((v): v is string => Boolean(v)))),
  ];

  await db.transaction(async (tx) => {
    const existingLearners = new Map<string, typeof learners.$inferSelect>();
    for (const chunk of chunks(admissionNumbers, 500)) {
      const found = await tx
        .select()
        .from(learners)
        .where(and(eq(learners.schoolId, schoolId), inArray(learners.admissionNumber, chunk), isNull(learners.deletedAt)));
      for (const l of found) existingLearners.set(l.admissionNumber!.toUpperCase(), l);
    }

    // Phone/email → guardian, from parents already on file.
    const guardianByContact = new Map<string, string>();
    for (const chunk of chunks(contactValues, 500)) {
      const found = await tx
        .select({ value: guardianContacts.value, guardianId: guardianContacts.guardianId })
        .from(guardianContacts)
        .innerJoin(guardians, eq(guardians.id, guardianContacts.guardianId))
        .where(
          and(
            eq(guardianContacts.schoolId, schoolId),
            inArray(guardianContacts.value, chunk),
            isNull(guardianContacts.deletedAt),
            isNull(guardians.deletedAt),
          ),
        );
      for (const c of found) guardianByContact.set(c.value, c.guardianId);
    }
    const onFile = new Set(guardianByContact.values());

    const openEnrolments = new Map<string, { id: string; classGroupId: string }>();
    const matchedIds = [...existingLearners.values()].map((l) => l.id);
    if (year) {
      for (const chunk of chunks(matchedIds, 500)) {
        const found = await tx
          .select({ id: enrolments.id, learnerId: enrolments.learnerId, classGroupId: enrolments.classGroupId })
          .from(enrolments)
          .where(
            and(inArray(enrolments.learnerId, chunk), eq(enrolments.academicYearId, year.id), isNull(enrolments.endedOn)),
          );
        for (const e of found) openEnrolments.set(e.learnerId, { id: e.id, classGroupId: e.classGroupId });
      }
    }
    const primaryTaken = new Set<string>();
    for (const chunk of chunks(matchedIds, 500)) {
      const found = await tx
        .select({ learnerId: learnerGuardians.learnerId })
        .from(learnerGuardians)
        .where(and(inArray(learnerGuardians.learnerId, chunk), eq(learnerGuardians.isPrimary, true)));
      for (const f of found) primaryTaken.add(f.learnerId);
    }

    const newLearners: (typeof learners.$inferInsert)[] = [];
    const newEnrolments: (typeof enrolments.$inferInsert)[] = [];
    const endEnrolmentIds: string[] = [];
    const newGuardians: (typeof guardians.$inferInsert)[] = [];
    const newContacts: (typeof guardianContacts.$inferInsert)[] = [];
    const newLinks: (typeof learnerGuardians.$inferInsert)[] = [];
    const reused = new Set<string>();
    const today = new Date().toISOString().slice(0, 10);

    for (const { line, learner } of valid) {
      const existing = learner.admissionNumber ? existingLearners.get(learner.admissionNumber.toUpperCase()) : undefined;
      let learnerId: string;
      if (existing) {
        learnerId = existing.id;
        const patch = withoutBlanks({
          firstName: learner.firstName,
          lastName: learner.lastName,
          preferredName: learner.preferredName,
          dateOfBirth: learner.dateOfBirth,
          gender: learner.gender,
          idNumber: learner.idNumber,
          homeLanguage: learner.homeLanguage,
        });
        await tx.update(learners).set(patch).where(eq(learners.id, existing.id));
        summary.learnersUpdated++;
      } else {
        learnerId = uuidv7();
        newLearners.push({
          id: learnerId,
          schoolId,
          admissionNumber: learner.admissionNumber,
          firstName: learner.firstName,
          lastName: learner.lastName,
          preferredName: learner.preferredName,
          dateOfBirth: learner.dateOfBirth,
          gender: learner.gender,
          idNumber: learner.idNumber,
          homeLanguage: learner.homeLanguage,
        });
        summary.learnersCreated++;
      }

      if (learner.className) {
        const classGroupId = classes.get(learner.className.toLowerCase());
        if (!classGroupId || !year) {
          summary.notes.push({ line, message: `Class "${learner.className}" not found this year; learner saved without a class` });
        } else {
          const open = openEnrolments.get(learnerId);
          if (open?.classGroupId !== classGroupId) {
            if (open) endEnrolmentIds.push(open.id);
            newEnrolments.push({ id: uuidv7(), schoolId, learnerId, classGroupId, academicYearId: year.id, startedOn: today });
            summary.classesAssigned++;
          }
        }
      }

      learner.parents.forEach((parent, index) => {
        const known = (parent.phone && guardianByContact.get(parent.phone)) || (parent.email && guardianByContact.get(parent.email));
        let guardianId: string;
        if (known) {
          guardianId = known;
          // Siblings in the same file share the parent created for the first.
          if (onFile.has(guardianId) && !reused.has(guardianId)) {
            reused.add(guardianId);
            summary.parentsReused++;
          }
        } else {
          guardianId = uuidv7();
          newGuardians.push({ id: guardianId, schoolId, firstName: parent.firstName, lastName: parent.lastName });
          if (parent.phone) {
            const landline = isLandline(parent.phone);
            newContacts.push({
              id: uuidv7(),
              schoolId,
              guardianId,
              kind: "phone",
              value: parent.phone,
              whatsapp: parent.whatsapp,
              sms: !landline,
              voice: true,
              isPrimary: true,
            });
            guardianByContact.set(parent.phone, guardianId);
          }
          if (parent.email) {
            newContacts.push({
              id: uuidv7(),
              schoolId,
              guardianId,
              kind: "email",
              value: parent.email,
              isPrimary: !parent.phone,
            });
            guardianByContact.set(parent.email, guardianId);
          }
          summary.parentsCreated++;
        }
        const primary = index === 0 && !primaryTaken.has(learnerId);
        if (primary) primaryTaken.add(learnerId);
        newLinks.push({ schoolId, learnerId, guardianId, relationship: parent.relationship, isPrimary: primary });
      });
    }

    for (const chunk of chunks(newLearners, 500)) await tx.insert(learners).values(chunk);
    for (const chunk of chunks(endEnrolmentIds, 500)) {
      await tx.update(enrolments).set({ endedOn: today }).where(inArray(enrolments.id, chunk));
    }
    for (const chunk of chunks(newEnrolments, 500)) await tx.insert(enrolments).values(chunk);
    for (const chunk of chunks(newGuardians, 500)) await tx.insert(guardians).values(chunk);
    for (const chunk of chunks(newContacts, 500)) await tx.insert(guardianContacts).values(chunk);
    for (const chunk of chunks(newLinks, 500)) {
      const inserted = await tx
        .insert(learnerGuardians)
        .values(chunk)
        .onConflictDoNothing()
        .returning({ learnerId: learnerGuardians.learnerId });
      summary.links += inserted.length;
    }
  });

  return summary;
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// Spreadsheet blanks don't wipe what's on file.
function withoutBlanks<T extends Record<string, unknown>>(values: T): Partial<T> {
  return Object.fromEntries(Object.entries(values).filter(([, v]) => v !== null && v !== "")) as Partial<T>;
}

// For the preview: which admission numbers are already on file, and which
// class names don't exist this year.
export async function previewMatches(schoolId: string, rows: ImportRow[]) {
  const valid = rows.filter((r) => r.learner);
  const admissionNumbers = valid.map((r) => r.learner!.admissionNumber).filter((a): a is string => Boolean(a));
  let existing = 0;
  for (const chunk of chunks(admissionNumbers, 500)) {
    const found = await getDb()
      .select({ id: learners.id })
      .from(learners)
      .where(and(eq(learners.schoolId, schoolId), inArray(learners.admissionNumber, chunk), isNull(learners.deletedAt)));
    existing += found.length;
  }
  const classes = new Set((await listCurrentClasses(schoolId)).map((c) => c.name.toLowerCase()));
  const unknownClasses = [
    ...new Set(
      valid
        .map((r) => r.learner!.className)
        .filter((c): c is string => Boolean(c) && !classes.has(c!.toLowerCase())),
    ),
  ];
  return { existing, unknownClasses, withoutAdmissionNumber: valid.length - admissionNumbers.length };
}
