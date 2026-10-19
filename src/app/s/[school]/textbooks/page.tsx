import Link from "next/link";
import { EmptyState, NoAccess, PageHeader } from "@/components/ui";
import { can, getSchoolContext } from "@/lib/auth/context";
import { isUuid } from "@/lib/ids";
import { listGrades, listSubjects } from "@/server/classes";
import { listTitles } from "@/server/textbooks";
import { DeskButton, TextbooksNav } from "./section-nav";

export const metadata = { title: "Textbooks" };

export default async function TextbooksPage({ params, searchParams }: PageProps<"/s/[school]/textbooks">) {
  const { school: slug } = await params;
  const sp = await searchParams;
  const ctx = await getSchoolContext(slug);
  if (!can(ctx, "textbooks.view")) return <NoAccess />;

  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const gradeId = typeof sp.grade === "string" && isUuid(sp.grade) ? sp.grade : "";
  const subjectId = typeof sp.subject === "string" && isUuid(sp.subject) ? sp.subject : "";
  const page = Number(sp.page) || 1;

  const [{ rows, hasMore }, grades, subjects] = await Promise.all([
    listTitles(ctx.school.id, { q, gradeId: gradeId || undefined, subjectId: subjectId || undefined, page }),
    listGrades(ctx.school.id),
    listSubjects(ctx.school.id),
  ]);
  const base = `/s/${slug}/textbooks`;
  const pageHref = (p: number) =>
    `${base}?${new URLSearchParams({ q, grade: gradeId, subject: subjectId, page: String(p) })}`;
  const filtered = Boolean(q || gradeId || subjectId);

  return (
    <>
      <PageHeader
        title="Textbooks"
        actions={
          <>
            {can(ctx, "textbooks.issue") ? <DeskButton slug={slug} /> : null}
            {can(ctx, "textbooks.manage") ? (
              <Link href={`${base}/new`} className="btn-primary">
                Add title
              </Link>
            ) : null}
          </>
        }
      />
      <TextbooksNav slug={slug} current="" />

      <form className="mb-4 flex flex-wrap gap-2" role="search">
        <input name="q" defaultValue={q} placeholder="Title, ISBN or publisher" className="input max-w-xs" />
        <select name="grade" defaultValue={gradeId} className="input w-auto" aria-label="Grade">
          <option value="">All grades</option>
          {grades.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <select name="subject" defaultValue={subjectId} className="input w-auto" aria-label="Subject">
          <option value="">All subjects</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button className="btn-secondary">Filter</button>
      </form>

      {rows.length === 0 ? (
        <EmptyState title={filtered ? "No textbooks match" : "No textbooks yet"}>
          {!filtered && can(ctx, "textbooks.manage") ? (
            <Link href={`${base}/new`} className="link">
              Add the first title
            </Link>
          ) : null}
        </EmptyState>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Grade</th>
                <th>Subject</th>
                <th className="text-right">Copies</th>
                <th className="text-right">Available</th>
                <th className="text-right">Issued</th>
                <th className="text-right">Lost</th>
                <th className="text-right">Written off</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <td>
                    <Link href={`${base}/${t.id}`} className="link font-medium">
                      {t.title}
                    </Link>
                    {t.edition ? <span className="text-slate-500"> · {t.edition}</span> : null}
                  </td>
                  <td>{t.gradeName ?? "—"}</td>
                  <td>{t.subjectName ?? "—"}</td>
                  <td className="text-right">{t.total}</td>
                  <td className="text-right">{t.available}</td>
                  <td className="text-right">{t.issued}</td>
                  <td className={`text-right ${t.lost ? "font-medium text-red-700" : ""}`}>{t.lost}</td>
                  <td className="text-right text-slate-500">{t.writtenOff}</td>
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
