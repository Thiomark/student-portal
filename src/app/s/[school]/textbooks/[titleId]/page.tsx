import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, DefinitionList, NoAccess, PageHeader, Section } from "@/components/ui";
import { can, getSchoolContext } from "@/lib/auth/context";
import { formatDate, fullName } from "@/lib/format";
import { isUuid } from "@/lib/ids";
import { COPY_STATUSES, COPY_STATUS_LABELS } from "@/lib/validation/textbooks";
import { getTitle, getTitleCounts, listCopies, todayIn, type CopyFilter } from "@/server/textbooks";
import { addCopies } from "../actions";
import { AddCopiesForm } from "../forms";
import { CONDITION_TONE, DeskButton, STATUS_TONE } from "../section-nav";

export default async function TitlePage({ params, searchParams }: PageProps<"/s/[school]/textbooks/[titleId]">) {
  const { school: slug, titleId } = await params;
  const sp = await searchParams;
  const ctx = await getSchoolContext(slug);
  if (!can(ctx, "textbooks.view")) return <NoAccess />;
  if (!isUuid(titleId)) notFound();

  const status: CopyFilter = COPY_STATUSES.find((s) => s === sp.status) ?? "";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const page = Number(sp.page) || 1;

  const [row, counts, { rows: copies, hasMore }] = await Promise.all([
    getTitle(ctx.school.id, titleId),
    getTitleCounts(ctx.school.id, titleId),
    listCopies(ctx.school.id, titleId, { status, q, page }),
  ]);
  if (!row) notFound();
  const { title } = row;

  const base = `/s/${slug}/textbooks`;
  const manage = can(ctx, "textbooks.manage");
  const linkLearners = can(ctx, "learners.view");
  const today = todayIn(ctx.school.timezone);
  const pageHref = (p: number) => `${base}/${titleId}?${new URLSearchParams({ status, q, page: String(p) })}`;
  // e.g. subject code MATH + "Grade 8" → "MATH8-", a starting point for labels.
  const gradeDigits = row.gradeName?.match(/\d+/)?.[0] ?? "";
  const suggestedPrefix = row.subjectCode ? `${row.subjectCode.toUpperCase()}${gradeDigits}-` : "";

  return (
    <>
      <PageHeader
        title={title.title}
        description={[row.gradeName, row.subjectName, title.edition].filter(Boolean).join(" · ") || undefined}
        back={{ href: base, label: "Textbooks" }}
        actions={
          <>
            {can(ctx, "textbooks.issue") ? <DeskButton slug={slug} /> : null}
            {manage ? (
              <Link href={`${base}/${titleId}/edit`} className="btn-secondary">
                Edit
              </Link>
            ) : null}
          </>
        }
      />

      <Section title="Details">
        <DefinitionList
          items={[
            ["ISBN", title.isbn],
            ["Publisher", title.publisher],
            ["Edition", title.edition],
            [
              "Copies",
              `${counts.total} in total · ${counts.available} available · ${counts.issued} issued · ${counts.lost} lost · ${counts.writtenOff} written off`,
            ],
          ]}
        />
      </Section>

      <Section
        title="Copies"
        actions={
          <Link href={`${base}/loans?title=${titleId}`} className="link text-sm">
            Loans for this title
          </Link>
        }
      >
        <form className="mb-4 flex flex-wrap gap-2" role="search">
          <input name="q" defaultValue={q} placeholder="Copy number" className="input max-w-xs font-mono" />
          <select name="status" defaultValue={status} className="input w-auto" aria-label="Status">
            <option value="">Any status</option>
            {COPY_STATUSES.map((s) => (
              <option key={s} value={s}>
                {COPY_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <button className="btn-secondary">Filter</button>
        </form>

        {copies.length === 0 ? (
          <p className="text-sm text-slate-600">
            {q || status ? "No copies match." : "No copies yet."}
            {!q && !status && manage ? " Add them below." : ""}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Copy no.</th>
                  <th>Condition</th>
                  <th>Status</th>
                  <th>With</th>
                  <th>Due</th>
                </tr>
              </thead>
              <tbody>
                {copies.map((c) => {
                  const shownStatus = c.loanId ? "issued" : c.status;
                  const overdue = c.dueOn !== null && c.dueOn < today;
                  return (
                    <tr key={c.id}>
                      <td className="font-mono">
                        <Link href={`${base}/${titleId}/copies/${c.id}`} className="link">
                          {c.copyNumber}
                        </Link>
                      </td>
                      <td>
                        <Badge tone={CONDITION_TONE[c.condition]}>{c.condition}</Badge>
                      </td>
                      <td>
                        <Badge tone={STATUS_TONE[shownStatus]}>{COPY_STATUS_LABELS[shownStatus]}</Badge>
                      </td>
                      <td>
                        {c.learnerId && c.learnerFirstName && c.learnerLastName ? (
                          <LearnerName
                            href={linkLearners ? `/s/${slug}/learners/${c.learnerId}` : null}
                            name={fullName({
                              firstName: c.learnerFirstName,
                              lastName: c.learnerLastName,
                              preferredName: c.learnerPreferredName,
                            })}
                          />
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        {c.dueOn ? (
                          overdue ? (
                            <Badge tone="red">{formatDate(c.dueOn, "UTC")}</Badge>
                          ) : (
                            formatDate(c.dueOn, "UTC")
                          )
                        ) : (
                          "—"
                        )}
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
      </Section>

      {manage ? (
        <Section title="Add copies">
          <AddCopiesForm action={addCopies.bind(null, slug, titleId)} suggestedPrefix={suggestedPrefix} />
        </Section>
      ) : null}
    </>
  );
}

function LearnerName({ href, name }: { href: string | null; name: string }) {
  return href ? (
    <Link href={href} className="link">
      {name}
    </Link>
  ) : (
    <>{name}</>
  );
}
