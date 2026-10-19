import Link from "next/link";
import { Badge, EmptyState, NoAccess, PageHeader } from "@/components/ui";
import { can, getSchoolContext } from "@/lib/auth/context";
import { formatDateTime } from "@/lib/format";
import { isUuid } from "@/lib/ids";
import { CHANNEL_LABELS, type Channel } from "@/lib/messaging/channel";
import { MESSAGE_STATUSES, MESSAGE_STATUS_LABELS, MESSAGE_STATUS_TONES, type MessageStatus } from "@/lib/validation/messages";
import { countMessagesByStatus, guardianName, listDialableContacts, listMessages } from "@/server/messages";
import { markMessageDoneForm } from "./actions";

export const metadata = { title: "Messages" };

const CHANNELS = Object.keys(CHANNEL_LABELS) as Channel[];
export default async function MessagesPage({ params, searchParams }: PageProps<"/s/[school]/messages">) {
  const { school: slug } = await params;
  const sp = await searchParams;
  const ctx = await getSchoolContext(slug);
  if (!can(ctx, "messages.send")) return <NoAccess />;
  const schoolId = ctx.school.id;
  const tz = ctx.school.timezone;

  const relatedId = isUuid(sp.related) ? sp.related : "";
  const statusParam = typeof sp.status === "string" ? sp.status : relatedId ? "all" : "needs_action";
  const status = (MESSAGE_STATUSES as readonly string[]).includes(statusParam)
    ? (statusParam as MessageStatus)
    : undefined;
  const channel = CHANNELS.includes(sp.channel as Channel) ? (sp.channel as Channel) : undefined;
  const page = Number(sp.page) || 1;

  const [{ rows, hasMore }, counts] = await Promise.all([
    listMessages(schoolId, { status, channel, relatedId: relatedId || undefined, page }),
    countMessagesByStatus(schoolId),
  ]);
  const callGuardians = [
    ...new Set(
      rows.flatMap((m) =>
        m.status === "needs_action" && (m.channel === "call" || m.channel === "sms") && m.guardianId
          ? [m.guardianId]
          : [],
      ),
    ),
  ];
  const numbers = await listDialableContacts(schoolId, callGuardians);

  const base = `/s/${slug}`;
  const query = (over: Record<string, string>) =>
    `${base}/messages?${new URLSearchParams({
      status: status ?? "all",
      ...(channel ? { channel } : {}),
      ...(relatedId ? { related: relatedId } : {}),
      ...over,
    })}`;

  return (
    <>
      <PageHeader
        title="Messages"
        description="Every notice sent to parents. Work through “Needs action”: phone the parent or print the letter, then mark it done."
        actions={
          <Link href={`${base}/messages/new`} className="btn-primary">
            Message parents
          </Link>
        }
      />

      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        <Link href={`${base}/messages?status=needs_action`} className="btn-secondary">
          Needs action{counts.needs_action ? <Badge tone="amber">{counts.needs_action}</Badge> : null}
        </Link>
        <Link href={`${base}/messages?status=failed`} className="btn-secondary">
          Failed{counts.failed ? <Badge tone="red">{counts.failed}</Badge> : null}
        </Link>
        <Link href={`${base}/messages?status=all`} className="btn-secondary">
          All messages
        </Link>
      </div>

      <form className="mb-4 flex flex-wrap gap-2" role="search">
        {relatedId ? <input type="hidden" name="related" value={relatedId} /> : null}
        <select name="status" defaultValue={status ?? "all"} className="input w-auto" aria-label="Status">
          <option value="all">Any status</option>
          {MESSAGE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {MESSAGE_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select name="channel" defaultValue={channel ?? ""} className="input w-auto" aria-label="Channel">
          <option value="">Any channel</option>
          {CHANNELS.map((c) => (
            <option key={c} value={c}>
              {CHANNEL_LABELS[c]}
            </option>
          ))}
        </select>
        <button className="btn-secondary">Filter</button>
        {relatedId ? (
          <Link href={`${base}/messages`} className="self-center text-sm text-slate-600 hover:underline">
            Clear broadcast filter
          </Link>
        ) : null}
      </form>

      {rows.length === 0 ? (
        <EmptyState title={status === "needs_action" ? "Nothing waiting for the office" : "No messages match"} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Created</th>
                <th>Parent</th>
                <th>Message</th>
                <th>Channel</th>
                <th>Status</th>
                <th>To do</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const name =
                  m.guardianFirstName && m.guardianLastName
                    ? guardianName({ title: m.guardianTitle, firstName: m.guardianFirstName, lastName: m.guardianLastName })
                    : "—";
                const dial = numbers.filter((n) => n.guardianId === m.guardianId);
                return (
                  <tr key={m.id}>
                    <td className="whitespace-nowrap">{formatDateTime(m.createdAt, tz)}</td>
                    <td>
                      {m.guardianId && can(ctx, "guardians.view") ? (
                        <Link href={`${base}/guardians/${m.guardianId}`} className="link">
                          {name}
                        </Link>
                      ) : (
                        name
                      )}
                    </td>
                    <td>
                      <Link href={`${base}/messages/${m.id}`} className="link font-medium">
                        {m.subject ?? "(no subject)"}
                      </Link>
                      {m.relatedType === "meeting" && m.relatedId ? (
                        <Link href={`${base}/meetings/${m.relatedId}`} className="block text-xs text-slate-500 hover:underline">
                          Meeting →
                        </Link>
                      ) : m.relatedType === "broadcast" && m.relatedId ? (
                        <Link
                          href={`${base}/messages?related=${m.relatedId}&status=all`}
                          className="block text-xs text-slate-500 hover:underline"
                        >
                          Broadcast →
                        </Link>
                      ) : null}
                    </td>
                    <td>{CHANNEL_LABELS[m.channel]}</td>
                    <td>
                      <Badge tone={MESSAGE_STATUS_TONES[m.status]}>{MESSAGE_STATUS_LABELS[m.status]}</Badge>
                      {m.status === "failed" && m.error ? (
                        <span className="block max-w-xs truncate text-xs text-red-700" title={m.error}>
                          {m.error}
                        </span>
                      ) : null}
                    </td>
                    <td>
                      {m.status === "needs_action" || m.status === "failed" ? (
                        <div className="flex flex-wrap items-center gap-2">
                          {m.status === "needs_action" && m.channel === "letter" ? (
                            <Link href={`${base}/messages/${m.id}/letter`} className="btn-secondary py-1">
                              Print letter
                            </Link>
                          ) : null}
                          {m.status === "needs_action" && (m.channel === "call" || m.channel === "sms")
                            ? dial.map((n) => (
                                <a key={n.value} href={`tel:${n.value}`} className="link font-mono text-xs">
                                  {n.value}
                                </a>
                              ))
                            : null}
                          {m.status === "failed" ? (
                            <Link href={`${base}/messages/${m.id}`} className="btn-secondary py-1">
                              Retry…
                            </Link>
                          ) : null}
                          <form action={markMessageDoneForm.bind(null, slug)}>
                            <input type="hidden" name="messageId" value={m.id} />
                            <button className="btn-secondary py-1">Mark done</button>
                          </form>
                        </div>
                      ) : null}
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
          <Link href={query({ page: String(page - 1) })} className="btn-secondary">
            Previous
          </Link>
        ) : null}
        {hasMore ? (
          <Link href={query({ page: String(page + 1) })} className="btn-secondary">
            Next
          </Link>
        ) : null}
      </div>
    </>
  );
}
