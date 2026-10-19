import { beforeAll, describe, expect, it } from "vitest";
import type { SchoolContext } from "@/lib/auth/context";
import { uuidv7 } from "@/lib/ids";
import { parseLearnerImport } from "@/lib/import/learners";

const url = process.env.TEST_DATABASE_URL;
process.env.DATABASE_URL = url;
process.env.DATABASE_DRIVER = "pg";

const { getDb, schema } = await import("@/db/client");
const { and, eq, isNull } = await import("drizzle-orm");
const { applyLearnerImport } = await import("./import-learners");

describe.skipIf(!url)("learner import", () => {
  const schoolId = uuidv7();
  const classId = uuidv7();
  let ctx: SchoolContext;

  const file = [
    "Adm No,First name,Surname,Class,Mother Name,Mother Cell,Father Name,Father Email",
    "1001,Thabo,Mokoena,8A,Nomsa,082 123 4567,Sipho,sipho@example.com",
    // Thabo's sister: same parents, so they must be reused, not duplicated.
    "1002,Lerato,Mokoena,9Z,Nomsa,0821234567,Sipho,SIPHO@example.com",
    "1003,Ayanda,Zulu,8A,,,,",
  ].join("\n");

  beforeAll(async () => {
    const db = getDb();
    const yearId = uuidv7();
    const gradeId = uuidv7();
    await db.insert(schema.schools).values({ id: schoolId, slug: `i-${schoolId.slice(-8)}`, name: "Import High" });
    await db.insert(schema.academicYears).values({
      id: yearId,
      schoolId,
      name: "2026",
      startsOn: "2026-01-01",
      endsOn: "2026-12-31",
      isCurrent: true,
    });
    await db.insert(schema.grades).values({ id: gradeId, schoolId, name: "Grade 8" });
    await db.insert(schema.classGroups).values({ id: classId, schoolId, academicYearId: yearId, gradeId, name: "8A" });
    const [school] = await db.select().from(schema.schools).where(eq(schema.schools.id, schoolId));
    ctx = {
      user: { id: uuidv7() } as SchoolContext["user"],
      school,
      membership: { id: uuidv7(), role: "admin", staffId: null },
      capabilities: new Set(),
    };
  });

  const count = async (table: typeof schema.learners | typeof schema.guardians) =>
    (await getDb().select().from(table).where(and(eq(table.schoolId, schoolId), isNull(table.deletedAt)))).length;

  it("creates learners, parents and class places, sharing parents between siblings", async () => {
    const summary = await applyLearnerImport(ctx, parseLearnerImport(file).rows);
    expect(summary).toMatchObject({
      learnersCreated: 3,
      learnersUpdated: 0,
      classesAssigned: 2,
      parentsCreated: 2,
      parentsReused: 0,
      links: 4,
      skipped: 0,
    });
    expect(summary.notes).toEqual([{ line: 3, message: 'Class "9Z" not found this year; learner saved without a class' }]);
    expect(await count(schema.learners)).toBe(3);
    expect(await count(schema.guardians)).toBe(2);
  });

  it("updates instead of duplicating when the same file comes in again", async () => {
    const changed = file.replace("1001,Thabo,", "1001,Thabiso,");
    const summary = await applyLearnerImport(ctx, parseLearnerImport(changed).rows);
    // Ayanda has no parents and Thabo/Lerato's parents are matched by contact.
    expect(summary).toMatchObject({
      learnersCreated: 0,
      learnersUpdated: 3,
      classesAssigned: 0,
      parentsCreated: 0,
      parentsReused: 2,
      links: 0,
    });
    expect(await count(schema.learners)).toBe(3);
    expect(await count(schema.guardians)).toBe(2);
    const [thabo] = await getDb()
      .select()
      .from(schema.learners)
      .where(and(eq(schema.learners.schoolId, schoolId), eq(schema.learners.admissionNumber, "1001")));
    expect(thabo.firstName).toBe("Thabiso");
  });

  it("makes the first parent the primary contact", async () => {
    const links = await getDb()
      .select({ isPrimary: schema.learnerGuardians.isPrimary, relationship: schema.learnerGuardians.relationship })
      .from(schema.learnerGuardians)
      .where(eq(schema.learnerGuardians.schoolId, schoolId));
    expect(links.filter((l) => l.isPrimary).map((l) => l.relationship)).toEqual(["mother", "mother"]);
  });
});
