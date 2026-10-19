import { beforeAll, describe, expect, it } from "vitest";
import type { SchoolContext } from "@/lib/auth/context";
import { uuidv7 } from "@/lib/ids";

const url = process.env.TEST_DATABASE_URL;
process.env.DATABASE_URL = url;
process.env.DATABASE_DRIVER = "pg";

const { getDb, schema } = await import("@/db/client");
const { and, eq, isNull } = await import("drizzle-orm");
const { rollOver } = await import("./rollover");

describe.skipIf(!url)("year-end rollover", () => {
  const schoolId = uuidv7();
  const yearId = uuidv7();
  const g8 = uuidv7();
  const g9 = uuidv7();
  const c8a = uuidv7();
  const c8b = uuidv7();
  const c9a = uuidv7();
  const promoted = uuidv7();
  const merged = uuidv7();
  const repeater = uuidv7();
  const graduate = uuidv7();
  let ctx: SchoolContext;

  beforeAll(async () => {
    const db = getDb();
    await db.insert(schema.schools).values({ id: schoolId, slug: `r-${schoolId.slice(-8)}`, name: "Rollover High" });
    await db.insert(schema.academicYears).values({
      id: yearId,
      schoolId,
      name: "2026",
      startsOn: "2026-01-14",
      endsOn: "2026-12-04",
      isCurrent: true,
    });
    await db.insert(schema.grades).values([
      { id: g8, schoolId, name: "Grade 8", sortOrder: 0 },
      { id: g9, schoolId, name: "Grade 9", sortOrder: 1 },
    ]);
    await db.insert(schema.classGroups).values([
      { id: c8a, schoolId, academicYearId: yearId, gradeId: g8, name: "8A" },
      { id: c8b, schoolId, academicYearId: yearId, gradeId: g8, name: "8B" },
      { id: c9a, schoolId, academicYearId: yearId, gradeId: g9, name: "9A" },
    ]);
    const learner = (id: string, firstName: string) => ({ id, schoolId, firstName, lastName: "Test" });
    await db
      .insert(schema.learners)
      .values([learner(promoted, "Promoted"), learner(merged, "Merged"), learner(repeater, "Repeater"), learner(graduate, "Graduate")]);
    const enrol = (learnerId: string, classGroupId: string) => ({
      id: uuidv7(),
      schoolId,
      learnerId,
      classGroupId,
      academicYearId: yearId,
    });
    await db
      .insert(schema.enrolments)
      .values([enrol(promoted, c8a), enrol(merged, c8b), enrol(repeater, c8a), enrol(graduate, c9a)]);
    const [school] = await db.select().from(schema.schools).where(eq(schema.schools.id, schoolId));
    ctx = {
      user: { id: uuidv7() } as SchoolContext["user"],
      school,
      membership: { id: uuidv7(), role: "admin", staffId: null },
      capabilities: new Set(),
    };
  });

  const input = {
    newYear: { name: "2027", startsOn: "2027-01-13", endsOn: "2027-12-03" },
    plans: [
      { classId: c8a, action: "promote" as const, targetGradeId: g9, targetName: "9A" },
      // A small 8B merges into 9A.
      { classId: c8b, action: "promote" as const, targetGradeId: g9, targetName: "9A" },
      { classId: c9a, action: "graduate" as const, targetGradeId: null, targetName: null },
    ],
    repeaters: [repeater],
  };

  it("moves everyone into the new year in one go", async () => {
    const result = await rollOver(ctx, input);
    expect(result).toMatchObject({ classesCreated: 2, promoted: 2, repeated: 1, graduated: 1, unplaced: 0 });

    const db = getDb();
    const placed = await db
      .select({ learnerId: schema.enrolments.learnerId, className: schema.classGroups.name })
      .from(schema.enrolments)
      .innerJoin(schema.classGroups, eq(schema.classGroups.id, schema.enrolments.classGroupId))
      .where(and(eq(schema.enrolments.academicYearId, result.yearId), isNull(schema.enrolments.endedOn)));
    const classOf = Object.fromEntries(placed.map((p) => [p.learnerId, p.className]));
    expect(classOf).toEqual({ [promoted]: "9A", [merged]: "9A", [repeater]: "8A" });

    const [grad] = await db.select().from(schema.learners).where(eq(schema.learners.id, graduate));
    expect(grad.status).toBe("graduated");

    const open2026 = await db
      .select()
      .from(schema.enrolments)
      .where(and(eq(schema.enrolments.academicYearId, yearId), isNull(schema.enrolments.endedOn)));
    expect(open2026).toEqual([]);

    const years = await db.select().from(schema.academicYears).where(eq(schema.academicYears.schoolId, schoolId));
    expect(years.find((y) => y.isCurrent)?.name).toBe("2027");
  });

  it("refuses to roll into the year that is already current", async () => {
    await expect(rollOver(ctx, { ...input, newYear: { ...input.newYear, name: "2028", startsOn: "2028-01-12", endsOn: "2028-12-01" } }))
      .resolves.toBeTruthy();
    await expect(rollOver(ctx, { ...input, newYear: { name: "2028", startsOn: "2029-01-12", endsOn: "2029-12-01" } }))
      .rejects.toThrow("already the current year");
  });
});
