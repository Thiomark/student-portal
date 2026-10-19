import { beforeAll, describe, expect, it } from "vitest";
import { uuidv7 } from "@/lib/ids";

const url = process.env.TEST_DATABASE_URL;
process.env.DATABASE_URL = url;
process.env.DATABASE_DRIVER = "pg";

const { getDb, schema } = await import("@/db/client");
const { searchGuardians, listLearners } = await import("./school-data");

describe.skipIf(!url)("school data queries", () => {
  const schoolId = uuidv7();
  const guardianId = uuidv7();
  const learnerId = uuidv7();

  beforeAll(async () => {
    const db = getDb();
    await db.insert(schema.schools).values({ id: schoolId, slug: `q-${schoolId.slice(-8)}`, name: "Query High" });
    await db.insert(schema.learners).values({ id: learnerId, schoolId, firstName: "Sipho", lastName: "Nkosi" });
    await db.insert(schema.guardians).values({ id: guardianId, schoolId, firstName: "Zanele", lastName: "Nkosi" });
    await db.insert(schema.learnerGuardians).values({ schoolId, learnerId, guardianId, relationship: "mother" });
    await db.insert(schema.guardianContacts).values([
      { id: uuidv7(), schoolId, guardianId, kind: "phone", value: "+27821234567", whatsapp: true },
      { id: uuidv7(), schoolId, guardianId, kind: "email", value: "zanele@example.com" },
    ]);
  });

  it("finds a parent by a local-format phone number", async () => {
    const rows = await searchGuardians(schoolId, "082 123 4567");
    expect(rows.map((r) => r.id)).toEqual([guardianId]);
    expect(rows[0].childCount).toBe(1);
  });

  it("finds a parent by email", async () => {
    expect((await searchGuardians(schoolId, "zanele@")).map((r) => r.id)).toEqual([guardianId]);
  });

  it("counts a learner's parents", async () => {
    const { rows } = await listLearners(schoolId, { q: "sipho" });
    expect(rows[0].guardianCount).toBe(1);
  });
});
