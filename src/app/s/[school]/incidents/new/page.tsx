import Link from "next/link";
import { EmptyState, NoAccess, PageHeader } from "@/components/ui";
import { can, getSchoolContext } from "@/lib/auth/context";
import { fullName, toLocalInput } from "@/lib/format";
import { isUuid } from "@/lib/ids";
import { getLearner, listLearners } from "@/server/school-data";
import { reportIncident } from "../actions";
import { IncidentForm } from "../forms";

export const metadata = { title: "Report incident" };

export default async function NewIncidentPage({ params, searchParams }: PageProps<"/s/[school]/incidents/new">) {
  const { school: slug } = await params;
  const sp = await searchParams;
  const ctx = await getSchoolContext(slug);
  if (!can(ctx, "incidents.report")) return <NoAccess />;

  const base = `/s/${slug}/incidents`;
  const back = can(ctx, "incidents.view") ? { href: base, label: "Incidents" } : undefined;
  const learner = isUuid(sp.learner) ? await getLearner(ctx.school.id, sp.learner) : null;
  const now = toLocalInput(new Date(), ctx.school.timezone);

  if (!learner) {
    const q = typeof sp.q === "string" ? sp.q.trim() : "";
    const { rows } = q ? await listLearners(ctx.school.id, { q, status: "active" }) : { rows: [] };
    return (
      <>
        <PageHeader title="Report incident" description="First, find the learner." back={back} />
        <form className="mb-4 flex gap-2" role="search">
          <input name="q" defaultValue={q} placeholder="Name or admission number" className="input max-w-xs" autoFocus />
          <button className="btn-secondary">Search</button>
        </form>
        {q && rows.length === 0 ? <EmptyState title="No learners match" /> : null}
        {rows.length > 0 ? (
          <ul className="card divide-y divide-slate-100">
            {rows.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-2">
                <span>
                  <span className="font-medium">{fullName(l)}</span>{" "}
                  <span className="text-sm text-slate-500">
                    {[l.className, l.admissionNumber].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <Link href={`${base}/new?learner=${l.id}`} className="btn-secondary">
                  Choose
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={`Report incident: ${fullName(learner.learner)}`}
        description={learner.className ? `Class ${learner.className}` : "Not in a class"}
        back={back}
        actions={
          <Link href={`${base}/new`} className="btn-secondary">
            Different learner
          </Link>
        }
      />
      <IncidentForm
        action={reportIncident.bind(null, slug)}
        learnerId={learner.learner.id}
        incident={{ occurredAt: now, category: "", severity: "low", description: "", actionTaken: null }}
        maxOccurredAt={now.slice(0, 10) + "T23:59"}
        submitLabel="Save report"
      />
    </>
  );
}
