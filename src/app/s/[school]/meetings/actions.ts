"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db/client";
import type { FormState } from "@/components/action-form";
import { formToObject, schoolAction, UserFacingError } from "@/lib/actions";
import { diffFields, recordActivity } from "@/lib/activity";
import type { SchoolContext } from "@/lib/auth/context";
import { fullName, localInputToDate } from "@/lib/format";
import { uuidv7 } from "@/lib/ids";
import { notifyGuardians, type NotifyOutcome } from "@/lib/messaging/notify";
import {
  attendeeInput,
  cancelInput,
  meetingCreateInput,
  meetingUpdateInput,
  minutesInput,
  rescheduleInput,
} from "@/lib/validation/meetings";
import {
  getMeeting,
  meetingCancelledText,
  meetingInviteText,
  meetingRescheduledText,
} from "@/server/meetings";
import { getLearner } from "@/server/school-data";

const { meetings, meetingAttendees, learnerGuardians, staff } = schema;

type Meeting = typeof meetings.$inferSelect;
type Learner = { firstName: string; lastName: string; preferredName?: string | null } | null;

export async function createMeeting(slug: string, _prev: FormState, form: FormData): Promise<FormState> {
  const result = await schoolAction(slug, "meetings.manage", async (ctx) => {
    const input = meetingCreateInput.parse(formToObject(form));
    const schoolId = ctx.school.id;
    const scheduledAt = localInputToDate(input.scheduledAt, ctx.school.timezone);
    if (input.notify && scheduledAt.getTime() < Date.now()) {
      throw new UserFacingError("That time has already passed. Untick “Notify parents” to record a past meeting.");
    }

    const learner = input.learnerId ? await getLearner(schoolId, input.learnerId) : null;
    if (input.learnerId && !learner) throw new UserFacingError("Learner not found.");
    const guardianIds = await allowedGuardians(schoolId, input.learnerId ?? null, input["guardianIds[]"], []);
    const staffIds = await allowedStaff(schoolId, input["staffIds[]"], []);
    if (input.organiserStaffId) await requireStaff(schoolId, input.organiserStaffId);

    const id = uuidv7();
    const values = {
      id,
      schoolId,
      learnerId: input.learnerId ?? null,
      title: input.title,
      purpose: input.purpose ?? null,
      scheduledAt,
      durationMinutes: input.durationMinutes,
      location: input.location ?? null,
      mode: input.mode,
      organiserStaffId: input.organiserStaffId ?? null,
    };
    await getDb().transaction(async (tx) => {
      await tx.insert(meetings).values(values);
      const attendees = [
        ...guardianIds.map((guardianId) => ({ guardianId, staffId: null })),
        ...staffIds.map((staffId) => ({ guardianId: null, staffId })),
      ];
      if (attendees.length) {
        await tx
          .insert(meetingAttendees)
          .values(attendees.map((a) => ({ id: uuidv7(), schoolId, meetingId: id, ...a })));
      }
    });

    // After commit: a slow or failed send never loses the meeting.
    const notified =
      input.notify && guardianIds.length
        ? await notify(ctx, guardianIds, id, meetingInviteText(ctx.school, learner?.learner ?? null, values))
        : null;

    await recordActivity(ctx, {
      action: "meetings.created",
      entityType: "meeting",
      entityId: id,
      subject: subjectFor(values, learner?.learner ?? null),
      meta: { guardians: guardianIds.length, staff: staffIds.length, notified },
    });
    return id;
  });
  if (!result.ok) return result;
  revalidatePath(`/s/${slug}/meetings`);
  return { ok: true, redirectTo: `/s/${slug}/meetings/${result.data}` };
}

export async function updateMeeting(
  slug: string,
  meetingId: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const result = await schoolAction(slug, "meetings.manage", async (ctx) => {
    const input = meetingUpdateInput.parse(formToObject(form));
    const schoolId = ctx.school.id;
    const current = await getMeeting(schoolId, meetingId);
    if (!current) throw new UserFacingError("Meeting not found.");

    const existing = await getDb()
      .select()
      .from(meetingAttendees)
      .where(and(eq(meetingAttendees.schoolId, schoolId), eq(meetingAttendees.meetingId, meetingId)));
    const currentGuardians = existing.flatMap((a) => (a.guardianId ? [a.guardianId] : []));
    const currentStaff = existing.flatMap((a) => (a.staffId ? [a.staffId] : []));
    const guardianIds = await allowedGuardians(
      schoolId,
      current.meeting.learnerId,
      input["guardianIds[]"],
      currentGuardians,
    );
    const staffIds = await allowedStaff(schoolId, input["staffIds[]"], currentStaff);
    if (input.organiserStaffId && input.organiserStaffId !== current.meeting.organiserStaffId) {
      await requireStaff(schoolId, input.organiserStaffId);
    }

    const patch = {
      title: input.title,
      purpose: input.purpose ?? null,
      durationMinutes: input.durationMinutes,
      location: input.location ?? null,
      mode: input.mode,
      organiserStaffId: input.organiserStaffId ?? null,
    };
    const removeIds = existing
      .filter((a) => (a.guardianId ? !guardianIds.includes(a.guardianId) : !staffIds.includes(a.staffId!)))
      .map((a) => a.id);
    const addGuardians = guardianIds.filter((g) => !currentGuardians.includes(g));
    const addStaff = staffIds.filter((s) => !currentStaff.includes(s));
    const add = [
      ...addGuardians.map((guardianId) => ({ guardianId, staffId: null })),
      ...addStaff.map((staffId) => ({ guardianId: null, staffId })),
    ];

    await getDb().transaction(async (tx) => {
      await tx
        .update(meetings)
        .set(patch)
        .where(and(eq(meetings.schoolId, schoolId), eq(meetings.id, meetingId)));
      if (removeIds.length) {
        await tx
          .delete(meetingAttendees)
          .where(and(eq(meetingAttendees.schoolId, schoolId), inArray(meetingAttendees.id, removeIds)));
      }
      if (add.length) {
        await tx
          .insert(meetingAttendees)
          .values(add.map((a) => ({ id: uuidv7(), schoolId, meetingId, ...a })));
      }
    });

    const changes = diffFields(current.meeting, patch);
    if (removeIds.length || add.length) {
      changes.push({
        field: "attendees",
        before: { guardians: currentGuardians.length, staff: currentStaff.length },
        after: { guardians: guardianIds.length, staff: staffIds.length },
      });
    }
    await recordActivity(ctx, {
      action: "meetings.updated",
      entityType: "meeting",
      entityId: meetingId,
      subject: subjectFor(patch, current.learner),
      changes,
    });
  });
  if (!result.ok) return result;
  revalidatePath(`/s/${slug}/meetings`);
  return { ok: true, redirectTo: `/s/${slug}/meetings/${meetingId}` };
}

// ── Detail page actions ──────────────────────────────────────────────────────

export async function saveMinutes(slug: string, meetingId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const result = await schoolAction(slug, "meetings.manage", async (ctx) => {
    const input = minutesInput.parse(formToObject(form));
    const current = await requireMeeting(ctx, meetingId);
    const completed = input.intent === "complete";
    if (completed && (current.meeting.status === "completed" || current.meeting.status === "cancelled")) {
      throw new UserFacingError(`This meeting is already ${current.meeting.status}.`);
    }
    const patch = completed
      ? { minutes: input.minutes ?? null, status: "completed" as const }
      : { minutes: input.minutes ?? null };
    await updateRow(ctx, meetingId, patch);
    await recordActivity(ctx, {
      action: completed ? "meetings.completed" : "meetings.minutes_saved",
      entityType: "meeting",
      entityId: meetingId,
      subject: subjectFor(current.meeting, current.learner),
      // Minutes can hold sensitive detail; log that they changed, not what they say.
      changes: diffFields(current.meeting, patch, ["minutes"]),
    });
    return completed;
  });
  return done(slug, meetingId, result, result.ok && result.data ? "Meeting marked as completed." : "Minutes saved.");
}

export async function markNoShow(slug: string, meetingId: string): Promise<FormState> {
  const result = await schoolAction(slug, "meetings.manage", async (ctx) => {
    const current = await requireMeeting(ctx, meetingId);
    if (current.meeting.status !== "scheduled") {
      throw new UserFacingError("Only a scheduled meeting can be marked as a no-show.");
    }
    const patch = { status: "no_show" as const };
    await updateRow(ctx, meetingId, patch);
    await recordActivity(ctx, {
      action: "meetings.marked_no_show",
      entityType: "meeting",
      entityId: meetingId,
      subject: subjectFor(current.meeting, current.learner),
      changes: diffFields(current.meeting, patch),
    });
  });
  return done(slug, meetingId, result, "Marked as no-show.");
}

export async function cancelMeeting(
  slug: string,
  meetingId: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const result = await schoolAction(slug, "meetings.manage", async (ctx) => {
    const input = cancelInput.parse(formToObject(form));
    const current = await requireMeeting(ctx, meetingId);
    if (current.meeting.status !== "scheduled") {
      throw new UserFacingError("Only a scheduled meeting can be cancelled.");
    }
    const patch = { status: "cancelled" as const };
    await updateRow(ctx, meetingId, patch);

    const guardianIds = input.notify ? await guardianAttendees(ctx.school.id, meetingId) : [];
    const notified = guardianIds.length
      ? await notify(
          ctx,
          guardianIds,
          meetingId,
          meetingCancelledText(ctx.school, current.learner, current.meeting, input.reason),
        )
      : null;

    await recordActivity(ctx, {
      action: "meetings.cancelled",
      entityType: "meeting",
      entityId: meetingId,
      subject: subjectFor(current.meeting, current.learner),
      changes: diffFields(current.meeting, patch),
      meta: { reason: input.reason, notified },
    });
  });
  return done(slug, meetingId, result, "Meeting cancelled.");
}

export async function rescheduleMeeting(
  slug: string,
  meetingId: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const result = await schoolAction(slug, "meetings.manage", async (ctx) => {
    const input = rescheduleInput.parse(formToObject(form));
    const current = await requireMeeting(ctx, meetingId);
    if (current.meeting.status === "completed") {
      throw new UserFacingError("A completed meeting can't be rescheduled. Schedule a new one instead.");
    }
    const scheduledAt = localInputToDate(input.scheduledAt, ctx.school.timezone);
    if (scheduledAt.getTime() < Date.now()) throw new UserFacingError("Pick a time in the future.");
    const patch = { scheduledAt, status: "scheduled" as const };

    await getDb().transaction(async (tx) => {
      await tx
        .update(meetings)
        .set(patch)
        .where(and(eq(meetings.schoolId, ctx.school.id), eq(meetings.id, meetingId)));
      // Parents have to confirm the new time.
      await tx
        .update(meetingAttendees)
        .set({ response: "pending", attended: null })
        .where(and(eq(meetingAttendees.schoolId, ctx.school.id), eq(meetingAttendees.meetingId, meetingId)));
    });

    const guardianIds = input.notify ? await guardianAttendees(ctx.school.id, meetingId) : [];
    const notified = guardianIds.length
      ? await notify(
          ctx,
          guardianIds,
          meetingId,
          meetingRescheduledText(
            ctx.school,
            current.learner,
            { ...current.meeting, scheduledAt },
            current.meeting.scheduledAt,
          ),
        )
      : null;

    await recordActivity(ctx, {
      action: "meetings.rescheduled",
      entityType: "meeting",
      entityId: meetingId,
      subject: subjectFor(current.meeting, current.learner),
      changes: diffFields(current.meeting, patch),
      meta: { notified },
    });
  });
  return done(slug, meetingId, result, "Meeting moved.");
}

// Staff record a parent's reply (by WhatsApp, phone or in person) and, after
// the meeting, whether each person came.
export async function setAttendeeResponse(
  slug: string,
  meetingId: string,
  attendeeId: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const result = await schoolAction(slug, "meetings.manage", async (ctx) => {
    const input = attendeeInput.parse(formToObject(form));
    const current = await requireMeeting(ctx, meetingId);
    const [before] = await getDb()
      .select()
      .from(meetingAttendees)
      .where(
        and(
          eq(meetingAttendees.schoolId, ctx.school.id),
          eq(meetingAttendees.meetingId, meetingId),
          eq(meetingAttendees.id, attendeeId),
        ),
      )
      .limit(1);
    if (!before) throw new UserFacingError("Attendee not found.");
    const patch = { response: input.response, attended: input.attended };
    await getDb()
      .update(meetingAttendees)
      .set(patch)
      .where(and(eq(meetingAttendees.schoolId, ctx.school.id), eq(meetingAttendees.id, attendeeId)));
    await recordActivity(ctx, {
      action: "meetings.attendee_updated",
      entityType: "meeting",
      entityId: meetingId,
      subject: subjectFor(current.meeting, current.learner),
      changes: diffFields(before, patch),
      meta: { attendeeId, guardianId: before.guardianId, staffId: before.staffId },
    });
  });
  return done(slug, meetingId, result, "Saved.");
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function subjectFor(m: { title: string }, learner: Learner): string {
  return learner ? `${m.title} · ${fullName(learner)}` : m.title;
}

async function requireMeeting(ctx: SchoolContext, meetingId: string) {
  const row = await getMeeting(ctx.school.id, meetingId);
  if (!row) throw new UserFacingError("Meeting not found.");
  return row;
}

async function updateRow(ctx: SchoolContext, meetingId: string, patch: Partial<Meeting>) {
  await getDb()
    .update(meetings)
    .set(patch)
    .where(and(eq(meetings.schoolId, ctx.school.id), eq(meetings.id, meetingId)));
}

function done(
  slug: string,
  meetingId: string,
  result: { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> },
  message: string,
): FormState {
  if (!result.ok) return result;
  revalidatePath(`/s/${slug}/meetings`);
  revalidatePath(`/s/${slug}/meetings/${meetingId}`);
  return { ok: true, message };
}

async function guardianAttendees(schoolId: string, meetingId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ guardianId: meetingAttendees.guardianId })
    .from(meetingAttendees)
    .where(and(eq(meetingAttendees.schoolId, schoolId), eq(meetingAttendees.meetingId, meetingId)));
  return rows.flatMap((r) => (r.guardianId ? [r.guardianId] : []));
}

// Guardians must be linked to the meeting's learner (or already attending).
async function allowedGuardians(
  schoolId: string,
  learnerId: string | null,
  requested: string[],
  alreadyAttending: string[],
): Promise<string[]> {
  const wanted = [...new Set(requested)];
  if (wanted.length === 0) return [];
  const linked = learnerId
    ? await getDb()
        .select({ id: learnerGuardians.guardianId })
        .from(learnerGuardians)
        .where(
          and(
            eq(learnerGuardians.schoolId, schoolId),
            eq(learnerGuardians.learnerId, learnerId),
            inArray(learnerGuardians.guardianId, wanted),
          ),
        )
    : [];
  const ok = new Set([...linked.map((r) => r.id), ...alreadyAttending]);
  if (wanted.some((g) => !ok.has(g))) {
    throw new UserFacingError("Pick parents from the learner's linked parents.");
  }
  return wanted;
}

async function allowedStaff(schoolId: string, requested: string[], alreadyAttending: string[]): Promise<string[]> {
  const wanted = [...new Set(requested)];
  const fresh = wanted.filter((s) => !alreadyAttending.includes(s));
  if (fresh.length) {
    const found = await getDb()
      .select({ id: staff.id })
      .from(staff)
      .where(and(eq(staff.schoolId, schoolId), inArray(staff.id, fresh), isNull(staff.deletedAt)));
    if (found.length !== fresh.length) throw new UserFacingError("One of the staff members wasn't found.");
  }
  return wanted;
}

async function requireStaff(schoolId: string, staffId: string) {
  const [row] = await getDb()
    .select({ id: staff.id })
    .from(staff)
    .where(and(eq(staff.schoolId, schoolId), eq(staff.id, staffId), isNull(staff.deletedAt)))
    .limit(1);
  if (!row) throw new UserFacingError("Organiser not found.");
}

type NotifySummary = { sent: number; failed: number; needsAction: number; error?: boolean };

// Sends after the write has committed. A provider or database hiccup here is
// reported in the summary rather than failing an action that already saved.
async function notify(
  ctx: SchoolContext,
  guardianIds: string[],
  meetingId: string,
  notice: { subject: string; text: string },
): Promise<NotifySummary> {
  let outcomes: NotifyOutcome[];
  try {
    outcomes = await notifyGuardians(ctx, {
      guardianIds,
      subject: notice.subject,
      text: notice.text,
      relatedType: "meeting",
      relatedId: meetingId,
    });
  } catch (err) {
    console.error("[meetings] notify failed", err);
    return { sent: 0, failed: 0, needsAction: 0, error: true };
  }
  return {
    sent: outcomes.filter((o) => o.status === "sent").length,
    failed: outcomes.filter((o) => o.status === "failed").length,
    needsAction: outcomes.filter((o) => o.status === "needs_action").length,
  };
}
