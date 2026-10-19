import Link from "next/link";
import { Badge, EmptyState, NoAccess, PageHeader } from "@/components/ui";
import { can, getSchoolContext } from "@/lib/auth/context";
import { formatDate, fullName } from "@/lib/format";
import { isUuid } from "@/lib/ids";
import { COPY_STATUS_LABELS } from "@/lib/validation/textbooks";
import { listCurrentClasses } from "@/server/school-data";
import { listLoans, listLostDamaged, listTitleOptions, todayIn, type LoanView } from "@/server/textbooks";
import { CONDITION_TONE, DeskButton, STATUS_TONE, TextbooksNav } from "../section-nav";

export const metadata = { title: "Textbook loans" };

const VIEWS = [
  { id: "open", label: "Out now" },
  { id: "overdue", label: "Overdue" },
  { id: "returned", label: "Returned" },
  { id: "lost", label: "Lost & damaged" },
] as const;
type View = (typeof VIEWS)[number]["id"];

export default async function LoansPage({ params, searchParams }: PageProps<"/s/[school]/textbooks/loans">) {
  const { school: slug } = await params;
  const sp = await searchParams;
  const ctx = await getSchoolContext(slug);
  if (!can(ctx, "textbooks.view")) return <NoAccess />;

  const view: View = VIEWS.find((v) => v.id === sp.view)?.id ?? "open";
  const classGroupId = typeof sp.class === "string" && isUuid(sp.class) ? sp.class : "";
  const titleId = typeof sp.title === "string" && isUuid(sp.title) ? sp.title : "";
  // Returned defaults to only the books that came back worse (or not at all).
  const changedOnly = sp.changed !== "all";
  const page = Number(sp.page) || 1;
  const today = todayIn(ctx.school.timezone);
  const tz = ctx.school.timezone;

  const [classes, titles] = await Promise.all([listCurrentClasses(ctx.school.id), listTitleOptions(ctx.school.id)]);
  const loans =
    view === "lost"
      ? null
      : await listLoans(ctx.school.id, {
          view: view as LoanView,
          today,
          classGroupId: classGroupId || undefined,
          titleId: titleId || undefined,
          changedOnly,
          page,
        });
  const lost = view === "lost" ? await listLostDamaged(ctx.school.id, { titleId: titleId || undefined, page }) : null;
  const hasMore = (loans ?? lost)?.hasMore ?? false;

  const base = `/s/${slug}/textbooks/loans`;
  const query = (overrides: Record<string, string>) => {
    const p = new URLSearchParams({ view, class: classGroupId, title: titleId, ...overrides });
    if (p.get("view") === "returned" && !changedOnly) p.set("changed", "all");
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    return `${base}?${p}`;
  };
  const linkLearners = can(ctx, "learners.view");
  const learnerCell = (l: { learnerId: string; firstName: string; lastName: string; preferredName: string | null }) =>
    linkLearners ? (
      <Link href={`/s/${slug}/learners/${l.learnerId}`} className="link">
        {fullName(l)}
      </Link>
    ) : (
      fullName(l)
    );
  const copyCell = (c: { titleId: string; copyId: string; copyNumber: string }) => (
    <Link href={`/s/${slug}/textbooks/${c.titleId}/copies/${c.copyId}`} className="link font-mono">
      {c.copyNumber}
    </Link>
  );

  return (
    <>
      <PageHeader
        title="Textbooks"
        actions={can(ctx, "textbooks.issue") ? <DeskButton slug={slug} className="btn-primary" /> : null}
      />
      <TextbooksNav slug={slug} current="/loans" />

      <div className="mb-4 flex flex-wrap gap-1">
        {VIEWS.map((v) => (
          <Link
            key={v.id}
            href={query({ view: v.id, page: "" })}
            aria-current={v.id === view ? "page" : undefined}
            className={`rounded-full px-3 py-1 text-sm ${
              v.id === view ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {v.label}
          </Link>
        ))}
      </div>

      <form className="mb-4 flex flex-wrap gap-2">
        <input type="hidden" name="view" value={view} />
        {view !== "lost" ? (
          <select name="class" defaultValue={classGroupId} className="input w-auto" aria-label="Class">
            <option value="">All classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        ) : null}
        <select name="title" defaultValue={titleId} className="input w-auto max-w-xs" aria-label="Title">
          <option value="">All titles</option>
          {titles.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
              {t.gradeName ? ` (${t.gradeName})` : ""}
            </option>
          ))}
        </select>
        {view === "returned" ? (
          <select name="changed" defaultValue={changedOnly ? "" : "all"} className="input w-auto" aria-label="Show">
            <option value="">Condition changed or lost</option>
            <option value="all">All returns</option>
          </select>
        ) : null}
        <button className="btn-secondary">Filter</button>
      </form>

      {loans ? (
        loans.rows.length === 0 ? (
          <EmptyState
            title={
              view === "overdue"
                ? "Nothing overdue"
                : view === "returned"
                  ? "No returns to show"
                  : "No textbooks are out"
            }
          />
        ) : (
          <div className="card overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Learner</th>
                  <th>Class</th>
                  <th>Book</th>
                  <th>Copy</th>
                  <th>Issued</th>
                  {view === "returned" ? <th>Returned</th> : <th>Due</th>}
                  {view === "returned" ? <th>Condition</th> : null}
                </tr>
              </thead>
              <tbody>
                {loans.rows.map((l) => (
                  <tr key={l.id}>
                    <td>{learnerCell(l)}</td>
                    <td>{l.className ?? "—"}</td>
                    <td>{l.title}</td>
                    <td>{copyCell(l)}</td>
                    <td>{formatDate(l.issuedAt, tz)}</td>
                    {view === "returned" ? (
                      <td>{formatDate(l.returnedAt, tz)}</td>
                    ) : (
                      <td>
                        {l.dueOn ? (
                          l.dueOn < today ? (
                            <Badge tone="red">{formatDate(l.dueOn, "UTC")}</Badge>
                          ) : (
                            formatDate(l.dueOn, "UTC")
                          )
                        ) : (
                          "—"
                        )}
                      </td>
                    )}
                    {view === "returned" ? (
                      <td>
                        <Badge tone={CONDITION_TONE[l.conditionOut]}>{l.conditionOut}</Badge>
                        {l.conditionIn ? (
                          <>
                            {" → "}
                            <Badge tone={CONDITION_TONE[l.conditionIn]}>{l.conditionIn}</Badge>
                          </>
                        ) : null}
                        {l.outcome && l.outcome !== "returned" ? (
                          <>
                            {" "}
                            <Badge tone="red">{l.outcome}</Badge>
                          </>
                        ) : null}
                        {l.notes ? <p className="mt-1 text-xs text-slate-500">{l.notes}</p> : null}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}

      {lost ? (
        lost.rows.length === 0 ? (
          <EmptyState title="No lost or damaged copies" />
        ) : (
          <div className="card overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Copy</th>
                  <th>Book</th>
                  <th>Status</th>
                  <th>Condition</th>
                  <th>Last with</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {lost.rows.map((c) => (
                  <tr key={c.id}>
                    <td>{copyCell({ titleId: c.titleId, copyId: c.id, copyNumber: c.copyNumber })}</td>
                    <td>{c.title}</td>
                    <td>
                      <Badge tone={STATUS_TONE[c.status]}>{COPY_STATUS_LABELS[c.status]}</Badge>
                    </td>
                    <td>
                      <Badge tone={CONDITION_TONE[c.condition]}>{c.condition}</Badge>
                    </td>
                    <td>{c.lastLoan ? learnerCell(c.lastLoan) : "—"}</td>
                    <td>{formatDate(c.updatedAt, tz)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}

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
