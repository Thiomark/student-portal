import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Badge, DefinitionList, NoAccess, PageHeader, Section } from "@/components/ui";
import { can, getSchoolContext } from "@/lib/auth/context";
import { formatDateTime, fullName, toLocalInput } from "@/lib/format";
import { isUuid } from "@/lib/ids";
import { CHANNEL_LABELS } from "@/lib/messaging/channel";
import { MEETING_MODE_LABELS, MEETING_STATUS_LABELS } from "@/lib/validation/meetings";
import { MESSAGE_STATUS_LABELS, MESSAGE_STATUS_TONES } from "@/lib/validation/messages";
import {
  formatMeetingWhen,
  getMeeting,
  listAttendees,
  listMeetingMessages,
  staffName,
} from "@/server/meetings";
import { cancelMeeting, markNoShow, rescheduleMeeting, saveMinutes, setAttendeeResponse } from "../actions";

const STATUS_TONE = { scheduled: "blue", completed: "green", cancelled: "gray", no_show: "red" } as const;
const RESPONSE_TONE = { pending: "amber", accepted: "green", declined: "red" } as const;
export default async function MeetingPage({ params }: PageProps<"/s/[school]/meetings/[meetingId]">) {
  const { school: slug, meetingId } = await params;
  const ctx = await getSchoolContext(slug);
  if (!can(ctx, "meetings.view")) return <NoAccess />;
  if (!isUuid(meetingId)) notFound();

  const schoolId = ctx.school.id;
  const tz = ctx.school.timezone;
  const row = await getMeeting(schoolId, meetingId);
  if (!row) notFound();
  const { meeting, learner, organiser } = row;
  const [attendees, messages] = await Promise.all([
    listAttendees(schoolId, meetingId),
    listMeetingMessages(schoolId, meetingId),
  ]);

  const base = `/s/${slug}`;
  const manage = can(ctx, "meetings.manage");
  const canMessages = can(ctx, "messages.send");
  const canGuardians = can(ctx, "guardians.view");
  const open = meeting.status === "scheduled" || meeting.status === "no_show";
  const needsAction = messages.filter((m) => m.status === "needs_action").length;
  const failed = messages.filter((m) => m.status === "failed").length;

  return (
    <>
      <PageHeader
        title={meeting.title}
        description={
          <>
            {formatMeetingWhen(meeting.scheduledAt, tz)} ·{" "}
            <Badge tone={STATUS_TONE[meeting.status]}>{MEETING_STATUS_LABELS[meeting.status]}</Badge>
          </>
        }
        back={{ href: `${base}/meetings`, label: "Meetings" }}
        actions={
          manage && meeting.status !== "cancelled" ? (
            <Link href={`${base}/meetings/${meetingId}/edit`} className="btn-secondary">
              Edit
            </Link>
          ) : null
        }
      />

      {needsAction || failed ? (
        <div role="status" className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {needsAction ? (
            <p>
              {needsAction} {needsAction === 1 ? "parent" : "parents"} could not be reached automatically. The office
              must phone them or print a letter for the learner to take home.
            </p>
          ) : null}
          {failed ? (
            <p>
              {failed} {failed === 1 ? "message" : "messages"} failed to send. Retry from Messages, or phone the parent.
            </p>
          ) : null}
          {canMessages ? (
            <Link href={`${base}/messages?status=${needsAction ? "needs_action" : "failed"}`} className="link font-medium">
              Open the office to-do list →
            </Link>
          ) : null}
        </div>
      ) : null}

      <Section title="Details">
        <DefinitionList
          items={[
            ["When", `${formatDateTime(meeting.scheduledAt, tz)} (${meeting.durationMinutes} min)`],
            ["How", MEETING_MODE_LABELS[meeting.mode]],
            ["Location", meeting.location],
            [
              "Learner",
              learner ? (
                <Link key="l" href={`${base}/learners/${learner.id}`} className="link">
                  {fullName(learner)}
                </Link>
              ) : null,
            ],
            ["Organiser", organiser ? staffName(organiser) : null],
            ["Purpose", meeting.purpose ? <span key="p" className="whitespace-pre-wrap">{meeting.purpose}</span> : null],
          ]}
        />
      </Section>

      <Section title="Attendees">
        {attendees.length === 0 ? (
          <p className="text-sm text-slate-600">No attendees recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Response</th>
                  <th>Attended</th>
                  {manage ? <th>Update</th> : null}
                </tr>
              </thead>
              <tbody>
                {attendees.map((a) => {
                  const isGuardian = Boolean(a.guardianId);
                  const name = isGuardian
                    ? [a.guardianTitle, a.guardianFirstName, a.guardianLastName].filter(Boolean).join(" ")
                    : [a.staffTitle, a.staffFirstName, a.staffLastName].filter(Boolean).join(" ");
                  return (
                    <tr key={a.id}>
                      <td>
                        {isGuardian && canGuardians ? (
                          <Link href={`${base}/guardians/${a.guardianId}`} className="link font-medium">
                            {name}
                          </Link>
                        ) : (
                          <span className="font-medium">{name || "—"}</span>
                        )}
                        <span className="block text-xs text-slate-500">
                          {isGuardian ? "Parent" : (a.staffPosition ?? "Staff")}
                        </span>
                      </td>
                      <td>
                        <Badge tone={RESPONSE_TONE[a.response]}>{a.response}</Badge>
                      </td>
                      <td>{a.attended === null ? "—" : a.attended ? "Yes" : "No"}</td>
                      {manage ? (
                        <td>
                          <ActionForm
                            action={setAttendeeResponse.bind(null, slug, meetingId, a.id)}
                            className="flex flex-wrap items-center gap-2"
                          >
                            <select
                              name="response"
                              defaultValue={a.response}
                              className="input w-auto py-1"
                              aria-label={`Response from ${name}`}
                            >
                              <option value="pending">Pending</option>
                              <option value="accepted">Accepted</option>
                              <option value="declined">Declined</option>
                            </select>
                            <select
                              name="attended"
                              defaultValue={a.attended === null ? "unknown" : a.attended ? "yes" : "no"}
                              className="input w-auto py-1"
                              aria-label={`Did ${name} attend?`}
                            >
                              <option value="unknown">Attended?</option>
                              <option value="yes">Attended</option>
                              <option value="no">Did not attend</option>
                            </select>
                            <button className="btn-secondary py-1">Save</button>
                          </ActionForm>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {manage ? (
              <p className="mt-2 text-xs text-slate-500">
                When a parent replies by WhatsApp, phone or in person, record their answer here.
              </p>
            ) : null}
          </div>
        )}
      </Section>

      <Section title="Messages to parents">
        {messages.length === 0 ? (
          <p className="text-sm text-slate-600">No messages sent for this meeting.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Parent</th>
                  <th>Message</th>
                  <th>Channel</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {messages.map((m) => (
                  <tr key={m.id}>
                    <td>
                      {m.guardianFirstName && m.guardianLastName
                        ? `${m.guardianFirstName} ${m.guardianLastName}`
                        : "—"}
                    </td>
                    <td>
                      {canMessages ? (
                        <Link href={`${base}/messages/${m.id}`} className="link">
                          {m.subject ?? "(no subject)"}
                        </Link>
                      ) : (
                        (m.subject ?? "(no subject)")
                      )}
                    </td>
                    <td>{CHANNEL_LABELS[m.channel]}</td>
                    <td>
                      <Badge tone={MESSAGE_STATUS_TONES[m.status]}>{MESSAGE_STATUS_LABELS[m.status]}</Badge>
                      {m.status === "needs_action" ? (
                        <span className="block text-xs text-amber-800">
                          {m.channel === "letter" ? "Print a letter" : m.channel === "call" ? "Phone the parent" : "Send by hand"}
                        </span>
                      ) : null}
                      {m.status === "failed" && m.error ? (
                        <span className="block text-xs text-red-700">{m.error}</span>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap">{formatDateTime(m.createdAt, tz)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Minutes">
        {manage ? (
          <ActionForm action={saveMinutes.bind(null, slug, meetingId)} className="space-y-3">
            <textarea
              name="minutes"
              rows={6}
              className="input"
              defaultValue={meeting.minutes ?? ""}
              aria-label="Minutes"
              placeholder="What was discussed and agreed, and any follow-up."
            />
            <div className="flex flex-wrap gap-2">
              <button name="intent" value="save" className="btn-secondary">
                Save minutes
              </button>
              {open ? (
                <button name="intent" value="complete" className="btn-primary">
                  Save and mark completed
                </button>
              ) : null}
            </div>
          </ActionForm>
        ) : meeting.minutes ? (
          <p className="text-sm whitespace-pre-wrap">{meeting.minutes}</p>
        ) : (
          <p className="text-sm text-slate-600">No minutes recorded.</p>
        )}
      </Section>

      {manage && meeting.status !== "completed" ? (
        <Section title="Change status">
          <div className="grid gap-6 md:grid-cols-2">
            <ActionForm action={rescheduleMeeting.bind(null, slug, meetingId)} className="space-y-2">
              <h3 className="text-sm font-semibold">Reschedule</h3>
              <label htmlFor="reschedule-at" className="label">
                New date and time
              </label>
              <input
                id="reschedule-at"
                name="scheduledAt"
                type="datetime-local"
                className="input"
                required
                defaultValue={toLocalInput(meeting.scheduledAt, tz)}
              />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="notify" defaultChecked /> Notify parents of the new time
              </label>
              <button className="btn-secondary">Reschedule</button>
            </ActionForm>

            {meeting.status === "scheduled" ? (
              <div className="space-y-6">
                <ActionForm action={cancelMeeting.bind(null, slug, meetingId)} className="space-y-2">
                  <h3 className="text-sm font-semibold">Cancel</h3>
                  <label htmlFor="cancel-reason" className="label">
                    Reason (sent to parents)
                  </label>
                  <input id="cancel-reason" name="reason" className="input" maxLength={500} />
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="notify" defaultChecked /> Notify parents of the cancellation
                  </label>
                  <button className="btn-danger">Cancel meeting</button>
                </ActionForm>
                <ActionForm action={markNoShow.bind(null, slug, meetingId)} className="space-y-2">
                  <h3 className="text-sm font-semibold">Parents did not come</h3>
                  <button className="btn-secondary">Mark as no-show</button>
                </ActionForm>
              </div>
            ) : null}
          </div>
        </Section>
      ) : null}
    </>
  );
}
