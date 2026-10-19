import { notFound } from "next/navigation";
import { EmptyState, NoAccess, PageHeader } from "@/components/ui";
import { can, getSchoolContext } from "@/lib/auth/context";
import { fullName } from "@/lib/format";
import { isUuid } from "@/lib/ids";
import { getLearner, searchGuardians } from "@/server/school-data";
import { linkGuardian } from "../../../guardians/actions";
import { LinkGuardianForm } from "../../../guardians/forms";

export const metadata = { title: "Link parent" };

// For siblings: the parent is usually already on file from an older child.
export default async function LinkGuardianPage({
  params,
  searchParams,
}: PageProps<"/s/[school]/learners/[learnerId]/link-guardian">) {
  const { school: slug, learnerId } = await params;
  const { q: qParam } = await searchParams;
  const ctx = await getSchoolContext(slug);
  if (!can(ctx, "guardians.manage")) return <NoAccess />;
  if (!isUuid(learnerId)) notFound();
  const learner = await getLearner(ctx.school.id, learnerId);
  if (!learner) notFound();

  const q = typeof qParam === "string" ? qParam.trim() : "";
  const results = q ? await searchGuardians(ctx.school.id, q, 20) : [];

  return (
    <>
      <PageHeader
        title={`Link a parent to ${fullName(learner.learner)}`}
        description="Search by name or phone number. Siblings share the same parent record."
        back={{ href: `/s/${slug}/learners/${learnerId}`, label: "Back to learner" }}
      />
      <form className="mb-4 flex gap-2" role="search">
        <input name="q" defaultValue={q} placeholder="Name or phone" className="input max-w-xs" autoFocus />
        <button className="btn-secondary">Search</button>
      </form>
      {q && results.length === 0 ? <EmptyState title="No parents match" /> : null}
      <ul className="space-y-3">
        {results.map((g) => (
          <li key={g.id} className="card p-4">
            <p className="mb-2 font-medium">
              {[g.title, g.firstName, g.lastName].filter(Boolean).join(" ")}{" "}
              <span className="text-sm font-normal text-slate-500">
                {g.childCount} {g.childCount === 1 ? "child" : "children"}
              </span>
            </p>
            <LinkGuardianForm action={linkGuardian.bind(null, slug, learnerId, g.id)} />
          </li>
        ))}
      </ul>
    </>
  );
}
