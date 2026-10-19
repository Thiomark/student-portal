import { beforeAll, describe, expect, it } from "vitest";
import type { SchoolContext } from "@/lib/auth/context";
import { uuidv7 } from "@/lib/ids";
import type { Mutation } from "@/lib/offline/protocol";

const url = process.env.TEST_DATABASE_URL;
process.env.DATABASE_URL = url;
process.env.DATABASE_DRIVER = "pg";

// Imported after the env is set: the db client reads it on first use.
const { getDb, schema } = await import("@/db/client");
const { pull, push } = await import("./index");
const { eq } = await import("drizzle-orm");

describe.skipIf(!url)("textbook desk sync", () => {
  const schoolId = uuidv7();
  const otherSchoolId = uuidv7();
  const userId = uuidv7();
  const learnerA = uuidv7();
  const learnerB = uuidv7();
  const copyId = uuidv7();
  const otherSchoolCopyId = uuidv7();
  let ctx: SchoolContext;

  beforeAll(async () => {
    const db = getDb();
    const titleId = uuidv7();
    const otherTitleId = uuidv7();
    await db.insert(schema.users).values({ id: userId, clerkUserId: `user_${userId}`, name: "Desk Tester" });
    await db.insert(schema.schools).values([
      { id: schoolId, slug: `s-${schoolId.slice(-8)}`, name: "Test High" },
      { id: otherSchoolId, slug: `o-${otherSchoolId.slice(-8)}`, name: "Other High" },
    ]);
    await db.insert(schema.learners).values([
      { id: learnerA, schoolId, firstName: "Thabo", lastName: "Mokoena" },
      { id: learnerB, schoolId, firstName: "Lerato", lastName: "Dlamini" },
    ]);
    await db.insert(schema.textbookTitles).values([
      { id: titleId, schoolId, title: "Maths Gr 8" },
      { id: otherTitleId, schoolId: otherSchoolId, title: "Other book" },
    ]);
    await db.insert(schema.textbookCopies).values([
      { id: copyId, schoolId, titleId, copyNumber: "MATH8-001" },
      { id: otherSchoolCopyId, schoolId: otherSchoolId, titleId: otherTitleId, copyNumber: "X-1" },
    ]);
    const [school] = await db.select().from(schema.schools).where(eq(schema.schools.id, schoolId));
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
    ctx = {
      user,
      school,
      membership: { id: uuidv7(), role: "staff", staffId: null },
      capabilities: new Set(["textbooks.issue"]),
    };
  });

  const issue = (copy: string, learner: string): Mutation => ({
    id: uuidv7(),
    kind: "loan.issue",
    at: new Date().toISOString(),
    payload: { loanId: uuidv7(), copyId: copy, learnerId: learner, conditionOut: "good" },
  });

  it("sends a full snapshot first", async () => {
    const snapshot = await pull(ctx, null);
    expect(snapshot.full).toBe(true);
    expect(snapshot.learners.map((l) => l.id).sort()).toEqual([learnerA, learnerB].sort());
    expect(snapshot.copies).toHaveLength(1);
    expect(snapshot.copies[0].key).toBe("MATH8-001");
  });

  it("applies an issue once, even when the device resends it", async () => {
    const m = issue(copyId, learnerA);
    expect(await push(ctx, "device-1234", [m])).toEqual([{ id: m.id, status: "applied" }]);
    expect(await push(ctx, "device-1234", [m])).toEqual([{ id: m.id, status: "duplicate" }]);
  });

  it("rejects issuing a book that another device already issued", async () => {
    const m = issue(copyId, learnerB);
    const [result] = await push(ctx, "device-5678", [m]);
    expect(result.status).toBe("rejected");
    expect(result.error).toContain("Thabo Mokoena");
  });

  it("never touches another school's books", async () => {
    const [result] = await push(ctx, "device-1234", [issue(otherSchoolCopyId, learnerA)]);
    expect(result).toMatchObject({ status: "rejected", error: "Book not found" });
  });

  it("returns a book and reports it on the next pull", async () => {
    const before = await pull(ctx, null);
    const m: Mutation = {
      id: uuidv7(),
      kind: "loan.return",
      at: new Date().toISOString(),
      payload: { copyId, conditionIn: "fair", outcome: "returned" },
    };
    expect((await push(ctx, "device-1234", [m]))[0].status).toBe("applied");
    const changes = await pull(ctx, before.cursor);
    expect(changes.full).toBe(false);
    expect(changes.closedLoanIds).toHaveLength(1);
    expect(changes.copies.find((c) => c.id === copyId)).toMatchObject({ status: "available", condition: "fair" });
  });

  it("rejects malformed changes without failing the batch", async () => {
    const good = issue(copyId, learnerB);
    const results = await push(ctx, "device-1234", [{ id: "nope", kind: "loan.issue" }, good]);
    expect(results.map((r) => r.status)).toEqual(["rejected", "applied"]);
  });
});
