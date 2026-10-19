// Fills a database with a demo school for local development.
//   pnpm db:seed                    → creates "Demo High School" (/s/demo-high)
//   pnpm db:seed you@example.com    → also invites you as its owner
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../src/db/schema";
import { uuidv7 } from "../src/lib/ids";

const FIRST = ["Thabo", "Lerato", "Sipho", "Naledi", "Kagiso", "Ayanda", "Zanele", "Bongani", "Palesa", "Musa", "Anele", "Karabo"];
const LAST = ["Mokoena", "Dlamini", "Nkosi", "Botha", "Naidoo", "Khumalo", "van Wyk", "Pillay", "Mahlangu", "Sithole"];

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });
  const ownerEmail = process.argv[2]?.toLowerCase();
  const schoolId = uuidv7();
  const year = new Date().getFullYear();
  const yearId = uuidv7();
  const pick = <T>(list: T[], i: number) => list[i % list.length];

  await db.transaction(async (tx) => {
    await tx.insert(schema.schools).values({
      id: schoolId,
      slug: "demo-high",
      name: "Demo High School",
      address: "1 School Street, Soweto, 1804",
      phone: "011 555 0100",
    });
    await tx.insert(schema.academicYears).values({
      id: yearId,
      schoolId,
      name: String(year),
      startsOn: `${year}-01-01`,
      endsOn: `${year}-12-31`,
      isCurrent: true,
    });
    const grades = [8, 9].map((n, i) => ({ id: uuidv7(), schoolId, name: `Grade ${n}`, sortOrder: i }));
    await tx.insert(schema.grades).values(grades);

    const teachers = ["Ndlovu", "Smith", "Mthembu"].map((last, i) => ({
      id: uuidv7(),
      schoolId,
      title: i === 1 ? "Mr" : "Mrs",
      firstName: pick(FIRST, i + 3),
      lastName: last,
      position: "Teacher",
    }));
    await tx.insert(schema.staff).values(teachers);

    const classes = grades.flatMap((g, gi) =>
      ["A", "B"].map((letter, li) => ({
        id: uuidv7(),
        schoolId,
        academicYearId: yearId,
        gradeId: g.id,
        name: `${g.name.replace("Grade ", "")}${letter}`,
        teacherId: pick(teachers, gi * 2 + li).id,
      })),
    );
    await tx.insert(schema.classGroups).values(classes);

    const subjectId = uuidv7();
    await tx.insert(schema.subjects).values({ id: subjectId, schoolId, name: "Mathematics" });

    for (let i = 0; i < 40; i++) {
      const learnerId = uuidv7();
      const klass = pick(classes, i);
      const lastName = pick(LAST, i);
      await tx.insert(schema.learners).values({
        id: learnerId,
        schoolId,
        admissionNumber: `${year}${String(i + 1).padStart(3, "0")}`,
        firstName: pick(FIRST, i * 7),
        lastName,
        gender: i % 2 ? "male" : "female",
      });
      await tx.insert(schema.enrolments).values({
        id: uuidv7(),
        schoolId,
        learnerId,
        classGroupId: klass.id,
        academicYearId: yearId,
      });
      // A spread of real situations: WhatsApp, landline only, email only,
      // no contact at all, and a few learners with no parent on file.
      if (i % 9 === 8) continue;
      const guardianId = uuidv7();
      await tx.insert(schema.guardians).values({
        id: guardianId,
        schoolId,
        title: "Mrs",
        firstName: pick(FIRST, i * 3 + 1),
        lastName,
      });
      await tx.insert(schema.learnerGuardians).values({
        schoolId,
        learnerId,
        guardianId,
        relationship: "mother",
        isPrimary: true,
      });
      const phone = `+2782${String(1000000 + i).slice(-7)}`;
      const kind = i % 4;
      if (kind === 0) {
        await tx.insert(schema.guardianContacts).values({
          id: uuidv7(), schoolId, guardianId, kind: "phone", value: phone, whatsapp: true, sms: true, voice: true, isPrimary: true,
        });
      } else if (kind === 1) {
        await tx.insert(schema.guardianContacts).values({
          id: uuidv7(), schoolId, guardianId, kind: "phone", value: `+2711555${String(1000 + i).slice(-4)}`, voice: true, isPrimary: true,
        });
      } else if (kind === 2) {
        await tx.insert(schema.guardianContacts).values({
          id: uuidv7(), schoolId, guardianId, kind: "email", value: `parent${i}@example.com`, isPrimary: true,
        });
      }
    }

    for (const g of grades) {
      const titleId = uuidv7();
      const prefix = `MATH${g.name.replace("Grade ", "")}-`;
      await tx.insert(schema.textbookTitles).values({
        id: titleId,
        schoolId,
        title: `Platinum Mathematics ${g.name}`,
        subjectId,
        gradeId: g.id,
      });
      await tx.insert(schema.textbookCopies).values(
        Array.from({ length: 30 }, (_, i) => ({
          id: uuidv7(),
          schoolId,
          titleId,
          copyNumber: `${prefix}${String(i + 1).padStart(3, "0")}`,
          condition: (i % 5 === 0 ? "fair" : "good") as "fair" | "good",
        })),
      );
    }

    if (ownerEmail) {
      await tx.insert(schema.invites).values({
        id: uuidv7(),
        schoolId,
        email: ownerEmail,
        role: "owner",
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
    }
  });

  console.log("Seeded Demo High School at /s/demo-high");
  if (ownerEmail) console.log(`${ownerEmail} becomes owner on first sign-in.`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
