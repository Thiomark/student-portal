import { and, asc, eq, isNull } from "drizzle-orm";
import { ActionForm, Field } from "@/components/action-form";
import { NoAccess, PageHeader, Section } from "@/components/ui";
import { getDb, schema } from "@/db/client";
import { can, getSchoolContext } from "@/lib/auth/context";
import { CHANNEL_LABELS, type Channel } from "@/lib/messaging/channel";
import { audienceInput, MAX_BROADCAST_GUARDIANS } from "@/lib/validation/messages";
import { countByChannel, expectedRoutes, resolveAudience } from "@/server/messages";
import { listCurrentClasses } from "@/server/school-data";
import { sendBroadcast } from "../actions";

export const metadata = { title: "Message parents" };

const CHANNEL_ORDER: Channel[] = ["whatsapp", "email", "sms", "call", "letter"];
const PLURAL: Record<Channel, [string, string]> = {
  whatsapp: ["WhatsApp", "WhatsApp"],
  email: ["email", "emails"],
  sms: ["SMS", "SMSes"],
  call: ["phone call", "phone calls"],
  letter: ["letter", "letters"],
};

export default async function NewBroadcastPage({ params, searchParams }: PageProps<"/s/[school]/messages/new">) {
  const { school: slug } = await params;
  const sp = await searchParams;
  const ctx = await getSchoolContext(slug);
  if (!can(ctx, "messages.send")) return <NoAccess />;
  const schoolId = ctx.school.id;

  const [classes, grades] = await Promise.all([
    listCurrentClasses(schoolId),
    getDb()
      .select({ id: schema.grades.id, name: schema.grades.name })
      .from(schema.grades)
      .where(and(eq(schema.grades.schoolId, schoolId), isNull(schema.grades.deletedAt)))
      .orderBy(asc(schema.grades.sortOrder), asc(schema.grades.name)),
  ]);

  const parsed = audienceInput.safeParse({
    audience: sp.audience,
    classGroupId: sp.class || undefined,
    gradeId: sp.grade || undefined,
  });
  const audience = parsed.success ? parsed.data : null;
  const resolved = audience ? await resolveAudience(schoolId, audience, MAX_BROADCAST_GUARDIANS) : null;
  const counts =
    resolved && !resolved.overLimit ? countByChannel(await expectedRoutes(schoolId, resolved.guardianIds)) : null;
  const audienceLabel = !audience
    ? ""
    : audience.audience === "class"
      ? `parents of class ${classes.find((c) => c.id === audience.classGroupId)?.name ?? ""}`
      : audience.audience === "grade"
        ? `parents of ${grades.find((g) => g.id === audience.gradeId)?.name ?? "the grade"}`
        : "parents of all active learners";
  const manual = counts ? (counts.sms ?? 0) + (counts.call ?? 0) + (counts.letter ?? 0) : 0;

  return (
    <>
      <PageHeader
        title="Message parents"
        description="Sends by WhatsApp where possible, then email. Parents without either land in the office's to-do list for a phone call or printed letter."
        back={{ href: `/s/${slug}/messages`, label: "Messages" }}
      />

      <Section title="1. Who should get it?">
        <form className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" name="audience" value="class" defaultChecked={sp.audience === "class"} /> Parents of
              class
            </label>
            <select name="class" defaultValue={typeof sp.class === "string" ? sp.class : ""} className="input w-auto">
              <option value="">—</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.gradeName})
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" name="audience" value="grade" defaultChecked={sp.audience === "grade"} /> Parents of
              grade
            </label>
            <select name="grade" defaultValue={typeof sp.grade === "string" ? sp.grade : ""} className="input w-auto">
              <option value="">—</option>
              {grades.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="audience" value="all" defaultChecked={sp.audience === "all"} /> Parents of all
            active learners
          </label>
          <p className="text-xs text-slate-500">
            Only parents marked “gets notices” are included, and each parent gets one message even with several
            children.
          </p>
          <button className="btn-secondary">Preview recipients</button>
        </form>
        {sp.audience && !audience ? (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {sp.audience === "class" ? "Pick a class." : sp.audience === "grade" ? "Pick a grade." : "Pick who to send to."}
          </p>
        ) : null}
      </Section>

      {audience && resolved ? (
        <Section title="2. Write and send">
          {resolved.overLimit ? (
            <p role="alert" className="text-sm text-red-700">
              That is more than {MAX_BROADCAST_GUARDIANS} parents. Send to one grade at a time instead.
            </p>
          ) : resolved.guardianIds.length === 0 ? (
            <p className="text-sm text-slate-600">No parents to send to for that choice.</p>
          ) : (
            <>
              <div className="mb-4 rounded-md bg-slate-50 px-3 py-2 text-sm">
                <p>
                  <span className="font-medium">
                    {resolved.guardianIds.length} {resolved.guardianIds.length === 1 ? "parent" : "parents"}
                  </span>{" "}
                  ({audienceLabel}):{" "}
                  {CHANNEL_ORDER.filter((c) => counts?.[c])
                    .map((c) => `${counts![c]} ${PLURAL[c][counts![c] === 1 ? 0 : 1]}`)
                    .join(", ")}
                </p>
                {manual ? (
                  <p className="mt-1 text-amber-800">
                    {manual} can&apos;t be reached automatically and will be added to the office to-do list (
                    {CHANNEL_ORDER.filter((c) => c !== "whatsapp" && c !== "email" && counts?.[c])
                      .map((c) => CHANNEL_LABELS[c].toLowerCase())
                      .join(", ")}
                    ).
                  </p>
                ) : null}
              </div>
              <ActionForm action={sendBroadcast.bind(null, slug)} className="space-y-4">
                <input type="hidden" name="audience" value={audience.audience} />
                {audience.classGroupId ? <input type="hidden" name="classGroupId" value={audience.classGroupId} /> : null}
                {audience.gradeId ? <input type="hidden" name="gradeId" value={audience.gradeId} /> : null}
                <Field name="subject" label="Subject">
                  <input id="subject" name="subject" className="input" required maxLength={150} />
                </Field>
                <Field name="text" label="Message" hint="Plain text. Keep it short; it is read on phones and printed for letters.">
                  <textarea id="text" name="text" rows={8} className="input" required maxLength={3000} />
                </Field>
                <button className="btn-primary">
                  Send to {resolved.guardianIds.length} {resolved.guardianIds.length === 1 ? "parent" : "parents"}
                </button>
              </ActionForm>
            </>
          )}
        </Section>
      ) : null}
    </>
  );
}
