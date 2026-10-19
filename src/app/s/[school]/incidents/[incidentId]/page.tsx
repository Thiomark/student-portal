import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, DefinitionList, NoAccess, PageHeader, Section } from "@/components/ui";
import { can, getSchoolContext } from "@/lib/auth/context";
import { formatDate, formatDateTime, fullName } from "@/lib/format";
import { isUuid } from "@/lib/ids";
import { chooseRoute, CHANNEL_LABELS } from "@/lib/messaging/channel";
import { INCIDENT_CATEGORY_LABELS } from "@/lib/validation/incidents";
import { canEditIncident, canNotifyIncident, getIncident, listIncidentMessages } from "@/server/incidents";
import { listContacts, listLearnerGuardians } from "@/server/school-data";
import { notifyIncidentGuardians, reopenIncidentForm, resolveIncident } from "../actions";
import { NotifyForm, ResolveForm } from "../forms";

const SEVERITY_TONE = { low: "gray", medium: "amber", high: "red" } as const;

export default async function IncidentPage({ params }: PageProps<"/s/[school]/incidents/[incidentId]">) {
  const { school: slug, incidentId } = await params;
  const ctx = await getSchoolContext(slug);
  if (!can(ctx, "incidents.view")) return <NoAccess />;
  if (!isUuid(incidentId)) notFound();

  const schoolId = ctx.school.id;
  const tz = ctx.school.timezone;
  const row = await getIncident(schoolId, incidentId);
  if (!row) notFound();
  const { incident, learner, reporter, className } = row;

  const editable = canEditIncident(ctx, incident);
  const notifiable = canNotifyIncident(ctx, incident);
  const [messages, links] = await Promise.all([
    listIncidentMessages(schoolId, incidentId),
    notifiable ? listLearnerGuardians(schoolId, learner.id) : Promise.resolve([]),
  ]);
  const recipients = links.filter((l) => l.link.receivesNotices);
  const contacts = await listContacts(
    schoolId,
    recipients.map((r) => r.guardian.id),
  );

  const base = `/s/${slug}`;
  const learnerName = fullName(learner);
  const category = INCIDENT_CATEGORY_LABELS[incident.category];
  const defaultText = [
    "Dear parent/guardian,",
    `We would like to let you know about an incident involving ${learnerName} on ${formatDateTime(incident.occurredAt, tz)} (${category.toLowerCase()}).`,
    incident.actionTaken ? `Action taken: ${incident.actionTaken}` : null,
    "Please contact the school if you have any questions.",
    ctx.school.name,
  ]
    .filter(Boolean)
    .join("\n\n");

  return (
    <>
      <PageHeader
        title={`${category}: ${learnerName}`}
        description={[formatDateTime(incident.occurredAt, tz), className ? `Class ${className}` : null]
          .filter(Boolean)
          .join(" · ")}
        back={{ href: `${base}/incidents`, label: "Incidents" }}
        actions={
          <>
            {editable ? (
              <Link href={`${base}/incidents/${incidentId}/edit`} className="btn-secondary">
                Edit
              </Link>
            ) : null}
            {incident.status === "resolved" && can(ctx, "incidents.manage") ? (
              <form action={reopenIncidentForm.bind(null, slug, incidentId)}>
                <button className="btn-secondary">Reopen</button>
              </form>
            ) : null}
          </>
        }
      />

      <Section title="Details">
        <DefinitionList
          items={[
            [
              "Learner",
              can(ctx, "learners.view") ? (
                <Link key="l" href={`${base}/learners/${learner.id}`} className="link">
                  {learnerName}
                </Link>
              ) : (
                learnerName
              ),
            ],
            [
              "Status",
              <Badge key="s" tone={incident.status === "open" ? "amber" : "green"}>
                {incident.status}
              </Badge>,
            ],
            ["Category", category],
            [
              "Severity",
              <Badge key="v" tone={SEVERITY_TONE[incident.severity]}>
                {incident.severity}
              </Badge>,
            ],
            ["Reported by", reporter?.firstName ? `${reporter.firstName} ${reporter.lastName}` : null],
            ["Recorded", formatDate(incident.createdAt, tz)],
            ["Parents notified", incident.guardianNotifiedAt ? formatDateTime(incident.guardianNotifiedAt, tz) : "Not yet"],
          ]}
        />
        <div className="mt-4 space-y-3 text-sm">
          <div>
            <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">What happened</p>
            <p className="mt-0.5 whitespace-pre-line">{incident.description}</p>
          </div>
          <div>
            <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">Action taken</p>
            <p className="mt-0.5 whitespace-pre-line">
              {incident.actionTaken ?? <span className="text-slate-400">—</span>}
            </p>
          </div>
        </div>
      </Section>

      {incident.status === "open" && editable ? (
        <Section title="Resolve">
          <ResolveForm action={resolveIncident.bind(null, slug, incidentId)} actionTaken={incident.actionTaken} />
        </Section>
      ) : null}

      {notifiable ? (
        <Section title="Notify parents">
          {recipients.length === 0 ? (
            <p className="text-sm text-slate-600">No parent or guardian of this learner is set to receive notices.</p>
          ) : (
            <>
              <ul className="mb-4 space-y-1 text-sm">
                {recipients.map(({ guardian }) => {
                  const route = chooseRoute(
                    contacts.filter((c) => c.guardianId === guardian.id),
                    guardian.preferredChannel,
                  );
                  return (
                    <li key={guardian.id}>
                      {[guardian.title, guardian.firstName, guardian.lastName].filter(Boolean).join(" ")}{" "}
                      <span className="text-slate-500">by {CHANNEL_LABELS[route.channel]}</span>
                    </li>
                  );
                })}
              </ul>
              <NotifyForm
                action={notifyIncidentGuardians.bind(null, slug, incidentId)}
                subject={`Incident report: ${learnerName}`}
                text={defaultText}
                alreadyNotified={Boolean(incident.guardianNotifiedAt)}
              />
            </>
          )}
        </Section>
      ) : null}

      <Section title="Messages sent">
        {messages.length === 0 ? (
          <p className="text-sm text-slate-600">No messages sent about this incident.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {messages.map((m) => (
              <li key={m.id}>
                <span className="text-slate-500">{formatDateTime(m.createdAt, tz)}</span>{" "}
                <span className="font-medium">
                  {m.guardianFirstName ? `${m.guardianFirstName} ${m.guardianLastName}` : "—"}
                </span>{" "}
                <Badge>{CHANNEL_LABELS[m.channel]}</Badge>{" "}
                <Badge tone={m.status === "failed" ? "red" : m.status === "needs_action" ? "amber" : "green"}>
                  {m.status.replace("_", " ")}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
