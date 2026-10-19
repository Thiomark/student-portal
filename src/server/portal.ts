import "server-only";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { UserFacingError } from "@/lib/actions";
import { recordActivityAs } from "@/lib/activity";
import type { AppUser } from "@/lib/auth/context";
import { fullName } from "@/lib/format";

// What a signed-in parent may change. Every lookup goes through
// guardians.user_id = the signed-in user, so a parent can only act for their
// own guardian records and their own children.

const { guardians, meetingAttendees, meetings, tripParticipants, trips, learners, learnerGuardians } = schema;

function actor(user: AppUser) {
  return { userId: user.id, name: user.name ?? user.email, role: "guardian" };
}

export async function respondToMeeting(user: AppUser, attendeeId: string, response: "accepted" | "declined") {
  const db = getDb();
  const [row] = await db
    .select({ attendee: meetingAttendees, meeting: meetings, guardian: guardians })
    .from(meetingAttendees)
    .innerJoin(guardians, eq(guardians.id, meetingAttendees.guardianId))
    .innerJoin(meetings, eq(meetings.id, meetingAttendees.meetingId))
    .where(and(eq(meetingAttendees.id, attendeeId), eq(guardians.userId, user.id), isNull(guardians.deletedAt)));
  if (!row) throw new UserFacingError("Meeting not found.");
  if (row.meeting.status !== "scheduled" || row.meeting.deletedAt) {
    throw new UserFacingError("This meeting is no longer scheduled.");
  }
  if (row.meeting.scheduledAt < new Date()) throw new UserFacingError("This meeting has already happened.");

  await db
    .update(meetingAttendees)
    .set({ response })
    .where(and(eq(meetingAttendees.id, attendeeId), eq(meetingAttendees.schoolId, row.meeting.schoolId)));
  await recordActivityAs(actor(user), row.meeting.schoolId, {
    action: response === "accepted" ? "meetings.parent_accepted" : "meetings.parent_declined",
    entityType: "meeting",
    entityId: row.meeting.id,
    subject: `${fullName(row.guardian)}: ${row.meeting.title}`,
    meta: { via: "portal" },
  });
}

export async function setTripConsent(user: AppUser, participantId: string, consent: "given" | "declined") {
  const db = getDb();
  // The parent must be linked to this learner at the trip's school.
  const [row] = await db
    .select({ participant: tripParticipants, trip: trips, learner: learners, guardian: guardians })
    .from(tripParticipants)
    .innerJoin(trips, eq(trips.id, tripParticipants.tripId))
    .innerJoin(learners, eq(learners.id, tripParticipants.learnerId))
    .innerJoin(
      learnerGuardians,
      and(eq(learnerGuardians.learnerId, tripParticipants.learnerId), eq(learnerGuardians.schoolId, tripParticipants.schoolId)),
    )
    .innerJoin(guardians, eq(guardians.id, learnerGuardians.guardianId))
    .where(
      and(
        eq(tripParticipants.id, participantId),
        eq(guardians.userId, user.id),
        isNull(guardians.deletedAt),
        isNull(trips.deletedAt),
        gt(trips.departsAt, new Date()),
      ),
    )
    .limit(1);
  if (!row) throw new UserFacingError("Trip not found, or it has already left.");
  if (row.trip.status === "cancelled") throw new UserFacingError("This trip was cancelled.");

  await db
    .update(tripParticipants)
    .set({ consent, consentGuardianId: row.guardian.id })
    .where(and(eq(tripParticipants.id, participantId), eq(tripParticipants.schoolId, row.trip.schoolId)));
  await recordActivityAs(actor(user), row.trip.schoolId, {
    action: consent === "given" ? "trips.parent_consented" : "trips.parent_declined",
    entityType: "trip",
    entityId: row.trip.id,
    subject: `${fullName(row.learner)}: ${row.trip.title}`,
    meta: { via: "portal", guardianId: row.guardian.id },
  });
}
