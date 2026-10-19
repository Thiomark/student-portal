import Link from "next/link";
import { Badge, EmptyState, NoAccess, PageHeader } from "@/components/ui";
import { can, getSchoolContext } from "@/lib/auth/context";
import { formatDateTime, fullName } from "@/lib/format";
import { MEETING_MODE_LABELS, MEETING_STATUS_LABELS } from "@/lib/validation/meetings";
import { listMeetings, staffName, type MeetingTab } from "@/server/meetings";

export const metadata = { title: "Meetings" };

const TABS: { key: MeetingTab; label: string }[] = [
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past" },
  { key: "cancelled", label: "Cancelled" },
];

const STATUS_TONE = { scheduled: "blue", completed: "green", cancelled: "gray", no_show: "red" } as const;

export default async function MeetingsPage({ params, searchParams }: PageProps<"/s/[school]/meetings">) {
  const { school: slug } = await params;
  const sp = await searchParams;
  const ctx = await getSchoolContext(slug);
  if (!can(ctx, "meetings.view")) return <NoAccess />;

  const tab: MeetingTab = TABS.some((t) => t.key === sp.tab) ? (sp.tab as MeetingTab) : "upcoming";
  const page = Number(sp.page) || 1;
  const tz = ctx.school.timezone;
  const { rows, hasMore, today } = await listMeetings(ctx.school.id, tz, { tab, page });
  const base = `/s/${slug}/meetings`;
  const pageHref = (p: number) => `${base}?${new URLSearchParams({ tab, page: String(p) })}`;

  return (
    <>
      <PageHeader
        title="Parent meetings"
        actions={
          can(ctx, "meetings.manage") ? (
            <Link href={`${base}/new`} className="btn-primary">
              Schedule meeting
            </Link>
          ) : null
        }
      />
      <nav className="mb-4 flex gap-1 border-b border-slate-200" aria-label="Meeting lists">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`${base}?tab=${t.key}`}
            aria-current={t.key === tab ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              t.key === tab ? "border-brand-600 text-brand-700" : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <EmptyState title={tab === "upcoming" ? "No upcoming meetings" : `No ${tab} meetings`} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Meeting</th>
                <th>Learner</th>
                <th>Parents</th>
                <th>Status</th>
                <th>Organiser</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const overdue = m.status === "scheduled" && m.scheduledAt < today;
                return (
                  <tr key={m.id}>
                    <td className="whitespace-nowrap">{formatDateTime(m.scheduledAt, tz)}</td>
                    <td>
                      <Link href={`${base}/${m.id}`} className="link font-medium">
                        {m.title}
                      </Link>
                      <span className="block text-xs text-slate-500">
                        {MEETING_MODE_LABELS[m.mode]} · {m.durationMinutes} min
                      </span>
                    </td>
                    <td>
                      {m.learnerId && m.learnerFirstName && m.learnerLastName
                        ? fullName({
                            firstName: m.learnerFirstName,
                            lastName: m.learnerLastName,
                            preferredName: m.learnerPreferredName,
                          })
                        : "—"}
                    </td>
                    <td>{m.guardianNames ?? "—"}</td>
                    <td>
                      {overdue ? (
                        <Badge tone="amber">Needs outcome</Badge>
                      ) : (
                        <Badge tone={STATUS_TONE[m.status]}>{MEETING_STATUS_LABELS[m.status]}</Badge>
                      )}
                    </td>
                    <td>
                      {m.organiserFirstName && m.organiserLastName
                        ? staffName({ firstName: m.organiserFirstName, lastName: m.organiserLastName })
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-4 flex gap-2">
        {page > 1 ? (
          <Link href={pageHref(page - 1)} className="btn-secondary">
            Previous
          </Link>
        ) : null}
        {hasMore ? (
          <Link href={pageHref(page + 1)} className="btn-secondary">
            Next
          </Link>
        ) : null}
      </div>
    </>
  );
}
