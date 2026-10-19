import Link from "next/link";
import { Badge, EmptyState, NoAccess, PageHeader } from "@/components/ui";
import { can, getSchoolContext } from "@/lib/auth/context";
import { fullName } from "@/lib/format";
import { listCurrentClasses, listLearners } from "@/server/school-data";

export const metadata = { title: "Learners" };

const STATUS_TONE = { active: "green", transferred: "amber", graduated: "blue", left: "gray" } as const;

export default async function LearnersPage({ params, searchParams }: PageProps<"/s/[school]/learners">) {
  const { school: slug } = await params;
  const sp = await searchParams;
  const ctx = await getSchoolContext(slug);
  if (!can(ctx, "learners.view")) return <NoAccess />;

  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const classGroupId = typeof sp.class === "string" ? sp.class : "";
  const status = typeof sp.status === "string" ? sp.status : "active";
  const page = Number(sp.page) || 1;

  const [{ rows, hasMore }, classes] = await Promise.all([
    listLearners(ctx.school.id, { q, classGroupId: classGroupId || undefined, status: status || undefined, page }),
    listCurrentClasses(ctx.school.id),
  ]);
  const base = `/s/${slug}/learners`;
  const pageHref = (p: number) =>
    `${base}?${new URLSearchParams({ q, class: classGroupId, status, page: String(p) })}`;

  return (
    <>
      <PageHeader
        title="Learners"
        actions={
          can(ctx, "learners.manage") ? (
            <Link href={`${base}/new`} className="btn-primary">
              Add learner
            </Link>
          ) : null
        }
      />
      <form className="mb-4 flex flex-wrap gap-2" role="search">
        <input name="q" defaultValue={q} placeholder="Name or admission number" className="input max-w-xs" />
        <select name="class" defaultValue={classGroupId} className="input w-auto">
          <option value="">All classes</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={status} className="input w-auto">
          <option value="active">Active</option>
          <option value="">Any status</option>
          <option value="transferred">Transferred</option>
          <option value="graduated">Graduated</option>
          <option value="left">Left</option>
        </select>
        <button className="btn-secondary">Filter</button>
      </form>

      {rows.length === 0 ? (
        <EmptyState title={q || classGroupId ? "No learners match" : "No learners yet"} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Admission no.</th>
                <th>Class</th>
                <th>Parents</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id}>
                  <td>
                    <Link href={`${base}/${l.id}`} className="link font-medium">
                      {fullName(l)}
                    </Link>
                  </td>
                  <td>{l.admissionNumber ?? "—"}</td>
                  <td>{l.className ?? "—"}</td>
                  <td>{l.guardianCount === 0 ? <Badge tone="amber">None</Badge> : l.guardianCount}</td>
                  <td>
                    <Badge tone={STATUS_TONE[l.status]}>{l.status}</Badge>
                  </td>
                </tr>
              ))}
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
