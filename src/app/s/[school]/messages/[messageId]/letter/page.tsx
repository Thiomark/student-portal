import Link from "next/link";
import { notFound } from "next/navigation";
import { NoAccess } from "@/components/ui";
import { can, getSchoolContext } from "@/lib/auth/context";
import { formatDate, fullName } from "@/lib/format";
import { isUuid } from "@/lib/ids";
import { getMessage, letterLearners } from "@/server/messages";
import { PrintButton } from "./print-button";

export const metadata = { title: "Letter to parent" };

// The school layout's sidebar and this page's toolbar disappear on paper.
const PRINT_CSS = `
@page { size: A4; margin: 18mm; }
@media print {
  body { background: #fff !important; }
  aside, .no-print { display: none !important; }
  main { padding: 0 !important; }
  .letter { border: 0 !important; box-shadow: none !important; padding: 0 !important; max-width: none !important; }
}
`;

export default async function LetterPage({ params }: PageProps<"/s/[school]/messages/[messageId]/letter">) {
  const { school: slug, messageId } = await params;
  const ctx = await getSchoolContext(slug);
  if (!can(ctx, "messages.send")) return <NoAccess />;
  if (!isUuid(messageId)) notFound();
  const row = await getMessage(ctx.school.id, messageId);
  if (!row) notFound();
  const { message, guardian } = row;
  const school = ctx.school;
  const learners = await letterLearners(school.id, message);

  // The notice text opens with its own greeting; the letter adds a named one.
  const body = message.body.replace(/^Dear [^\n]*,[ \t]*\n+/, "");
  const greeting = guardian
    ? `Dear ${guardian.title ? `${guardian.title} ${guardian.lastName}` : `${guardian.firstName} ${guardian.lastName}`},`
    : "Dear parent/guardian,";
  const learnerNames = learners
    .map((l) => `${fullName(l)}${l.className ? ` (${l.className})` : ""}`)
    .join(", ");
  const contactLine = [school.phone && `Tel: ${school.phone}`, school.email].filter(Boolean).join(" · ");

  return (
    <>
      <style>{PRINT_CSS}</style>
      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <Link href={`/s/${slug}/messages/${messageId}`} className="text-sm text-slate-500 hover:text-slate-800">
          ← Back to message
        </Link>
        <span className="flex-1" />
        <PrintButton />
      </div>

      <article className="letter mx-auto max-w-[210mm] border border-slate-200 bg-white p-[18mm] text-[11pt] leading-relaxed text-black shadow-sm">
        <header className="mb-6 border-b border-slate-400 pb-3 text-center">
          <h1 className="text-xl font-bold">{school.name}</h1>
          {school.address ? <p className="text-sm whitespace-pre-line">{school.address}</p> : null}
          {contactLine ? <p className="text-sm">{contactLine}</p> : null}
        </header>

        <div className="mb-6 flex flex-wrap justify-between gap-4 text-sm">
          <div>
            {guardian ? (
              <>
                <p className="font-medium">
                  {[guardian.title, guardian.firstName, guardian.lastName].filter(Boolean).join(" ")}
                </p>
                {guardian.address ? <p className="whitespace-pre-line">{guardian.address}</p> : null}
              </>
            ) : null}
            {learnerNames ? <p className="mt-1">Parent/guardian of: {learnerNames}</p> : null}
          </div>
          <p>{formatDate(message.createdAt, school.timezone)}</p>
        </div>

        <p className="mb-4">{greeting}</p>
        {message.subject ? <p className="mb-4 font-bold">RE: {message.subject}</p> : null}
        <div className="whitespace-pre-wrap">{body}</div>
        {body.includes(school.name) ? null : <p className="mt-6">{school.name}</p>}

        {message.relatedType === "meeting" ? (
          <section className="mt-10 border-t-2 border-dashed border-slate-400 pt-4 text-sm">
            <p className="mb-3 font-bold">Reply slip – please return to the school with {learnerNames || "your child"}</p>
            <p className="mb-2">☐ I will attend the meeting &nbsp;&nbsp; ☐ I cannot attend. Please contact me on:</p>
            <p className="mb-4 border-b border-slate-400 pb-5" />
            <p className="flex gap-6">
              <span className="flex-1 border-b border-slate-400 pb-5">Name:</span>
              <span className="flex-1 border-b border-slate-400 pb-5">Signature:</span>
              <span className="w-32 border-b border-slate-400 pb-5">Date:</span>
            </p>
          </section>
        ) : null}
      </article>
    </>
  );
}
