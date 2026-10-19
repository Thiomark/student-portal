import "server-only";
import { and, asc, desc, eq, gte, isNull, lt, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import type { SchoolContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/context";
import { localInputToDate } from "@/lib/format";
import type { IncidentCategory, IncidentSeverity } from "@/lib/validation/incidents";
import { getCurrentYear, PAGE_SIZE } from "@/server/school-data";

const { incidents, learners, enrolments, classGroups, staff, messages, guardians } = schema;

function currentClassJoin(yearId: string | null) {
  return and(
    eq(enrolments.learnerId, learners.id),
    isNull(enrolments.endedOn),
    yearId ? eq(enrolments.academicYearId, yearId) : sql`false`,
  );
}

export type IncidentFilters = {
  status?: "open" | "resolved";
  category?: IncidentCategory;
  severity?: IncidentSeverity;
  classGroupId?: string;
  // YYYY-MM-DD in the school's timezone, inclusive.
  from?: string;
  to?: string;
  page?: number;
};

export async function listIncidents(schoolId: string, timeZone: string, opts: IncidentFilters) {
  const year = await getCurrentYear(schoolId);
  const where: SQL[] = [eq(incidents.schoolId, schoolId), isNull(incidents.deletedAt)];
  if (opts.status) where.push(eq(incidents.status, opts.status));
  if (opts.category) where.push(eq(incidents.category, opts.category));
  if (opts.severity) where.push(eq(incidents.severity, opts.severity));
  if (opts.classGroupId) where.push(eq(enrolments.classGroupId, opts.classGroupId));
  if (opts.from) where.push(gte(incidents.occurredAt, localInputToDate(`${opts.from}T00:00`, timeZone)));
  if (opts.to) where.push(lt(incidents.occurredAt, localInputToDate(`${nextDay(opts.to)}T00:00`, timeZone)));

  const page = Math.max(1, opts.page ?? 1);
  const rows = await getDb()
    .select({
      id: incidents.id,
      occurredAt: incidents.occurredAt,
      category: incidents.category,
      severity: incidents.severity,
      status: incidents.status,
      guardianNotifiedAt: incidents.guardianNotifiedAt,
      learnerId: learners.id,
      firstName: learners.firstName,
      lastName: learners.lastName,
      preferredName: learners.preferredName,
      className: classGroups.name,
      reporterFirstName: staff.firstName,
      reporterLastName: staff.lastName,
    })
    .from(incidents)
    .innerJoin(learners, and(eq(learners.id, incidents.learnerId), eq(learners.schoolId, schoolId)))
    .leftJoin(enrolments, currentClassJoin(year?.id ?? null))
    .leftJoin(classGroups, eq(classGroups.id, enrolments.classGroupId))
    .leftJoin(staff, and(eq(staff.id, incidents.reportedByStaffId), eq(staff.schoolId, schoolId)))
    .where(and(...where))
    .orderBy(desc(incidents.occurredAt), desc(incidents.id))
    .limit(PAGE_SIZE + 1)
    .offset((page - 1) * PAGE_SIZE);

  return { rows: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE, page };
}

export async function getIncident(schoolId: string, incidentId: string) {
  const year = await getCurrentYear(schoolId);
  const [row] = await getDb()
    .select({
      incident: incidents,
      learner: {
        id: learners.id,
        firstName: learners.firstName,
        lastName: learners.lastName,
        preferredName: learners.preferredName,
      },
      className: classGroups.name,
      reporter: { firstName: staff.firstName, lastName: staff.lastName, title: staff.title },
    })
    .from(incidents)
    .innerJoin(learners, and(eq(learners.id, incidents.learnerId), eq(learners.schoolId, schoolId)))
    .leftJoin(enrolments, currentClassJoin(year?.id ?? null))
    .leftJoin(classGroups, eq(classGroups.id, enrolments.classGroupId))
    .leftJoin(staff, and(eq(staff.id, incidents.reportedByStaffId), eq(staff.schoolId, schoolId)))
    .where(and(eq(incidents.schoolId, schoolId), eq(incidents.id, incidentId), isNull(incidents.deletedAt)))
    .limit(1);
  return row ?? null;
}

export async function listIncidentMessages(schoolId: string, incidentId: string) {
  return getDb()
    .select({
      id: messages.id,
      channel: messages.channel,
      status: messages.status,
      subject: messages.subject,
      createdAt: messages.createdAt,
      sentAt: messages.sentAt,
      guardianId: guardians.id,
      guardianFirstName: guardians.firstName,
      guardianLastName: guardians.lastName,
    })
    .from(messages)
    .leftJoin(guardians, and(eq(guardians.id, messages.guardianId), eq(guardians.schoolId, schoolId)))
    .where(
      and(eq(messages.schoolId, schoolId), eq(messages.relatedType, "incident"), eq(messages.relatedId, incidentId)),
    )
    .orderBy(asc(messages.createdAt));
}

type IncidentAccessRow = { reportedByStaffId: string | null; status: "open" | "resolved" };

function isReporter(ctx: SchoolContext, incident: IncidentAccessRow): boolean {
  return (
    can(ctx, "incidents.report") &&
    ctx.membership.staffId !== null &&
    incident.reportedByStaffId === ctx.membership.staffId
  );
}

// Managers edit anything; a reporter may edit (and resolve) their own report
// while it is still open.
export function canEditIncident(ctx: SchoolContext, incident: IncidentAccessRow): boolean {
  return can(ctx, "incidents.manage") || (incident.status === "open" && isReporter(ctx, incident));
}

// Telling the parents is open to managers and to whoever reported it.
export function canNotifyIncident(ctx: SchoolContext, incident: IncidentAccessRow): boolean {
  return can(ctx, "incidents.manage") || isReporter(ctx, incident);
}

function nextDay(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
