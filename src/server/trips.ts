import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { getCurrentYear, PAGE_SIZE } from "@/server/school-data";

const { trips, tripGrades, tripParticipants, tripPayments, learners, enrolments, classGroups, grades, staff } =
  schema;

export type PaymentStatus = "paid" | "partial" | "unpaid" | "declined";

// What a participant still owes. Declined learners owe nothing; anything they
// paid shows as a credit to refund.
export function participantBalance(costCents: number, paidCents: number, consent: string) {
  const dueCents = consent === "declined" ? 0 : costCents;
  const balanceCents = dueCents - paidCents;
  const status: PaymentStatus =
    consent === "declined" ? "declined" : balanceCents <= 0 ? "paid" : paidCents > 0 ? "partial" : "unpaid";
  return { dueCents, balanceCents, status };
}

// Net amount paid per participant, payments and reversals together.
const paidSql = sql<number>`coalesce((select sum(p.amount_cents) from ${tripPayments} p where p.trip_id = "trip_participants"."trip_id" and p.learner_id = "trip_participants"."learner_id"), 0)::int`;

export async function listTrips(schoolId: string, opts: { when: "upcoming" | "past"; page?: number }) {
  const page = Math.max(1, opts.page ?? 1);
  // Drizzle leaves columns unqualified in a single-table select, which the
  // correlated subqueries below would misread; spell the outer table out.
  const tripId = sql`"trips"."id"`;
  const tripCost = sql`"trips"."cost_cents"`;
  const endsAt = sql`coalesce(${trips.returnsAt}, ${trips.departsAt})`;
  const rows = await getDb()
    .select({
      id: trips.id,
      title: trips.title,
      destination: trips.destination,
      departsAt: trips.departsAt,
      returnsAt: trips.returnsAt,
      costCents: trips.costCents,
      paymentDueOn: trips.paymentDueOn,
      status: trips.status,
      participantCount: sql<number>`(select count(*)::int from ${tripParticipants} tp where tp.trip_id = ${tripId} and tp.consent <> 'declined')`,
      paidInFullCount: sql<number>`(select count(*)::int from ${tripParticipants} tp where tp.trip_id = ${tripId} and tp.consent <> 'declined' and coalesce((select sum(p.amount_cents) from ${tripPayments} p where p.trip_id = tp.trip_id and p.learner_id = tp.learner_id), 0) >= ${tripCost})`,
      collectedCents: sql<number>`coalesce((select sum(p.amount_cents) from ${tripPayments} p where p.trip_id = ${tripId}), 0)::int`,
    })
    .from(trips)
    .where(
      and(
        eq(trips.schoolId, schoolId),
        isNull(trips.deletedAt),
        opts.when === "upcoming" ? gte(endsAt, sql`now()`) : lt(endsAt, sql`now()`),
      ),
    )
    .orderBy(opts.when === "upcoming" ? asc(trips.departsAt) : desc(trips.departsAt))
    .limit(PAGE_SIZE + 1)
    .offset((page - 1) * PAGE_SIZE);
  return { rows: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE, page };
}

export async function getTrip(schoolId: string, tripId: string) {
  const [row] = await getDb()
    .select({ trip: trips, organiserFirstName: staff.firstName, organiserLastName: staff.lastName })
    .from(trips)
    .leftJoin(staff, and(eq(staff.id, trips.organiserStaffId), eq(staff.schoolId, schoolId)))
    .where(and(eq(trips.schoolId, schoolId), eq(trips.id, tripId), isNull(trips.deletedAt)))
    .limit(1);
  return row ?? null;
}

// trip_grades has no school_id of its own; it is reached through the trip.
export async function listTripGrades(schoolId: string, tripId: string) {
  return getDb()
    .select({ id: grades.id, name: grades.name })
    .from(tripGrades)
    .innerJoin(trips, and(eq(trips.id, tripGrades.tripId), eq(trips.schoolId, schoolId)))
    .innerJoin(grades, and(eq(grades.id, tripGrades.gradeId), eq(grades.schoolId, schoolId)))
    .where(eq(tripGrades.tripId, tripId))
    .orderBy(asc(grades.sortOrder), asc(grades.name));
}

export async function listGrades(schoolId: string) {
  return getDb()
    .select({ id: grades.id, name: grades.name })
    .from(grades)
    .where(and(eq(grades.schoolId, schoolId), isNull(grades.deletedAt)))
    .orderBy(asc(grades.sortOrder), asc(grades.name));
}

function currentClassJoin(yearId: string | null) {
  return and(
    eq(enrolments.learnerId, learners.id),
    isNull(enrolments.endedOn),
    yearId ? eq(enrolments.academicYearId, yearId) : sql`false`,
  );
}

export async function listParticipants(schoolId: string, tripId: string) {
  const year = await getCurrentYear(schoolId);
  return getDb()
    .select({
      id: tripParticipants.id,
      learnerId: learners.id,
      firstName: learners.firstName,
      lastName: learners.lastName,
      preferredName: learners.preferredName,
      className: classGroups.name,
      consent: tripParticipants.consent,
      attended: tripParticipants.attended,
      paidCents: paidSql,
    })
    .from(tripParticipants)
    .innerJoin(learners, and(eq(learners.id, tripParticipants.learnerId), eq(learners.schoolId, schoolId)))
    .leftJoin(enrolments, currentClassJoin(year?.id ?? null))
    .leftJoin(classGroups, eq(classGroups.id, enrolments.classGroupId))
    .where(and(eq(tripParticipants.schoolId, schoolId), eq(tripParticipants.tripId, tripId)))
    .orderBy(asc(classGroups.name), asc(learners.lastName), asc(learners.firstName));
}

export async function getParticipant(schoolId: string, tripId: string, learnerId: string) {
  const year = await getCurrentYear(schoolId);
  const [row] = await getDb()
    .select({
      id: tripParticipants.id,
      learnerId: learners.id,
      firstName: learners.firstName,
      lastName: learners.lastName,
      preferredName: learners.preferredName,
      className: classGroups.name,
      consent: tripParticipants.consent,
      attended: tripParticipants.attended,
      paidCents: paidSql,
    })
    .from(tripParticipants)
    .innerJoin(learners, and(eq(learners.id, tripParticipants.learnerId), eq(learners.schoolId, schoolId)))
    .leftJoin(enrolments, currentClassJoin(year?.id ?? null))
    .leftJoin(classGroups, eq(classGroups.id, enrolments.classGroupId))
    .where(
      and(
        eq(tripParticipants.schoolId, schoolId),
        eq(tripParticipants.tripId, tripId),
        eq(tripParticipants.learnerId, learnerId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function listLearnerPayments(schoolId: string, tripId: string, learnerId: string) {
  return getDb()
    .select({
      id: tripPayments.id,
      amountCents: tripPayments.amountCents,
      method: tripPayments.method,
      reference: tripPayments.reference,
      paidAt: tripPayments.paidAt,
      reversesPaymentId: tripPayments.reversesPaymentId,
      receivedByFirstName: staff.firstName,
      receivedByLastName: staff.lastName,
    })
    .from(tripPayments)
    .leftJoin(staff, and(eq(staff.id, tripPayments.receivedByStaffId), eq(staff.schoolId, schoolId)))
    .where(
      and(
        eq(tripPayments.schoolId, schoolId),
        eq(tripPayments.tripId, tripId),
        eq(tripPayments.learnerId, learnerId),
      ),
    )
    .orderBy(asc(tripPayments.paidAt), asc(tripPayments.id));
}

// Active learners in the given grades, by their open enrolment this year.
export async function listLearnerIdsInGrades(schoolId: string, gradeIds: string[]) {
  if (gradeIds.length === 0) return [];
  const year = await getCurrentYear(schoolId);
  if (!year) return [];
  const rows = await getDb()
    .selectDistinct({ id: learners.id })
    .from(enrolments)
    .innerJoin(classGroups, and(eq(classGroups.id, enrolments.classGroupId), eq(classGroups.schoolId, schoolId)))
    .innerJoin(learners, and(eq(learners.id, enrolments.learnerId), eq(learners.schoolId, schoolId)))
    .where(
      and(
        eq(enrolments.schoolId, schoolId),
        eq(enrolments.academicYearId, year.id),
        isNull(enrolments.endedOn),
        inArray(classGroups.gradeId, gradeIds),
        isNull(classGroups.deletedAt),
        eq(learners.status, "active"),
        isNull(learners.deletedAt),
      ),
    );
  return rows.map((r) => r.id);
}

export async function listTripReminderCount(schoolId: string, tripId: string) {
  const [row] = await getDb()
    .select({
      count: sql<number>`count(*)::int`,
      lastAt: sql<Date | null>`max(${schema.messages.createdAt})`,
    })
    .from(schema.messages)
    .where(
      and(
        eq(schema.messages.schoolId, schoolId),
        eq(schema.messages.relatedType, "trip"),
        eq(schema.messages.relatedId, tripId),
      ),
    );
  return { count: row?.count ?? 0, lastAt: row?.lastAt ? new Date(row.lastAt) : null };
}
