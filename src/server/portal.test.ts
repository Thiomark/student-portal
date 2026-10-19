import { beforeAll, describe, expect, it } from "vitest";
import type { AppUser } from "@/lib/auth/context";
import { uuidv7 } from "@/lib/ids";

const url = process.env.TEST_DATABASE_URL;
process.env.DATABASE_URL = url;
process.env.DATABASE_DRIVER = "pg";

const { getDb, schema } = await import("@/db/client");
const { eq } = await import("drizzle-orm");
const { respondToMeeting, setTripConsent } = await import("./portal");

describe.skipIf(!url)("parent portal actions", () => {
  const schoolId = uuidv7();
  const mine = uuidv7();
  const theirs = uuidv7();
  const myAttendee = uuidv7();
  const theirAttendee = uuidv7();
  const myParticipant = uuidv7();
  const theirParticipant = uuidv7();
  const pastParticipant = uuidv7();
  let parent: AppUser;

  beforeAll(async () => {
    const db = getDb();
    const [me, other] = [uuidv7(), uuidv7()];
    await db.insert(schema.users).values([
      { id: me, clerkUserId: `user_${me}`, name: "Nomsa" },
      { id: other, clerkUserId: `user_${other}`, name: "Someone Else" },
    ]);
    await db.insert(schema.schools).values({ id: schoolId, slug: `p-${schoolId.slice(-8)}`, name: "Portal High" });
    await db.insert(schema.learners).values([
      { id: mine, schoolId, firstName: "Thabo", lastName: "Mokoena" },
      { id: theirs, schoolId, firstName: "Other", lastName: "Child" },
    ]);
    const [myGuardian, theirGuardian] = [uuidv7(), uuidv7()];
    await db.insert(schema.guardians).values([
      { id: myGuardian, schoolId, userId: me, firstName: "Nomsa", lastName: "Mokoena" },
      { id: theirGuardian, schoolId, userId: other, firstName: "Else", lastName: "Child" },
    ]);
    await db.insert(schema.learnerGuardians).values([
      { schoolId, learnerId: mine, guardianId: myGuardian, relationship: "mother" },
      { schoolId, learnerId: theirs, guardianId: theirGuardian, relationship: "mother" },
    ]);
    const inAWeek = new Date(Date.now() + 7 * 86_400_000);
    const meetingId = uuidv7();
    await db.insert(schema.meetings).values({ id: meetingId, schoolId, title: "Progress", scheduledAt: inAWeek });
    await db.insert(schema.meetingAttendees).values([
      { id: myAttendee, schoolId, meetingId, guardianId: myGuardian },
      { id: theirAttendee, schoolId, meetingId, guardianId: theirGuardian },
    ]);
    const [tripId, pastTripId] = [uuidv7(), uuidv7()];
    await db.insert(schema.trips).values([
      { id: tripId, schoolId, title: "Zoo", departsAt: inAWeek },
      { id: pastTripId, schoolId, title: "Museum", departsAt: new Date(Date.now() - 86_400_000) },
    ]);
    await db.insert(schema.tripParticipants).values([
      { id: myParticipant, schoolId, tripId, learnerId: mine },
      { id: theirParticipant, schoolId, tripId, learnerId: theirs },
      { id: pastParticipant, schoolId, tripId: pastTripId, learnerId: mine },
    ]);
    [parent] = await db.select().from(schema.users).where(eq(schema.users.id, me));
  });

  const attendee = async (id: string) =>
    (await getDb().select().from(schema.meetingAttendees).where(eq(schema.meetingAttendees.id, id)))[0];
  const participant = async (id: string) =>
    (await getDb().select().from(schema.tripParticipants).where(eq(schema.tripParticipants.id, id)))[0];

  it("lets a parent answer their own meeting invitation", async () => {
    await respondToMeeting(parent, myAttendee, "accepted");
    expect((await attendee(myAttendee)).response).toBe("accepted");
  });

  it("never lets a parent answer for someone else", async () => {
    await expect(respondToMeeting(parent, theirAttendee, "declined")).rejects.toThrow("Meeting not found");
    expect((await attendee(theirAttendee)).response).toBe("pending");
    await expect(setTripConsent(parent, theirParticipant, "given")).rejects.toThrow("Trip not found");
    expect((await participant(theirParticipant)).consent).toBe("pending");
  });

  it("records trip consent and who gave it", async () => {
    await setTripConsent(parent, myParticipant, "given");
    const row = await participant(myParticipant);
    expect(row.consent).toBe("given");
    expect(row.consentGuardianId).not.toBeNull();
  });

  it("refuses consent for a trip that has left", async () => {
    await expect(setTripConsent(parent, pastParticipant, "given")).rejects.toThrow("already left");
  });

  it("logs the parent's answers for the school", async () => {
    const events = await getDb()
      .select({ action: schema.activityEvents.action, role: schema.activityEvents.actorRole })
      .from(schema.activityEvents)
      .where(eq(schema.activityEvents.schoolId, schoolId));
    expect(events).toEqual(
      expect.arrayContaining([
        { action: "meetings.parent_accepted", role: "guardian" },
        { action: "trips.parent_consented", role: "guardian" },
      ]),
    );
  });
});
