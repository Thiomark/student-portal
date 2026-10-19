import { UserButton } from "@clerk/nextjs";
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { Badge, EmptyState, Section } from "@/components/ui";
import { getDb, schema } from "@/db/client";
import { listMyGuardianLinks, requireUser } from "@/lib/auth/context";
import { formatDate, formatDateTime, formatMoney, fullName } from "@/lib/format";
import { claimGuardianRecords } from "@/server/claims";
import { getCurrentYear } from "@/server/school-data";
import { answerMeeting, answerTrip } from "./actions";
import { AnswerButtons } from "./answer-buttons";

export const metadata = { title: "Parent portal" };

const s = schema;

// What a parent sees: only learners linked to their own guardian records, and
// only school data about those learners. Read-only for now.
export default async function PortalPage() {
  const user = await requireUser();
  await claimGuardianRecords(user);
  const links = await listMyGuardianLinks(user.id);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your children</h1>
        <UserButton />
      </div>
      {links.length === 0 ? (
        <EmptyState title="We couldn't find your children yet">
          Ask the school office to record <strong>{user.email ?? user.phone ?? "your email or cellphone"}</strong>{" "}
          as your contact details, then sign in again.
        </EmptyState>
      ) : (
        links.map(({ guardian, school }) => (
          <SchoolChildren key={guardian.id} guardianId={guardian.id} school={school} />
        ))
      )}
    </main>
  );
}

async function SchoolChildren({
  guardianId,
  school,
}: {
  guardianId: string;
  school: typeof schema.schools.$inferSelect;
}) {
  const db = getDb();
  const tz = school.timezone;
  const year = await getCurrentYear(school.id);
  const children = await db
    .select({ learner: s.learners, className: s.classGroups.name })
    .from(s.learnerGuardians)
    .innerJoin(s.learners, eq(s.learners.id, s.learnerGuardians.learnerId))
    .leftJoin(
      s.enrolments,
      and(
        eq(s.enrolments.learnerId, s.learners.id),
        isNull(s.enrolments.endedOn),
        year ? eq(s.enrolments.academicYearId, year.id) : sql`false`,
      ),
    )
    .leftJoin(s.classGroups, eq(s.classGroups.id, s.enrolments.classGroupId))
    .where(
      and(
        eq(s.learnerGuardians.schoolId, school.id),
        eq(s.learnerGuardians.guardianId, guardianId),
        isNull(s.learners.deletedAt),
      ),
    )
    .orderBy(asc(s.learners.firstName));
  if (children.length === 0) return null;
  const ids = children.map((c) => c.learner.id);

  const [loans, meetings, incidents, trips] = await Promise.all([
    db
      .select({
        learnerId: s.textbookLoans.learnerId,
        title: s.textbookTitles.title,
        copyNumber: s.textbookCopies.copyNumber,
        issuedAt: s.textbookLoans.issuedAt,
      })
      .from(s.textbookLoans)
      .innerJoin(s.textbookCopies, eq(s.textbookCopies.id, s.textbookLoans.copyId))
      .innerJoin(s.textbookTitles, eq(s.textbookTitles.id, s.textbookCopies.titleId))
      .where(
        and(eq(s.textbookLoans.schoolId, school.id), inArray(s.textbookLoans.learnerId, ids), isNull(s.textbookLoans.returnedAt)),
      ),
    db
      .select({
        attendeeId: s.meetingAttendees.id,
        response: s.meetingAttendees.response,
        learnerId: s.meetings.learnerId,
        title: s.meetings.title,
        scheduledAt: s.meetings.scheduledAt,
        location: s.meetings.location,
        status: s.meetings.status,
      })
      .from(s.meetings)
      .innerJoin(s.meetingAttendees, eq(s.meetingAttendees.meetingId, s.meetings.id))
      .where(
        and(
          eq(s.meetings.schoolId, school.id),
          eq(s.meetingAttendees.guardianId, guardianId),
          gte(s.meetings.scheduledAt, hoursAgo(24)),
          isNull(s.meetings.deletedAt),
        ),
      )
      .orderBy(asc(s.meetings.scheduledAt)),
    // Only incidents the school has told the parent about.
    db
      .select({
        learnerId: s.incidents.learnerId,
        occurredAt: s.incidents.occurredAt,
        category: s.incidents.category,
        description: s.incidents.description,
        actionTaken: s.incidents.actionTaken,
      })
      .from(s.incidents)
      .where(
        and(
          eq(s.incidents.schoolId, school.id),
          inArray(s.incidents.learnerId, ids),
          isNotNull(s.incidents.guardianNotifiedAt),
          isNull(s.incidents.deletedAt),
        ),
      )
      .orderBy(desc(s.incidents.occurredAt))
      .limit(20),
    db
      .select({
        participantId: s.tripParticipants.id,
        consent: s.tripParticipants.consent,
        status: s.trips.status,
        learnerId: s.tripParticipants.learnerId,
        title: s.trips.title,
        departsAt: s.trips.departsAt,
        costCents: s.trips.costCents,
        paymentDueOn: s.trips.paymentDueOn,
        paidCents: sql<number>`coalesce((select sum(p.amount_cents) from ${s.tripPayments} p where p.trip_id = ${s.trips.id} and p.learner_id = ${s.tripParticipants.learnerId}), 0)::int`,
      })
      .from(s.tripParticipants)
      .innerJoin(s.trips, eq(s.trips.id, s.tripParticipants.tripId))
      .where(
        and(
          eq(s.tripParticipants.schoolId, school.id),
          inArray(s.tripParticipants.learnerId, ids),
          gte(s.trips.departsAt, new Date()),
          isNull(s.trips.deletedAt),
        ),
      ),
  ]);

  return (
    <>
      {children.map(({ learner, className }, index) => {
        const myLoans = loans.filter((l) => l.learnerId === learner.id);
        // Meetings about no particular child are listed once, under the first.
        const myMeetings = meetings.filter((m) => m.learnerId === learner.id || (m.learnerId === null && index === 0));
        const myIncidents = incidents.filter((i) => i.learnerId === learner.id);
        const myTrips = trips.filter((t) => t.learnerId === learner.id);
        return (
          <Section key={learner.id} title={`${fullName(learner)} · ${className ?? "No class"} · ${school.name}`}>
            <div className="space-y-4 text-sm">
              <div>
                <p className="font-medium">Textbooks ({myLoans.length})</p>
                {myLoans.length === 0 ? (
                  <p className="text-slate-500">None out.</p>
                ) : (
                  <ul>
                    {myLoans.map((l) => (
                      <li key={l.copyNumber}>
                        {l.title} <span className="font-mono text-slate-500">#{l.copyNumber}</span> — since{" "}
                        {formatDate(l.issuedAt, tz)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {myMeetings.length > 0 ? (
                <div>
                  <p className="font-medium">Meetings</p>
                  <ul>
                    {myMeetings.map((m) => (
                      <li key={m.attendeeId} className="space-y-1 py-1">
                        <p>
                          {formatDateTime(m.scheduledAt, tz)} · {m.title}
                          {m.location ? ` · ${m.location}` : ""}{" "}
                          {m.status !== "scheduled" ? <Badge>{m.status}</Badge> : null}
                        </p>
                        {m.status === "scheduled" && m.scheduledAt > new Date() ? (
                          <AnswerButtons
                            current={m.response === "accepted" ? "yes" : m.response === "declined" ? "no" : null}
                            yes="I'll be there"
                            no="I can't make it"
                            onAnswer={answerMeeting.bind(null, m.attendeeId)}
                          />
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {myTrips.length > 0 ? (
                <div>
                  <p className="font-medium">Trips</p>
                  <ul>
                    {myTrips.map((t) => {
                      const owing = t.costCents - t.paidCents;
                      return (
                        <li key={t.participantId} className="space-y-1 py-1">
                          <p>
                            {t.title} on {formatDate(t.departsAt, tz)} —{" "}
                            {t.consent === "declined" ? (
                              <Badge>Not going</Badge>
                            ) : owing <= 0 ? (
                              <Badge tone="green">Paid</Badge>
                            ) : (
                              <>
                                {formatMoney(owing, school.currency)} to pay
                                {t.paymentDueOn ? ` by ${formatDate(t.paymentDueOn, tz)}` : ""}
                              </>
                            )}
                          </p>
                          {t.status !== "cancelled" ? (
                            <AnswerButtons
                              current={t.consent === "given" ? "yes" : t.consent === "declined" ? "no" : null}
                              yes={`${learner.preferredName || learner.firstName} may go`}
                              no="Not going"
                              onAnswer={answerTrip.bind(null, t.participantId)}
                            />
                          ) : (
                            <Badge>Cancelled</Badge>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
              {myIncidents.length > 0 ? (
                <div>
                  <p className="font-medium">Notices from the school</p>
                  <ul className="space-y-1">
                    {myIncidents.map((i, n) => (
                      <li key={n}>
                        {formatDate(i.occurredAt, tz)} · {i.category}: {i.description}
                        {i.actionTaken ? <span className="text-slate-500"> — {i.actionTaken}</span> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </Section>
        );
      })}
    </>
  );
}

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}
