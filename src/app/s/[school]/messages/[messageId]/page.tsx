import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Badge, DefinitionList, NoAccess, PageHeader, Section } from "@/components/ui";
import { can, getSchoolContext } from "@/lib/auth/context";
import { formatDateTime } from "@/lib/format";
import { isUuid } from "@/lib/ids";
import { CHANNEL_LABELS } from "@/lib/messaging/channel";
import { MESSAGE_STATUS_LABELS } from "@/lib/validation/messages";
import { getMessage, guardianName, listDialableContacts } from "@/server/messages";
import { markMessageDone, retryMessage } from "../actions";

const TONE = {
  queued: "gray",
  sent: "green",
  delivered: "green",
  read: "green",
  failed: "red",
  needs_action: "amber",
  done: "gray",
} as const;

export default async function MessagePage({ params }: PageProps<"/s/[school]/messages/[messageId]">) {
  const { school: slug, messageId } = await params;
  const ctx = await getSchoolContext(slug);
  if (!can(ctx, "messages.send")) return <NoAccess />;
  if (!isUuid(messageId)) notFound();
  const schoolId = ctx.school.id;
  const tz = ctx.school.timezone;
  const row = await getMessage(schoolId, messageId);
  if (!row) notFound();
  const { message, guardian } = row;

  const open = message.status === "needs_action" || message.status === "failed";
  const numbers =
    open && guardian && message.channel !== "letter" && message.channel !== "email"
      ? await listDialableContacts(schoolId, [guardian.id])
      : [];
  const canRetry = message.status === "failed" && (message.channel === "whatsapp" || message.channel === "email");
  const base = `/s/${slug}`;

  return (
    <>
      <PageHeader
        title={message.subject ?? "Message"}
        description={
          <>
            {CHANNEL_LABELS[message.channel]} ·{" "}
            <Badge tone={TONE[message.status]}>{MESSAGE_STATUS_LABELS[message.status]}</Badge>
          </>
        }
        back={{ href: `${base}/messages`, label: "Messages" }}
      />

      {open ? (
        <Section title="What to do">
          {message.channel === "letter" ? (
            <p className="mb-3 text-sm">
              This parent has no phone or email on file. Print the letter and send it home with the learner.
            </p>
          ) : message.channel === "call" || message.channel === "sms" ? (
            <div className="mb-3 space-y-2 text-sm">
              <p>
                {message.channel === "call"
                  ? "Phone the parent and read them the message below."
                  : "SMS is not sent automatically yet. Send it from the office phone, or call the parent."}
              </p>
              {numbers.length ? (
                <ul className="space-y-1">
                  {numbers.map((n) => (
                    <li key={n.value} className="flex flex-wrap items-center gap-2">
                      <a href={`tel:${n.value}`} className="link font-mono text-base">
                        {n.value}
                      </a>
                      {n.label ? <span className="text-slate-500">({n.label})</span> : null}
                      {n.voice ? <Badge>Calls</Badge> : null}
                      {n.sms ? <Badge tone="blue">SMS</Badge> : null}
                      {n.isPrimary ? <Badge tone="amber">Primary</Badge> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-amber-800">
                  No callable number on file any more. Print a letter instead, or update the parent&apos;s contacts.
                </p>
              )}
            </div>
          ) : message.status === "failed" ? (
            <p className="mb-3 text-sm">
              Sending failed{message.error ? `: ${message.error}` : "."} Retry, or phone the parent and mark it done.
            </p>
          ) : null}

          <div className="flex flex-wrap items-start gap-2">
            {message.channel === "letter" || message.status === "needs_action" ? (
              <Link href={`${base}/messages/${messageId}/letter`} className="btn-secondary">
                Print letter
              </Link>
            ) : null}
            {canRetry ? (
              <ActionForm action={retryMessage.bind(null, slug, messageId)}>
                <button className="btn-primary">Retry by {CHANNEL_LABELS[message.channel]}</button>
              </ActionForm>
            ) : null}
            <ActionForm action={markMessageDone.bind(null, slug, messageId)}>
              <button className="btn-secondary">Mark done</button>
            </ActionForm>
          </div>
        </Section>
      ) : null}

      <Section title="Message">
        <p className="text-sm whitespace-pre-wrap">{message.body}</p>
      </Section>

      <Section title="Details">
        <DefinitionList
          items={[
            [
              "Parent",
              guardian ? (
                can(ctx, "guardians.view") ? (
                  <Link key="g" href={`${base}/guardians/${guardian.id}`} className="link">
                    {guardianName(guardian)}
                  </Link>
                ) : (
                  guardianName(guardian)
                )
              ) : null,
            ],
            ["Channel", CHANNEL_LABELS[message.channel]],
            ["Created", formatDateTime(message.createdAt, tz)],
            ["Sent", message.sentAt ? formatDateTime(message.sentAt, tz) : null],
            ["Error", message.error],
            [
              "About",
              message.relatedType === "meeting" && message.relatedId ? (
                <Link key="r" href={`${base}/meetings/${message.relatedId}`} className="link">
                  Meeting
                </Link>
              ) : message.relatedType === "broadcast" && message.relatedId ? (
                <Link key="r" href={`${base}/messages?related=${message.relatedId}&status=all`} className="link">
                  Broadcast to parents
                </Link>
              ) : (
                message.relatedType
              ),
            ],
          ]}
        />
      </Section>
    </>
  );
}
