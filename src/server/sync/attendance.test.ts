import { beforeAll, describe, expect, it } from "vitest";
import type { SchoolContext } from "@/lib/auth/context";
import { schoolToday, shiftDate } from "@/lib/format";
import { uuidv7 } from "@/lib/ids";
import type { AttendanceStatus, Mutation } from "@/lib/offline/protocol";

const url = process.env.TEST_DATABASE_URL;
process.env.DATABASE_URL = url;
process.env.DATABASE_DRIVER = "pg";

const { getDb, schema } = await import("@/db/client");
const { and, eq } = await import("drizzle-orm");
const { pull, push } = await import("./index");

describe.skipIf(!url)("attendance register sync", () => {
  const schoolId = uuidv7();
  const otherSchoolId = uuidv7();
  const classId = uuidv7();
  const thabo = uuidv7();
  const lerato = uuidv7();
  const outsider = uuidv7();
  const guardianId = uuidv7();
  let ctx: SchoolContext;
  let today: string;

  beforeAll(async () => {
    const db = getDb();
    const userId = uuidv7();
    const yearId = uuidv7();
    const gradeId = uuidv7();
    await db.insert(schema.users).values({ id: userId, clerkUserId: `user_${userId}`, name: "Register Tester" });
    await db.insert(schema.schools).values([
      { id: schoolId, slug: `a-${schoolId.slice(-8)}`, name: "Register High", phone: "011 555 0100" },
      { id: otherSchoolId, slug: `b-${otherSchoolId.slice(-8)}`, name: "Other High" },
    ]);
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
    await db.insert(schema.learners).values([
      { id: thabo, schoolId, firstName: "Thabo", lastName: "Mokoena" },
      { id: lerato, schoolId, firstName: "Lerato", lastName: "Dlamini" },
      { id: outsider, schoolId: otherSchoolId, firstName: "Not", lastName: "Ours" },
    ]);
    await db.insert(schema.enrolments).values([
      { id: uuidv7(), schoolId, learnerId: thabo, classGroupId: classId, academicYearId: yearId },
      { id: uuidv7(), schoolId, learnerId: lerato, classGroupId: classId, academicYearId: yearId },
    ]);
    // A parent with no phone or email: absence notices become letters.
    await db.insert(schema.guardians).values({ id: guardianId, schoolId, firstName: "Mme", lastName: "Mokoena" });
    await db.insert(schema.learnerGuardians).values({ schoolId, learnerId: thabo, guardianId, relationship: "mother" });

    const [school] = await db.select().from(schema.schools).where(eq(schema.schools.id, schoolId));
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
    today = schoolToday(school.timezone);
    ctx = {
      user,
      school,
      membership: { id: uuidv7(), role: "staff", staffId: null },
      capabilities: new Set(["attendance.take"]),
    };
  });

  const register = (
    date: string,
    marks: [string, AttendanceStatus][],
    opts: { registerId?: string; notify?: boolean; classGroupId?: string } = {},
  ): Mutation => ({
    id: uuidv7(),
    kind: "attendance.submit",
    at: new Date().toISOString(),
    payload: {
      registerId: opts.registerId ?? uuidv7(),
      classGroupId: opts.classGroupId ?? classId,
      date,
      marks: marks.map(([learnerId, status]) => ({ learnerId, status })),
      notifyAbsences: opts.notify ?? true,
    },
  });

  const records = () =>
    getDb()
      .select()
      .from(schema.attendanceRecords)
      .where(and(eq(schema.attendanceRecords.schoolId, schoolId), eq(schema.attendanceRecords.date, today)));
  const absenceLetters = () =>
    getDb()
      .select()
      .from(schema.messages)
      .where(and(eq(schema.messages.schoolId, schoolId), eq(schema.messages.relatedType, "attendance")));

  it("includes classes and the scope in the snapshot", async () => {
    const snapshot = await pull(ctx, null);
    expect(snapshot.scope).toEqual({ textbooks: false, attendance: true });
    expect(snapshot.today).toBe(today);
    expect(snapshot.classes.map((c) => c.name)).toEqual(["8A"]);
    expect(snapshot.learners.find((l) => l.id === thabo)?.classGroupId).toBe(classId);
    expect(snapshot.copies).toEqual([]);
  });

  it("saves a register and tells the absent learner's parents once", async () => {
    const [result] = await push(ctx, "device-reg-1", [register(today, [[thabo, "absent"], [lerato, "present"]])]);
    expect(result.status).toBe("applied");
    const rows = await records();
    expect(rows.map((r) => [r.learnerId, r.status]).sort()).toEqual([[lerato, "present"], [thabo, "absent"]].sort());
    const letters = await absenceLetters();
    expect(letters).toHaveLength(1);
    expect(letters[0]).toMatchObject({ channel: "letter", status: "needs_action", subject: "Thabo Mokoena is absent today" });
  });

  it("lets a teacher correct the register without a second message", async () => {
    const [first] = await getDb()
      .select()
      .from(schema.attendanceRegisters)
      .where(eq(schema.attendanceRegisters.classGroupId, classId));
    // Another device retakes it with its own id; the first register is kept.
    const [result] = await push(ctx, "device-reg-2", [
      register(today, [[thabo, "absent"], [lerato, "late"]], { registerId: uuidv7() }),
    ]);
    expect(result.status).toBe("applied");
    const registers = await getDb()
      .select()
      .from(schema.attendanceRegisters)
      .where(eq(schema.attendanceRegisters.classGroupId, classId));
    expect(registers.map((r) => r.id)).toEqual([first.id]);
    expect((await records()).find((r) => r.learnerId === lerato)?.status).toBe("late");
    expect(await absenceLetters()).toHaveLength(1);
  });

  it("doesn't message parents about an old register", async () => {
    const yesterday = shiftDate(today, -1);
    const [result] = await push(ctx, "device-reg-1", [register(yesterday, [[lerato, "absent"]])]);
    expect(result.status).toBe("applied");
    expect(await absenceLetters()).toHaveLength(1);
  });

  it("refuses future dates, very old registers and other schools' learners", async () => {
    const results = await push(ctx, "device-reg-1", [
      register(shiftDate(today, 1), [[thabo, "present"]]),
      register(shiftDate(today, -45), [[thabo, "present"]]),
      register(today, [[outsider, "present"]]),
    ]);
    expect(results.map((r) => r.status)).toEqual(["rejected", "rejected", "rejected"]);
    expect(results[0].error).toContain("future");
    expect(results[1].error).toContain("office");
    expect(results[2].error).toContain("no longer at the school");
  });

  it("checks the attendance permission per change", async () => {
    const deskOnly = { ...ctx, capabilities: new Set(["textbooks.issue"] as const) };
    const [result] = await push(deskOnly, "device-reg-1", [register(today, [[thabo, "present"]])]);
    expect(result).toMatchObject({ status: "rejected", error: "You don't have permission to do that" });
  });

  it("sends registers and marks to other devices", async () => {
    const snapshot = await pull(ctx, null);
    expect(snapshot.registers.some((r) => r.classGroupId === classId && r.date === today)).toBe(true);
    expect(snapshot.attendance.find((a) => a.key === `${lerato}:${today}`)?.status).toBe("late");
  });
});
