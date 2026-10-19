import { and, desc, eq, gte, isNull } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ContactList } from "@/components/contacts";
import { Badge, DefinitionList, NoAccess, PageHeader, Section } from "@/components/ui";
import { getDb, schema } from "@/db/client";
import { can, getSchoolContext } from "@/lib/auth/context";
import { formatDate, formatDateTime, fullName, schoolToday, shiftDate } from "@/lib/format";
import { isUuid } from "@/lib/ids";
import { RELATIONSHIP_LABELS } from "@/lib/validation/people";
import { getLearner, listContacts, listLearnerGuardians } from "@/server/school-data";
import { unlinkGuardianForm } from "../../guardians/actions";
import { DeleteLearnerButton } from "./delete-button";

export default async function LearnerPage({ params }: PageProps<"/s/[school]/learners/[learnerId]">) {
  const { school: slug, learnerId } = await params;
  const ctx = await getSchoolContext(slug);
  if (!can(ctx, "learners.view")) return <NoAccess />;
  if (!isUuid(learnerId)) notFound();

  const schoolId = ctx.school.id;
  const tz = ctx.school.timezone;
  const row = await getLearner(schoolId, learnerId);
  if (!row) notFound();
  const { learner } = row;
  const db = getDb();

  const since = shiftDate(schoolToday(tz), -90);
  const [links, loans, incidents, meetings, attendance] = await Promise.all([
    can(ctx, "guardians.view") ? listLearnerGuardians(schoolId, learnerId) : Promise.resolve([]),
    can(ctx, "textbooks.view")
      ? db
          .select({
            id: schema.textbookLoans.id,
            copyNumber: schema.textbookCopies.copyNumber,
            title: schema.textbookTitles.title,
            issuedAt: schema.textbookLoans.issuedAt,
            returnedAt: schema.textbookLoans.returnedAt,
            conditionOut: schema.textbookLoans.conditionOut,
            conditionIn: schema.textbookLoans.conditionIn,
            outcome: schema.textbookLoans.outcome,
          })
          .from(schema.textbookLoans)
          .innerJoin(schema.textbookCopies, eq(schema.textbookCopies.id, schema.textbookLoans.copyId))
          .innerJoin(schema.textbookTitles, eq(schema.textbookTitles.id, schema.textbookCopies.titleId))
          .where(and(eq(schema.textbookLoans.schoolId, schoolId), eq(schema.textbookLoans.learnerId, learnerId)))
          .orderBy(desc(schema.textbookLoans.issuedAt))
          .limit(50)
      : Promise.resolve([]),
    can(ctx, "incidents.view")
      ? db
          .select()
          .from(schema.incidents)
          .where(
            and(
              eq(schema.incidents.schoolId, schoolId),
              eq(schema.incidents.learnerId, learnerId),
              isNull(schema.incidents.deletedAt),
            ),
          )
          .orderBy(desc(schema.incidents.occurredAt))
          .limit(20)
      : Promise.resolve([]),
    can(ctx, "meetings.view")
      ? db
          .select()
          .from(schema.meetings)
          .where(
            and(
              eq(schema.meetings.schoolId, schoolId),
              eq(schema.meetings.learnerId, learnerId),
              isNull(schema.meetings.deletedAt),
            ),
          )
          .orderBy(desc(schema.meetings.scheduledAt))
          .limit(20)
      : Promise.resolve([]),
    can(ctx, "attendance.view")
      ? db
          .select({
            date: schema.attendanceRecords.date,
            status: schema.attendanceRecords.status,
            reason: schema.attendanceRecords.reason,
          })
          .from(schema.attendanceRecords)
          .where(
            and(
              eq(schema.attendanceRecords.schoolId, schoolId),
              eq(schema.attendanceRecords.learnerId, learnerId),
              gte(schema.attendanceRecords.date, since),
            ),
          )
          .orderBy(desc(schema.attendanceRecords.date))
      : Promise.resolve([]),
  ]);
  const contacts = await listContacts(
    schoolId,
    links.map((l) => l.guardian.id),
  );

  const base = `/s/${slug}`;
  const manageGuardians = can(ctx, "guardians.manage");
  const openLoans = loans.filter((l) => !l.returnedAt);

  return (
    <>
      <PageHeader
        title={fullName(learner)}
        description={[row.className ? `Class ${row.className}` : "Not in a class", learner.admissionNumber]
          .filter(Boolean)
          .join(" · ")}
        back={{ href: `${base}/learners`, label: "Learners" }}
        actions={
          can(ctx, "learners.manage") ? (
            <>
              <Link href={`${base}/learners/${learnerId}/edit`} className="btn-secondary">
                Edit
              </Link>
              <DeleteLearnerButton slug={slug} learnerId={learnerId} />
            </>
          ) : null
        }
      />

      <Section title="Details">
        <DefinitionList
          items={[
            ["Status", <Badge key="s">{learner.status}</Badge>],
            ["Date of birth", learner.dateOfBirth ? formatDate(learner.dateOfBirth, tz) : null],
            ["Gender", learner.gender],
            ["Home language", learner.homeLanguage],
            ["Medical notes", learner.medicalNotes],
            ["Notes", learner.notes],
          ]}
        />
      </Section>

      {can(ctx, "guardians.view") ? (
        <Section
          title="Parents & guardians"
          actions={
            manageGuardians ? (
              <div className="flex gap-2">
                <Link href={`${base}/learners/${learnerId}/link-guardian`} className="btn-secondary">
                  Link existing
                </Link>
                <Link href={`${base}/guardians/new?learner=${learnerId}`} className="btn-primary">
                  Add new
                </Link>
              </div>
            ) : null
          }
        >
          {links.length === 0 ? (
            <p className="text-sm text-slate-600">No parent or guardian recorded.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {links.map(({ guardian, link }) => (
                <li key={guardian.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`${base}/guardians/${guardian.id}`} className="link font-medium">
                        {[guardian.title, guardian.firstName, guardian.lastName].filter(Boolean).join(" ")}
                      </Link>
                      <span className="text-sm text-slate-500">{RELATIONSHIP_LABELS[link.relationship]}</span>
                      {link.isPrimary ? <Badge tone="blue">Primary</Badge> : null}
                      {!link.canCollect ? <Badge tone="red">May not collect</Badge> : null}
                      {!link.receivesNotices ? <Badge>No notices</Badge> : null}
                    </div>
                    <ContactList contacts={contacts.filter((c) => c.guardianId === guardian.id)} />
                  </div>
                  {manageGuardians ? (
                    <form action={unlinkGuardianForm.bind(null, slug, learnerId, guardian.id)}>
                      <button className="text-sm text-red-700 hover:underline">Unlink</button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Section>
      ) : null}

      {can(ctx, "attendance.view") ? (
        <Section title="Attendance (last 90 days)">
          {attendance.length === 0 ? (
            <p className="text-sm text-slate-600">No registers recorded.</p>
          ) : (
            <>
              <p className="mb-2 text-sm">
                {attendance.filter((a) => a.status === "present").length} present ·{" "}
                {attendance.filter((a) => a.status === "absent").length} absent ·{" "}
                {attendance.filter((a) => a.status === "late").length} late ·{" "}
                {attendance.filter((a) => a.status === "excused").length} excused, out of {attendance.length} school
                days recorded
              </p>
              <ul className="space-y-1 text-sm">
                {attendance
                  .filter((a) => a.status !== "present")
                  .slice(0, 20)
                  .map((a) => (
                    <li key={a.date}>
                      {formatDate(`${a.date}T12:00:00Z`, tz)}{" "}
                      <Badge tone={a.status === "absent" ? "red" : a.status === "late" ? "amber" : "gray"}>{a.status}</Badge>
                      {a.reason ? <span className="text-slate-600"> {a.reason}</span> : null}
                    </li>
                  ))}
              </ul>
            </>
          )}
        </Section>
      ) : null}

      {can(ctx, "textbooks.view") ? (
        <Section title={`Textbooks (${openLoans.length} out)`}>
          {loans.length === 0 ? (
            <p className="text-sm text-slate-600">No textbooks issued.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Book</th>
                  <th>No.</th>
                  <th>Issued</th>
                  <th>Returned</th>
                  <th>Condition</th>
                </tr>
              </thead>
              <tbody>
                {loans.map((l) => (
                  <tr key={l.id}>
                    <td>{l.title}</td>
                    <td className="font-mono">{l.copyNumber}</td>
                    <td>{formatDate(l.issuedAt, tz)}</td>
                    <td>{l.returnedAt ? formatDate(l.returnedAt, tz) : <Badge tone="amber">Out</Badge>}</td>
                    <td>
                      {l.conditionOut}
                      {l.conditionIn ? ` → ${l.conditionIn}` : ""}
                      {l.outcome && l.outcome !== "returned" ? (
                        <>
                          {" "}
                          <Badge tone="red">{l.outcome}</Badge>
                        </>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      ) : null}

      {can(ctx, "incidents.view") ? (
        <Section
          title="Incidents"
          actions={
            can(ctx, "incidents.report") ? (
              <Link href={`${base}/incidents/new?learner=${learnerId}`} className="btn-secondary">
                Report incident
              </Link>
            ) : null
          }
        >
          {incidents.length === 0 ? (
            <p className="text-sm text-slate-600">No incidents recorded.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {incidents.map((i) => (
                <li key={i.id}>
                  <Link href={`${base}/incidents/${i.id}`} className="link">
                    {formatDate(i.occurredAt, tz)} · {i.category}
                  </Link>{" "}
                  <Badge tone={i.severity === "high" ? "red" : i.severity === "medium" ? "amber" : "gray"}>
                    {i.severity}
                  </Badge>{" "}
                  {i.status === "open" ? <Badge tone="amber">open</Badge> : null}
                  <p className="text-slate-600">{i.description}</p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      ) : null}

      {can(ctx, "meetings.view") ? (
        <Section
          title="Parent meetings"
          actions={
            can(ctx, "meetings.manage") ? (
              <Link href={`${base}/meetings/new?learner=${learnerId}`} className="btn-secondary">
                Schedule meeting
              </Link>
            ) : null
          }
        >
          {meetings.length === 0 ? (
            <p className="text-sm text-slate-600">No meetings.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {meetings.map((m) => (
                <li key={m.id}>
                  <Link href={`${base}/meetings/${m.id}`} className="link">
                    {formatDateTime(m.scheduledAt, tz)} · {m.title}
                  </Link>{" "}
                  <Badge>{m.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Section>
      ) : null}
    </>
  );
}
