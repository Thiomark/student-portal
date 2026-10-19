import "server-only";
import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import type { SchoolContext } from "@/lib/auth/context";
import { UserFacingError } from "@/lib/actions";
import { uuidv7 } from "@/lib/ids";
import type { ClassPlan } from "@/lib/rollover";
import { getCurrentYear } from "./school-data";

const { academicYears, classGroups, enrolments, grades, learners, textbookLoans } = schema;

export type RolloverInput = {
  newYear: { name: string; startsOn: string; endsOn: string };
  plans: ClassPlan[];
  // Learners held back: they go to the same-named class in their current
  // grade, whatever their class's plan says.
  repeaters: string[];
};

export type RolloverResult = {
  yearId: string;
  classesCreated: number;
  promoted: number;
  repeated: number;
  graduated: number;
  unplaced: number;
  booksStillOut: number;
};

// Moves the school into a new academic year in one transaction:
// 1. creates (or reuses an empty) next year and its classes;
// 2. closes every open enrolment in the current year;
// 3. enrols learners in next year's classes per the plan, marks the top
//    grade graduated, and leaves "skip" classes unplaced;
// 4. makes the new year current.
// Textbooks still out stay with the learner; they show on the loans page.
export async function rollOver(ctx: SchoolContext, input: RolloverInput): Promise<RolloverResult> {
  const schoolId = ctx.school.id;
  const db = getDb();
  const current = await getCurrentYear(schoolId);
  if (!current) throw new UserFacingError("Set a current academic year first.");
  if (input.newYear.startsOn <= current.startsOn) {
    throw new UserFacingError("The new year must start after the current one.");
  }
  if (input.newYear.endsOn <= input.newYear.startsOn) throw new UserFacingError("The new year must end after it starts.");

  return db.transaction(async (tx) => {
    // Lock the current year so two people can't roll over at once.
    await tx.select({ id: academicYears.id }).from(academicYears).where(eq(academicYears.id, current.id)).for("update");

    const [existing] = await tx
      .select()
      .from(academicYears)
      .where(and(eq(academicYears.schoolId, schoolId), eq(academicYears.name, input.newYear.name)));
    if (existing?.isCurrent) throw new UserFacingError(`${input.newYear.name} is already the current year.`);
    if (existing) {
      const [used] = await tx
        .select({ id: enrolments.id })
        .from(enrolments)
        .where(eq(enrolments.academicYearId, existing.id))
        .limit(1);
      if (used) throw new UserFacingError(`${input.newYear.name} already has learners in classes. Has the rollover been done?`);
    }
    const yearId = existing?.id ?? uuidv7();
    if (existing) {
      await tx
        .update(academicYears)
        .set({ startsOn: input.newYear.startsOn, endsOn: input.newYear.endsOn })
        .where(eq(academicYears.id, yearId));
    } else {
      await tx.insert(academicYears).values({ id: yearId, schoolId, ...input.newYear, isCurrent: false });
    }

    const [currentClasses, gradeRows] = await Promise.all([
      tx
        .select({ id: classGroups.id, name: classGroups.name, gradeId: classGroups.gradeId })
        .from(classGroups)
        .where(
          and(eq(classGroups.schoolId, schoolId), eq(classGroups.academicYearId, current.id), isNull(classGroups.deletedAt)),
        ),
      tx.select({ id: grades.id }).from(grades).where(and(eq(grades.schoolId, schoolId), isNull(grades.deletedAt))),
    ]);
    const gradeIds = new Set(gradeRows.map((g) => g.id));
    const classById = new Map(currentClasses.map((c) => [c.id, c]));
    const planByClass = new Map(input.plans.map((p) => [p.classId, p]));

    // Next year's classes, keyed "gradeId|name lower-cased". Two classes may
    // merge into one (e.g. a small 12C joining 12B).
    const targets = new Map<string, string>();
    const existingTargets = await tx
      .select({ id: classGroups.id, name: classGroups.name, gradeId: classGroups.gradeId })
      .from(classGroups)
      .where(and(eq(classGroups.schoolId, schoolId), eq(classGroups.academicYearId, yearId), isNull(classGroups.deletedAt)));
    for (const c of existingTargets) targets.set(`${c.gradeId}|${c.name.toLowerCase()}`, c.id);
    let classesCreated = 0;
    const targetClass = async (gradeId: string, name: string) => {
      if (!gradeIds.has(gradeId)) throw new UserFacingError("A target grade no longer exists.");
      const key = `${gradeId}|${name.trim().toLowerCase()}`;
      let id = targets.get(key);
      if (!id) {
        id = uuidv7();
        await tx.insert(classGroups).values({ id, schoolId, academicYearId: yearId, gradeId, name: name.trim() });
        targets.set(key, id);
        classesCreated++;
      }
      return id;
    };

    const open = await tx
      .select({ id: enrolments.id, learnerId: enrolments.learnerId, classGroupId: enrolments.classGroupId })
      .from(enrolments)
      .innerJoin(learners, eq(learners.id, enrolments.learnerId))
      .where(
        and(
          eq(enrolments.schoolId, schoolId),
          eq(enrolments.academicYearId, current.id),
          isNull(enrolments.endedOn),
          isNull(learners.deletedAt),
          eq(learners.status, "active"),
        ),
      );

    const repeaters = new Set(input.repeaters);
    const result: RolloverResult = { yearId, classesCreated: 0, promoted: 0, repeated: 0, graduated: 0, unplaced: 0, booksStillOut: 0 };
    const newEnrolments: (typeof enrolments.$inferInsert)[] = [];
    const graduates: string[] = [];

    for (const e of open) {
      const from = classById.get(e.classGroupId);
      const plan = planByClass.get(e.classGroupId);
      if (!from || !plan) {
        result.unplaced++;
        continue;
      }
      const action = repeaters.has(e.learnerId) ? "repeat" : plan.action;
      if (action === "graduate") {
        graduates.push(e.learnerId);
        result.graduated++;
      } else if (action === "skip") {
        result.unplaced++;
      } else {
        const classGroupId =
          action === "repeat"
            ? await targetClass(from.gradeId, from.name)
            : await targetClass(plan.targetGradeId ?? "", plan.targetName || from.name);
        newEnrolments.push({
          id: uuidv7(),
          schoolId,
          learnerId: e.learnerId,
          classGroupId,
          academicYearId: yearId,
          startedOn: input.newYear.startsOn,
        });
        if (action === "repeat") result.repeated++;
        else result.promoted++;
      }
    }

    // Close the old year's enrolments (as of the year's last day, or today
    // if the rollover happens early).
    const today = new Date().toISOString().slice(0, 10);
    const endedOn = today < current.endsOn ? today : current.endsOn;
    await tx
      .update(enrolments)
      .set({ endedOn })
      .where(and(eq(enrolments.academicYearId, current.id), isNull(enrolments.endedOn), eq(enrolments.schoolId, schoolId)));
    for (let i = 0; i < newEnrolments.length; i += 500) {
      await tx.insert(enrolments).values(newEnrolments.slice(i, i + 500));
    }
    for (let i = 0; i < graduates.length; i += 500) {
      await tx
        .update(learners)
        .set({ status: "graduated" })
        .where(inArray(learners.id, graduates.slice(i, i + 500)));
    }

    await tx
      .update(academicYears)
      .set({ isCurrent: false })
      .where(and(eq(academicYears.schoolId, schoolId), ne(academicYears.id, yearId)));
    await tx.update(academicYears).set({ isCurrent: true }).where(eq(academicYears.id, yearId));

    const [{ n }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(textbookLoans)
      .where(and(eq(textbookLoans.schoolId, schoolId), isNull(textbookLoans.returnedAt)));
    result.booksStillOut = n;
    result.classesCreated = classesCreated;
    return result;
  });
}
