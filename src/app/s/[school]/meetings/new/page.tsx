import Link from "next/link";
import { NoAccess, PageHeader, Section } from "@/components/ui";
import { can, getSchoolContext } from "@/lib/auth/context";
import { fullName } from "@/lib/format";
import { isUuid } from "@/lib/ids";
import { CHANNEL_LABELS } from "@/lib/messaging/channel";
import { RELATIONSHIP_LABELS } from "@/lib/validation/people";
import { listActiveStaff, staffName } from "@/server/meetings";
import { expectedRoutes, guardianName } from "@/server/messages";
import { getLearner, listLearnerGuardians, listLearners } from "@/server/school-data";
import { createMeeting } from "../actions";
import { MeetingForm, type GuardianOption } from "../meeting-form";

export const metadata = { title: "Schedule meeting" };

export default async function NewMeetingPage({ params, searchParams }: PageProps<"/s/[school]/meetings/new">) {
  const { school: slug } = await params;
  const sp = await searchParams;
  const ctx = await getSchoolContext(slug);
  if (!can(ctx, "meetings.manage")) return <NoAccess />;
  const schoolId = ctx.school.id;
  const base = `/s/${slug}/meetings`;

  const learnerRow = isUuid(sp.learner) ? await getLearner(schoolId, sp.learner) : null;
  const q = !learnerRow && typeof sp.q === "string" ? sp.q.trim() : "";

  const [links, staff, search] = await Promise.all([
    learnerRow ? listLearnerGuardians(schoolId, learnerRow.learner.id) : Promise.resolve([]),
    listActiveStaff(schoolId),
    q ? listLearners(schoolId, { q, status: "active" }) : Promise.resolve(null),
  ]);
  const routes = await expectedRoutes(
    schoolId,
    links.map((l) => l.guardian.id),
  );
  const guardians: GuardianOption[] = links.map(({ guardian, link }) => {
    const channel = routes.get(guardian.id);
    return {
      id: guardian.id,
      name: guardianName(guardian),
      detail: [RELATIONSHIP_LABELS[link.relationship], link.receivesNotices ? null : "no notices"]
        .filter(Boolean)
        .join(", "),
      channelLabel: channel ? `Notice by ${CHANNEL_LABELS[channel]}` : "",
      checked: link.receivesNotices,
    };
  });
  const learner = learnerRow
    ? {
        id: learnerRow.learner.id,
        name: `${fullName(learnerRow.learner)}${learnerRow.className ? ` (${learnerRow.className})` : ""}`,
      }
    : null;

  return (
    <>
      <PageHeader
        title={learner ? `Schedule a meeting about ${learner.name}` : "Schedule meeting"}
        back={
          learnerRow
            ? { href: `/s/${slug}/learners/${learnerRow.learner.id}`, label: "Back to learner" }
            : { href: base, label: "Meetings" }
        }
      />

      <Section
        title="Learner"
        actions={
          learner ? (
            <Link href={`${base}/new`} className="text-sm text-slate-600 hover:underline">
              Change
            </Link>
          ) : null
        }
      >
        {learner ? (
          <p className="text-sm font-medium">{learner.name}</p>
        ) : (
          <>
            <form className="flex gap-2" role="search">
              <input
                name="q"
                defaultValue={q}
                placeholder="Search learner by name or admission number"
                className="input max-w-sm"
                autoFocus
              />
              <button className="btn-secondary">Search</button>
            </form>
            {search ? (
              search.rows.length === 0 ? (
                <p className="mt-3 text-sm text-slate-600">No active learners match.</p>
              ) : (
                <ul className="mt-3 divide-y divide-slate-100 text-sm">
                  {search.rows.slice(0, 20).map((l) => (
                    <li key={l.id} className="py-1.5">
                      <Link href={`${base}/new?learner=${l.id}`} className="link font-medium">
                        {fullName(l)}
                      </Link>{" "}
                      <span className="text-slate-500">
                        {[l.className, l.admissionNumber].filter(Boolean).join(" · ")}
                      </span>
                    </li>
                  ))}
                </ul>
              )
            ) : (
              <p className="mt-2 text-xs text-slate-500">
                Optional. Pick a learner to invite their parents, or schedule a staff-only meeting below.
              </p>
            )}
          </>
        )}
      </Section>

      <MeetingForm
        action={createMeeting.bind(null, slug)}
        learner={learner}
        guardians={guardians}
        staff={staff.map((s) => ({ id: s.id, name: staffName(s) }))}
        organiserStaffId={ctx.membership.staffId}
        schedule={{}}
        submitLabel="Schedule meeting"
      />
    </>
  );
}
