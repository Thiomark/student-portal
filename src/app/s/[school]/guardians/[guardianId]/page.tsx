import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ContactList } from "@/components/contacts";
import { Badge, DefinitionList, NoAccess, PageHeader, Section } from "@/components/ui";
import { getDb, schema } from "@/db/client";
import { can, getSchoolContext } from "@/lib/auth/context";
import { formatDateTime, fullName } from "@/lib/format";
import { isUuid } from "@/lib/ids";
import { chooseRoute, CHANNEL_LABELS } from "@/lib/messaging/channel";
import { RELATIONSHIP_LABELS } from "@/lib/validation/people";
import { getGuardian, listContacts, listGuardianLearners } from "@/server/school-data";
import { addContact, removeContactForm } from "../actions";
import { AddContactForm } from "../forms";

export default async function GuardianPage({ params }: PageProps<"/s/[school]/guardians/[guardianId]">) {
  const { school: slug, guardianId } = await params;
  const ctx = await getSchoolContext(slug);
  if (!can(ctx, "guardians.view")) return <NoAccess />;
  if (!isUuid(guardianId)) notFound();
  const schoolId = ctx.school.id;
  const guardian = await getGuardian(schoolId, guardianId);
  if (!guardian) notFound();

  const [contacts, children, messages] = await Promise.all([
    listContacts(schoolId, [guardianId]),
    listGuardianLearners(schoolId, guardianId),
    getDb()
      .select()
      .from(schema.messages)
      .where(and(eq(schema.messages.schoolId, schoolId), eq(schema.messages.guardianId, guardianId)))
      .orderBy(desc(schema.messages.createdAt))
      .limit(20),
  ]);
  const route = chooseRoute(contacts, guardian.preferredChannel);
  const manage = can(ctx, "guardians.manage");
  const base = `/s/${slug}`;

  return (
    <>
      <PageHeader
        title={[guardian.title, guardian.firstName, guardian.lastName].filter(Boolean).join(" ")}
        description={`Notices go by ${CHANNEL_LABELS[route.channel]}${guardian.userId ? " · Uses the parent portal" : ""}`}
        back={{ href: `${base}/guardians`, label: "Parents" }}
        actions={
          manage ? (
            <Link href={`${base}/guardians/${guardianId}/edit`} className="btn-secondary">
              Edit
            </Link>
          ) : null
        }
      />

      <Section title="Contact details">
        <ContactList
          contacts={contacts}
          remove={
            manage
              ? (contactId) => (
                  <form action={removeContactForm.bind(null, slug, guardianId)} className="inline">
                    <input type="hidden" name="contactId" value={contactId} />
                    <button className="text-xs text-red-700 hover:underline">Remove</button>
                  </form>
                )
              : undefined
          }
        />
        {manage ? (
          <div className="mt-4">
            <AddContactForm action={addContact.bind(null, slug, guardianId)} />
          </div>
        ) : null}
      </Section>

      <Section title="Children">
        {children.length === 0 ? (
          <p className="text-sm text-slate-600">Not linked to any learner.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {children.map(({ learner, link, className }) => (
              <li key={learner.id}>
                <Link href={`${base}/learners/${learner.id}`} className="link font-medium">
                  {fullName(learner)}
                </Link>{" "}
                <span className="text-slate-500">
                  {className ?? "No class"} · {RELATIONSHIP_LABELS[link.relationship]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Details">
        <DefinitionList
          items={[
            ["Occupation", guardian.occupation],
            ["Address", guardian.address],
            ["Preferred contact", guardian.preferredChannel ? CHANNEL_LABELS[guardian.preferredChannel] : "Best available"],
            ["Notes", guardian.notes],
          ]}
        />
      </Section>

      <Section title="Messages">
        {messages.length === 0 ? (
          <p className="text-sm text-slate-600">No messages sent yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {messages.map((m) => (
              <li key={m.id}>
                <span className="text-slate-500">{formatDateTime(m.createdAt, ctx.school.timezone)}</span>{" "}
                <Badge>{CHANNEL_LABELS[m.channel]}</Badge>{" "}
                <Badge tone={m.status === "failed" ? "red" : m.status === "needs_action" ? "amber" : "green"}>
                  {m.status.replace("_", " ")}
                </Badge>{" "}
                <span className="font-medium">{m.subject}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
