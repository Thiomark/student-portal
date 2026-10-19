import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { fullName, localInputToDate, toLocalInput } from "@/lib/format";
import { MEETING_MODE_LABELS } from "@/lib/validation/meetings";
import { PAGE_SIZE } from "@/server/school-data";

const { meetings, meetingAttendees, guardians, staff, learners, messages } = schema;

export type MeetingTab = "upcoming" | "past" | "cancelled";

// Midnight today in the school's timezone. "Upcoming" starts there so a
// meeting later today, or one this morning not yet closed off, still shows.
function startOfToday(timeZone: string): Date {
  return localInputToDate(`${toLocalInput(new Date(), timeZone).slice(0, 10)}T00:00`, timeZone);
}

export async function listMeetings(schoolId: string, timeZone: string, opts: { tab: MeetingTab; page?: number }) {
  const today = startOfToday(timeZone);
  const where: SQL[] = [eq(meetings.schoolId, schoolId), isNull(meetings.deletedAt)];
  if (opts.tab === "upcoming") {
    where.push(eq(meetings.status, "scheduled"), gte(meetings.scheduledAt, today));
  } else if (opts.tab === "past") {
    where.push(
      or(
        inArray(meetings.status, ["completed", "no_show"]),
        and(eq(meetings.status, "scheduled"), lt(meetings.scheduledAt, today)),
      )!,
    );
  } else {
    where.push(eq(meetings.status, "cancelled"));
  }

  const page = Math.max(1, opts.page ?? 1);
  const rows = await getDb()
    .select({
      id: meetings.id,
      title: meetings.title,
      scheduledAt: meetings.scheduledAt,
      durationMinutes: meetings.durationMinutes,
      mode: meetings.mode,
      status: meetings.status,
      learnerId: meetings.learnerId,
      learnerFirstName: learners.firstName,
      learnerLastName: learners.lastName,
      learnerPreferredName: learners.preferredName,
      organiserFirstName: staff.firstName,
      organiserLastName: staff.lastName,
      guardianNames: sql<string | null>`(select string_agg(g.first_name || ' ' || g.last_name, ', ' order by g.last_name)
        from ${meetingAttendees} ma join ${guardians} g on g.id = ma.guardian_id
        where ma.meeting_id = ${meetings.id} and ma.school_id = ${schoolId})`,
    })
    .from(meetings)
    .leftJoin(learners, and(eq(learners.id, meetings.learnerId), eq(learners.schoolId, schoolId)))
    .leftJoin(staff, and(eq(staff.id, meetings.organiserStaffId), eq(staff.schoolId, schoolId)))
    .where(and(...where))
    .orderBy(opts.tab === "upcoming" ? asc(meetings.scheduledAt) : desc(meetings.scheduledAt))
    .limit(PAGE_SIZE + 1)
    .offset((page - 1) * PAGE_SIZE);
  return { rows: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE, page, today };
}

export async function getMeeting(schoolId: string, meetingId: string) {
  const [row] = await getDb()
    .select({ meeting: meetings, learner: learners, organiser: staff })
    .from(meetings)
    .leftJoin(learners, and(eq(learners.id, meetings.learnerId), eq(learners.schoolId, schoolId)))
    .leftJoin(staff, and(eq(staff.id, meetings.organiserStaffId), eq(staff.schoolId, schoolId)))
    .where(and(eq(meetings.schoolId, schoolId), eq(meetings.id, meetingId), isNull(meetings.deletedAt)))
    .limit(1);
  return row ?? null;
}

export async function listAttendees(schoolId: string, meetingId: string) {
  return getDb()
    .select({
      id: meetingAttendees.id,
      guardianId: meetingAttendees.guardianId,
      staffId: meetingAttendees.staffId,
      response: meetingAttendees.response,
      attended: meetingAttendees.attended,
      guardianTitle: guardians.title,
      guardianFirstName: guardians.firstName,
      guardianLastName: guardians.lastName,
      staffTitle: staff.title,
      staffFirstName: staff.firstName,
      staffLastName: staff.lastName,
      staffPosition: staff.position,
    })
    .from(meetingAttendees)
    .leftJoin(guardians, and(eq(guardians.id, meetingAttendees.guardianId), eq(guardians.schoolId, schoolId)))
    .leftJoin(staff, and(eq(staff.id, meetingAttendees.staffId), eq(staff.schoolId, schoolId)))
    .where(and(eq(meetingAttendees.schoolId, schoolId), eq(meetingAttendees.meetingId, meetingId)))
    .orderBy(sql`${meetingAttendees.guardianId} is null`, asc(guardians.lastName), asc(staff.lastName));
}

export async function listMeetingMessages(schoolId: string, meetingId: string) {
  return getDb()
    .select({
      id: messages.id,
      guardianId: messages.guardianId,
      channel: messages.channel,
      status: messages.status,
      subject: messages.subject,
      error: messages.error,
      createdAt: messages.createdAt,
      guardianFirstName: guardians.firstName,
      guardianLastName: guardians.lastName,
    })
    .from(messages)
    .leftJoin(guardians, and(eq(guardians.id, messages.guardianId), eq(guardians.schoolId, schoolId)))
    .where(
      and(eq(messages.schoolId, schoolId), eq(messages.relatedType, "meeting"), eq(messages.relatedId, meetingId)),
    )
    .orderBy(desc(messages.createdAt))
    .limit(200);
}

export async function listActiveStaff(schoolId: string) {
  return getDb()
    .select({
      id: staff.id,
      title: staff.title,
      firstName: staff.firstName,
      lastName: staff.lastName,
      position: staff.position,
    })
    .from(staff)
    .where(and(eq(staff.schoolId, schoolId), isNull(staff.deletedAt), eq(staff.status, "active")))
    .orderBy(asc(staff.lastName), asc(staff.firstName));
}

export function staffName(s: { title?: string | null; firstName: string; lastName: string }): string {
  return [s.title, s.firstName, s.lastName].filter(Boolean).join(" ");
}

// ── Notice text ──────────────────────────────────────────────────────────────

type NoticeMeeting = {
  title: string;
  purpose: string | null;
  scheduledAt: Date;
  durationMinutes: number;
  location: string | null;
  mode: keyof typeof MEETING_MODE_LABELS;
};
type NoticeSchool = { name: string; timezone: string; phone: string | null };
type NoticeLearner = { firstName: string; lastName: string; preferredName?: string | null } | null;

export function formatMeetingWhen(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-ZA", { dateStyle: "full", timeStyle: "short", timeZone }).format(date);
}

function whereLine(m: NoticeMeeting): string {
  if (m.mode === "in_person") return m.location ?? "At the school";
  const how = m.mode === "phone" ? "By phone (we will call you)" : "Video call";
  return m.location ? `${how} – ${m.location}` : how;
}

function signOff(school: NoticeSchool): string {
  return school.phone ? `${school.name}\n${school.phone}` : school.name;
}

// Plain text that reads well on WhatsApp, email and a printed letter.
export function meetingInviteText(school: NoticeSchool, learner: NoticeLearner, m: NoticeMeeting) {
  const about = learner ? ` about ${fullName(learner)}` : "";
  const lines = [
    "Dear parent/guardian,",
    "",
    `${school.name} would like to meet with you${about}.`,
    "",
    `Meeting: ${m.title}`,
    `When: ${formatMeetingWhen(m.scheduledAt, school.timezone)} (${m.durationMinutes} minutes)`,
    `Where: ${whereLine(m)}`,
  ];
  if (m.purpose) lines.push(`Purpose: ${m.purpose}`);
  lines.push("", "Please reply to confirm that you can attend, or let us know a better time.", "", signOff(school));
  return { subject: `Meeting request: ${m.title}`, text: lines.join("\n") };
}

export function meetingRescheduledText(
  school: NoticeSchool,
  learner: NoticeLearner,
  m: NoticeMeeting,
  previous: Date,
) {
  const about = learner ? ` about ${fullName(learner)}` : "";
  const lines = [
    "Dear parent/guardian,",
    "",
    `The meeting with ${school.name}${about} has moved to a new time.`,
    "",
    `Meeting: ${m.title}`,
    `New time: ${formatMeetingWhen(m.scheduledAt, school.timezone)} (${m.durationMinutes} minutes)`,
    `Previously: ${formatMeetingWhen(previous, school.timezone)}`,
    `Where: ${whereLine(m)}`,
    "",
    "Please reply to confirm that you can attend, or let us know a better time.",
    "",
    signOff(school),
  ];
  return { subject: `Meeting moved: ${m.title}`, text: lines.join("\n") };
}

export function meetingCancelledText(
  school: NoticeSchool,
  learner: NoticeLearner,
  m: NoticeMeeting,
  reason: string | undefined,
) {
  const about = learner ? ` about ${fullName(learner)}` : "";
  const lines = [
    "Dear parent/guardian,",
    "",
    `The meeting with ${school.name}${about} on ${formatMeetingWhen(m.scheduledAt, school.timezone)} has been cancelled.`,
  ];
  if (reason) lines.push("", `Reason: ${reason}`);
  lines.push("", "We will contact you if a new time is needed. We apologise for any inconvenience.", "", signOff(school));
  return { subject: `Meeting cancelled: ${m.title}`, text: lines.join("\n") };
}
