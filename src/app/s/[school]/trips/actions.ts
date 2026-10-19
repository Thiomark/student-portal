"use server";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, schema } from "@/db/client";
import type { FormState } from "@/components/action-form";
import { formToObject, schoolAction, UserFacingError } from "@/lib/actions";
import { diffFields, recordActivity } from "@/lib/activity";
import { can, ForbiddenError, type SchoolContext } from "@/lib/auth/context";
import { formatDate, formatMoney, fullName, localInputToDate } from "@/lib/format";
import { uuidv7 } from "@/lib/ids";
import { notifyGuardians } from "@/lib/messaging/notify";
import { attendedInput, consentInput, paymentInput, tripInput } from "@/lib/validation/trips";
import {
  getParticipant,
  getTrip,
  listLearnerIdsInGrades,
  listParticipants,
  listTripGrades,
  participantBalance,
} from "@/server/trips";
import { getLearner } from "@/server/school-data";

const { trips, tripGrades, tripParticipants, tripPayments, grades, learnerGuardians, guardians } = schema;

async function loadTrip(ctx: SchoolContext, tripId: string) {
  const row = await getTrip(ctx.school.id, tripId);
  if (!row) throw new UserFacingError("Trip not found.");
  return row.trip;
}

async function checkGrades(ctx: SchoolContext, gradeIds: string[]) {
  if (gradeIds.length === 0) return;
  const found = await getDb()
    .select({ id: grades.id })
    .from(grades)
    .where(and(eq(grades.schoolId, ctx.school.id), inArray(grades.id, gradeIds), isNull(grades.deletedAt)));
  if (found.length !== new Set(gradeIds).size) throw new UserFacingError("Pick grades from the list.");
}

function tripFields(ctx: SchoolContext, input: z.output<typeof tripInput>) {
  const tz = ctx.school.timezone;
  return {
    title: input.title,
    destination: input.destination ?? null,
    departsAt: localInputToDate(input.departsAt, tz),
    returnsAt: input.returnsAt ? localInputToDate(input.returnsAt, tz) : null,
    costCents: input.costCents,
    paymentDueOn: input.paymentDueOn ?? null,
    status: input.status,
    notes: input.notes ?? null,
  };
}

export async function createTrip(slug: string, _prev: FormState, form: FormData): Promise<FormState> {
  const result = await schoolAction(slug, "trips.manage", async (ctx) => {
    const input = tripInput.parse(formToObject(form));
    await checkGrades(ctx, input.gradeIds);
    const id = uuidv7();
    const fields = tripFields(ctx, input);
    await getDb().transaction(async (tx) => {
      await tx
        .insert(trips)
        .values({ id, schoolId: ctx.school.id, organiserStaffId: ctx.membership.staffId, ...fields });
      if (input.gradeIds.length) {
        await tx.insert(tripGrades).values([...new Set(input.gradeIds)].map((gradeId) => ({ tripId: id, gradeId })));
      }
    });
    await recordActivity(ctx, {
      action: "trips.created",
      entityType: "trip",
      entityId: id,
      subject: input.title,
      meta: { costCents: fields.costCents, gradeCount: input.gradeIds.length },
    });
    return id;
  });
  if (!result.ok) return result;
  revalidatePath(`/s/${slug}/trips`);
  return { ok: true, redirectTo: `/s/${slug}/trips/${result.data}` };
}

export async function updateTrip(slug: string, tripId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const result = await schoolAction(slug, "trips.manage", async (ctx) => {
    const input = tripInput.parse(formToObject(form));
    await checkGrades(ctx, input.gradeIds);
    const current = await loadTrip(ctx, tripId);
    const before = await listTripGrades(ctx.school.id, tripId);
    const patch = tripFields(ctx, input);
    const gradeIds = [...new Set(input.gradeIds)];

    await getDb().transaction(async (tx) => {
      await tx
        .update(trips)
        .set(patch)
        .where(and(eq(trips.schoolId, ctx.school.id), eq(trips.id, tripId)));
      await tx.delete(tripGrades).where(eq(tripGrades.tripId, tripId));
      if (gradeIds.length) await tx.insert(tripGrades).values(gradeIds.map((gradeId) => ({ tripId, gradeId })));
    });

    const changes = diffFields(current, patch);
    const beforeIds = before.map((g) => g.id).sort();
    if (beforeIds.join() !== [...gradeIds].sort().join()) {
      changes.push({ field: "grades", before: beforeIds, after: [...gradeIds].sort() });
    }
    await recordActivity(ctx, {
      action: "trips.updated",
      entityType: "trip",
      entityId: tripId,
      subject: input.title,
      changes,
    });
  });
  if (!result.ok) return result;
  revalidatePath(`/s/${slug}/trips`);
  revalidatePath(`/s/${slug}/trips/${tripId}`);
  return { ok: true, redirectTo: `/s/${slug}/trips/${tripId}` };
}

// Adds every active learner in the trip's grades; learners already on the
// list are left as they are.
export async function addGradeParticipants(slug: string, tripId: string): Promise<FormState> {
  const result = await schoolAction(slug, "trips.manage", async (ctx) => {
    const trip = await loadTrip(ctx, tripId);
    const tripGradeRows = await listTripGrades(ctx.school.id, tripId);
    if (tripGradeRows.length === 0) throw new UserFacingError("Choose the trip's grades first (Edit trip).");
    const learnerIds = await listLearnerIdsInGrades(
      ctx.school.id,
      tripGradeRows.map((g) => g.id),
    );
    if (learnerIds.length === 0) throw new UserFacingError("No active learners are enrolled in those grades.");

    const inserted = await getDb()
      .insert(tripParticipants)
      .values(learnerIds.map((learnerId) => ({ id: uuidv7(), schoolId: ctx.school.id, tripId, learnerId })))
      .onConflictDoNothing({ target: [tripParticipants.tripId, tripParticipants.learnerId] })
      .returning({ id: tripParticipants.id });

    if (inserted.length) {
      await recordActivity(ctx, {
        action: "trips.participants_added",
        entityType: "trip",
        entityId: tripId,
        subject: trip.title,
        meta: { added: inserted.length, grades: tripGradeRows.map((g) => g.name) },
      });
    }
    return { added: inserted.length, skipped: learnerIds.length - inserted.length };
  });
  if (!result.ok) return result;
  revalidatePath(`/s/${slug}/trips/${tripId}`);
  revalidatePath(`/s/${slug}/trips/${tripId}/add`);
  const { added, skipped } = result.data;
  return {
    ok: true,
    message: `Added ${added} learner${added === 1 ? "" : "s"}${skipped ? ` (${skipped} already on the list)` : ""}.`,
  };
}

export async function addParticipant(slug: string, tripId: string, learnerId: string): Promise<FormState> {
  const result = await schoolAction(slug, "trips.manage", async (ctx) => {
    const trip = await loadTrip(ctx, tripId);
    const learner = await getLearner(ctx.school.id, learnerId);
    if (!learner) throw new UserFacingError("Learner not found.");
    const [inserted] = await getDb()
      .insert(tripParticipants)
      .values({ id: uuidv7(), schoolId: ctx.school.id, tripId, learnerId })
      .onConflictDoNothing({ target: [tripParticipants.tripId, tripParticipants.learnerId] })
      .returning({ id: tripParticipants.id });
    if (inserted) {
      await recordActivity(ctx, {
        action: "trips.participant_added",
        entityType: "trip",
        entityId: tripId,
        subject: `${fullName(learner.learner)} — ${trip.title}`,
        meta: { learnerId },
      });
    }
  });
  if (!result.ok) return result;
  revalidatePath(`/s/${slug}/trips/${tripId}`);
  revalidatePath(`/s/${slug}/trips/${tripId}/add`);
  return { ok: true };
}

export async function addParticipantForm(slug: string, tripId: string, learnerId: string): Promise<void> {
  await addParticipant(slug, tripId, learnerId);
}

// Only learners with no payment history can be taken off; otherwise reverse
// the payments and mark consent declined.
export async function removeParticipant(slug: string, tripId: string, learnerId: string): Promise<FormState> {
  const result = await schoolAction(slug, "trips.manage", async (ctx) => {
    const trip = await loadTrip(ctx, tripId);
    const participant = await getParticipant(ctx.school.id, tripId, learnerId);
    if (!participant) throw new UserFacingError("This learner is not on the trip.");
    await getDb().transaction(async (tx) => {
      const [payment] = await tx
        .select({ id: tripPayments.id })
        .from(tripPayments)
        .where(
          and(
            eq(tripPayments.schoolId, ctx.school.id),
            eq(tripPayments.tripId, tripId),
            eq(tripPayments.learnerId, learnerId),
          ),
        )
        .limit(1);
      if (payment) {
        throw new UserFacingError("This learner has payments recorded. Mark consent as declined instead.");
      }
      await tx
        .delete(tripParticipants)
        .where(and(eq(tripParticipants.schoolId, ctx.school.id), eq(tripParticipants.id, participant.id)));
    });
    await recordActivity(ctx, {
      action: "trips.participant_removed",
      entityType: "trip",
      entityId: tripId,
      subject: `${fullName(participant)} — ${trip.title}`,
      meta: { learnerId },
    });
  });
  if (!result.ok) return result;
  revalidatePath(`/s/${slug}/trips`);
  revalidatePath(`/s/${slug}/trips/${tripId}`);
  return { ok: true, redirectTo: `/s/${slug}/trips/${tripId}` };
}

// Consent slips and the attendance register are kept by whoever runs the
// trip or takes the money.
export async function updateParticipant(
  slug: string,
  tripId: string,
  learnerId: string,
  form: FormData,
): Promise<FormState> {
  const result = await schoolAction(slug, "trips.view", async (ctx) => {
    if (!can(ctx, "trips.manage") && !can(ctx, "trips.payments")) throw new ForbiddenError("trips.manage");
    const raw = formToObject(form);
    const { consent } = consentInput.parse(raw);
    const { attended } = attendedInput.parse(raw);
    const trip = await loadTrip(ctx, tripId);
    const participant = await getParticipant(ctx.school.id, tripId, learnerId);
    if (!participant) throw new UserFacingError("This learner is not on the trip.");
    const patch = {
      consent,
      ...(attended === undefined ? {} : { attended: attended === "" ? null : attended === "yes" }),
    };
    const changes = diffFields(participant, patch);
    if (changes.length === 0) return;
    await getDb()
      .update(tripParticipants)
      .set(patch)
      .where(and(eq(tripParticipants.schoolId, ctx.school.id), eq(tripParticipants.id, participant.id)));
    await recordActivity(ctx, {
      action: "trips.participant_updated",
      entityType: "trip",
      entityId: tripId,
      subject: `${fullName(participant)} — ${trip.title}`,
      changes,
      meta: { learnerId },
    });
  });
  if (!result.ok) return result;
  revalidatePath(`/s/${slug}/trips/${tripId}`);
  revalidatePath(`/s/${slug}/trips/${tripId}/learners/${learnerId}`);
  return { ok: true };
}

export async function updateParticipantForm(
  slug: string,
  tripId: string,
  learnerId: string,
  form: FormData,
): Promise<void> {
  await updateParticipant(slug, tripId, learnerId, form);
}

export async function recordPayment(
  slug: string,
  tripId: string,
  learnerId: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const result = await schoolAction(slug, "trips.payments", async (ctx) => {
    const input = paymentInput.parse(formToObject(form));
    const trip = await loadTrip(ctx, tripId);
    const participant = await getParticipant(ctx.school.id, tripId, learnerId);
    if (!participant) throw new UserFacingError("This learner is not on the trip.");
    const currency = ctx.school.currency;

    const id = uuidv7();
    await getDb().transaction(async (tx) => {
      // Lock the participant so two clerks can't both take the last balance.
      await tx
        .select({ id: tripParticipants.id })
        .from(tripParticipants)
        .where(and(eq(tripParticipants.schoolId, ctx.school.id), eq(tripParticipants.id, participant.id)))
        .for("update");
      const [{ paid }] = await tx
        .select({ paid: sql<number>`coalesce(sum(${tripPayments.amountCents}), 0)::int` })
        .from(tripPayments)
        .where(
          and(
            eq(tripPayments.schoolId, ctx.school.id),
            eq(tripPayments.tripId, tripId),
            eq(tripPayments.learnerId, learnerId),
          ),
        );
      const { balanceCents } = participantBalance(trip.costCents, paid, participant.consent);
      if (input.amount > balanceCents) {
        throw new UserFacingError(
          balanceCents > 0
            ? `That is more than the balance of ${formatMoney(balanceCents, currency)}.`
            : "Nothing is owed for this learner.",
        );
      }
      await tx.insert(tripPayments).values({
        id,
        schoolId: ctx.school.id,
        tripId,
        learnerId,
        amountCents: input.amount,
        method: input.method,
        reference: input.reference ?? null,
        receivedByStaffId: ctx.membership.staffId,
      });
    });

    await recordActivity(ctx, {
      action: "trips.payment_recorded",
      entityType: "trip_payment",
      entityId: id,
      subject: `${fullName(participant)} — ${trip.title}`,
      meta: { tripId, learnerId, amountCents: input.amount, method: input.method },
    });
    return formatMoney(input.amount, currency);
  });
  if (!result.ok) return result;
  revalidatePath(`/s/${slug}/trips`);
  revalidatePath(`/s/${slug}/trips/${tripId}`);
  revalidatePath(`/s/${slug}/trips/${tripId}/learners/${learnerId}`);
  return { ok: true, message: `Payment of ${result.data} recorded.` };
}

// Payments are never edited: a mistake is cancelled by a negative entry that
// points at the original, at most once per payment.
export async function reversePayment(
  slug: string,
  tripId: string,
  learnerId: string,
  paymentId: string,
): Promise<FormState> {
  const result = await schoolAction(slug, "trips.payments", async (ctx) => {
    if (!z.uuid().safeParse(paymentId).success) throw new UserFacingError("Payment not found.");
    const trip = await loadTrip(ctx, tripId);
    const participant = await getParticipant(ctx.school.id, tripId, learnerId);
    if (!participant) throw new UserFacingError("This learner is not on the trip.");

    const id = uuidv7();
    const amountCents = await getDb().transaction(async (tx) => {
      const [original] = await tx
        .select()
        .from(tripPayments)
        .where(
          and(
            eq(tripPayments.schoolId, ctx.school.id),
            eq(tripPayments.tripId, tripId),
            eq(tripPayments.learnerId, learnerId),
            eq(tripPayments.id, paymentId),
          ),
        )
        .for("update");
      if (!original) throw new UserFacingError("Payment not found.");
      if (original.reversesPaymentId || original.amountCents <= 0) {
        throw new UserFacingError("A reversal can't itself be reversed.");
      }
      const [existing] = await tx
        .select({ id: tripPayments.id })
        .from(tripPayments)
        .where(and(eq(tripPayments.schoolId, ctx.school.id), eq(tripPayments.reversesPaymentId, paymentId)))
        .limit(1);
      if (existing) throw new UserFacingError("This payment has already been reversed.");
      await tx.insert(tripPayments).values({
        id,
        schoolId: ctx.school.id,
        tripId,
        learnerId,
        amountCents: -original.amountCents,
        method: original.method,
        reference: original.reference,
        receivedByStaffId: ctx.membership.staffId,
        reversesPaymentId: original.id,
      });
      return original.amountCents;
    });

    await recordActivity(ctx, {
      action: "trips.payment_reversed",
      entityType: "trip_payment",
      entityId: id,
      subject: `${fullName(participant)} — ${trip.title}`,
      meta: { tripId, learnerId, reversesPaymentId: paymentId, amountCents: -amountCents },
    });
  });
  if (!result.ok) return result;
  revalidatePath(`/s/${slug}/trips`);
  revalidatePath(`/s/${slug}/trips/${tripId}`);
  revalidatePath(`/s/${slug}/trips/${tripId}/learners/${learnerId}`);
  return { ok: true };
}

// One message per learner, so each family sees their own balance.
export async function remindUnpaid(slug: string, tripId: string): Promise<FormState> {
  const result = await schoolAction(slug, "trips.payments", async (ctx) => {
    const trip = await loadTrip(ctx, tripId);
    if (trip.status === "cancelled") throw new UserFacingError("This trip is cancelled.");
    const participants = await listParticipants(ctx.school.id, tripId);
    const owing = participants
      .map((p) => ({ ...p, ...participantBalance(trip.costCents, p.paidCents, p.consent) }))
      .filter((p) => p.status === "unpaid" || p.status === "partial");
    if (owing.length === 0) throw new UserFacingError("Everyone has paid.");

    const links = await getDb()
      .select({ learnerId: learnerGuardians.learnerId, guardianId: learnerGuardians.guardianId })
      .from(learnerGuardians)
      .innerJoin(guardians, and(eq(guardians.id, learnerGuardians.guardianId), eq(guardians.schoolId, ctx.school.id)))
      .where(
        and(
          eq(learnerGuardians.schoolId, ctx.school.id),
          inArray(
            learnerGuardians.learnerId,
            owing.map((p) => p.learnerId),
          ),
          eq(learnerGuardians.receivesNotices, true),
          isNull(guardians.deletedAt),
        ),
      );

    const tz = ctx.school.timezone;
    const currency = ctx.school.currency;
    const tally = { learners: 0, guardians: 0, queued: 0, needsAction: 0, noGuardian: 0 };
    for (const p of owing) {
      const guardianIds = links.filter((l) => l.learnerId === p.learnerId).map((l) => l.guardianId);
      if (guardianIds.length === 0) {
        tally.noGuardian++;
        continue;
      }
      const text = [
        `Reminder: ${trip.title}${trip.destination ? ` to ${trip.destination}` : ""} on ${formatDate(trip.departsAt, tz)}.`,
        `${fullName(p)} still owes ${formatMoney(p.balanceCents, currency)} of ${formatMoney(p.dueCents, currency)}.` +
          (trip.paymentDueOn ? ` Please pay by ${formatDate(trip.paymentDueOn, "UTC")}.` : ""),
        `Thank you. ${ctx.school.name}`,
      ].join("\n\n");
      const outcomes = await notifyGuardians(ctx, {
        guardianIds,
        subject: `Trip payment reminder: ${trip.title}`,
        text,
        relatedType: "trip",
        relatedId: tripId,
      });
      tally.learners++;
      tally.guardians += outcomes.length;
      for (const o of outcomes) {
        if (o.status === "queued") tally.queued++;
        else tally.needsAction++;
      }
    }

    await recordActivity(ctx, {
      action: "trips.reminders_sent",
      entityType: "trip",
      entityId: tripId,
      subject: trip.title,
      meta: tally,
    });
    return tally;
  });
  if (!result.ok) return result;
  revalidatePath(`/s/${slug}/trips/${tripId}`);
  const t = result.data;
  const parts = [
    `${t.guardians} parent${t.guardians === 1 ? "" : "s"} of ${t.learners} learner${t.learners === 1 ? "" : "s"}`,
    t.queued ? `${t.queued} sending by WhatsApp or email` : null,
    t.needsAction ? `${t.needsAction} left for the office` : null,
    t.noGuardian ? `${t.noGuardian} learner${t.noGuardian === 1 ? " has" : "s have"} no parent to notify` : null,
  ].filter(Boolean);
  return { ok: true, message: `Reminders: ${parts.join(", ")}.` };
}
