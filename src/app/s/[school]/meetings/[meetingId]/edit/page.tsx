import { notFound } from "next/navigation";
import { NoAccess, PageHeader } from "@/components/ui";
import { can, getSchoolContext } from "@/lib/auth/context";
import { fullName } from "@/lib/format";
import { isUuid } from "@/lib/ids";
import { RELATIONSHIP_LABELS } from "@/lib/validation/people";
import { getMeeting, listActiveStaff, listAttendees, staffName } from "@/server/meetings";
import { guardianName } from "@/server/messages";
import { listLearnerGuardians } from "@/server/school-data";
import { updateMeeting } from "../../actions";
import { MeetingForm, type GuardianOption } from "../../meeting-form";

export const metadata = { title: "Edit meeting" };

export default async function EditMeetingPage({ params }: PageProps<"/s/[school]/meetings/[meetingId]/edit">) {
  const { school: slug, meetingId } = await params;
  const ctx = await getSchoolContext(slug);
  if (!can(ctx, "meetings.manage")) return <NoAccess />;
  if (!isUuid(meetingId)) notFound();
  const schoolId = ctx.school.id;
  const row = await getMeeting(schoolId, meetingId);
  if (!row) notFound();
  const { meeting, learner } = row;

  const [attendees, links, staff] = await Promise.all([
    listAttendees(schoolId, meetingId),
    learner ? listLearnerGuardians(schoolId, learner.id) : Promise.resolve([]),
    listActiveStaff(schoolId),
  ]);
  const attendingGuardians = new Set(attendees.flatMap((a) => (a.guardianId ? [a.guardianId] : [])));
  const attendingStaff = attendees.flatMap((a) => (a.staffId ? [a.staffId] : []));

  const guardians: GuardianOption[] = links.map(({ guardian, link }) => ({
    id: guardian.id,
    name: guardianName(guardian),
    detail: RELATIONSHIP_LABELS[link.relationship],
    channelLabel: "",
    checked: attendingGuardians.has(guardian.id),
  }));
  // Keep attendees who are no longer linked to the learner selectable.
  for (const a of attendees) {
    if (a.guardianId && !links.some((l) => l.guardian.id === a.guardianId) && a.guardianFirstName && a.guardianLastName) {
      guardians.push({
        id: a.guardianId,
        name: guardianName({ title: a.guardianTitle, firstName: a.guardianFirstName, lastName: a.guardianLastName }),
        detail: "not linked to this learner",
        channelLabel: "",
        checked: true,
      });
    }
  }
  const staffOptions = staff.map((s) => ({ id: s.id, name: staffName(s) }));
  for (const a of attendees) {
    if (a.staffId && !staffOptions.some((s) => s.id === a.staffId) && a.staffFirstName && a.staffLastName) {
      staffOptions.push({ id: a.staffId, name: staffName({ firstName: a.staffFirstName, lastName: a.staffLastName }) });
    }
  }
  if (meeting.organiserStaffId && row.organiser && !staffOptions.some((s) => s.id === meeting.organiserStaffId)) {
    staffOptions.push({ id: row.organiser.id, name: staffName(row.organiser) });
  }

  return (
    <>
      <PageHeader
        title={`Edit ${meeting.title}`}
        description={
          (learner ? `About ${fullName(learner)}. ` : "") +
          "Changing the time? Use Reschedule on the meeting page so parents are told."
        }
        back={{ href: `/s/${slug}/meetings/${meetingId}`, label: "Back to meeting" }}
      />
      <MeetingForm
        action={updateMeeting.bind(null, slug, meetingId)}
        learner={learner ? { id: learner.id, name: fullName(learner) } : null}
        guardians={guardians}
        staff={staffOptions}
        selectedStaffIds={attendingStaff}
        organiserStaffId={meeting.organiserStaffId}
        meeting={{
          title: meeting.title,
          purpose: meeting.purpose,
          durationMinutes: meeting.durationMinutes,
          location: meeting.location,
          mode: meeting.mode,
        }}
        submitLabel="Save changes"
      />
    </>
  );
}
