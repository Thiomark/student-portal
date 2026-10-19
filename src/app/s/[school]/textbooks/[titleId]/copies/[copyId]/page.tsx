import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, DefinitionList, NoAccess, PageHeader, Section } from "@/components/ui";
import { can, getSchoolContext } from "@/lib/auth/context";
import { formatDate, fullName } from "@/lib/format";
import { isUuid } from "@/lib/ids";
import { COPY_STATUS_LABELS } from "@/lib/validation/textbooks";
import { getCopy, listCopyLoans } from "@/server/textbooks";
import { setCopyStatus, updateCopy } from "../../../actions";
import { CopyEditForm, CopyStatusForm } from "../../../forms";
import { CONDITION_TONE, DeskButton, STATUS_TONE } from "../../../section-nav";

export const metadata = { title: "Textbook copy" };

export default async function CopyPage({ params }: PageProps<"/s/[school]/textbooks/[titleId]/copies/[copyId]">) {
  const { school: slug, titleId, copyId } = await params;
  const ctx = await getSchoolContext(slug);
  if (!can(ctx, "textbooks.view")) return <NoAccess />;
  if (!isUuid(titleId) || !isUuid(copyId)) notFound();

  const [row, loans] = await Promise.all([getCopy(ctx.school.id, copyId), listCopyLoans(ctx.school.id, copyId)]);
  if (!row || row.copy.titleId !== titleId) notFound();
  const { copy } = row;

  const tz = ctx.school.timezone;
  const base = `/s/${slug}/textbooks`;
  const manage = can(ctx, "textbooks.manage");
  const linkLearners = can(ctx, "learners.view");
  const isOut = Boolean(row.openLoanId) || copy.status === "issued";
  const shownStatus = row.openLoanId ? "issued" : copy.status;
  const statusAction = setCopyStatus.bind(null, slug, copyId);
  const holder = row.learner ? fullName(row.learner) : null;

  return (
    <>
      <PageHeader
        title={<span className="font-mono">{copy.copyNumber}</span>}
        description={row.titleName}
        back={{ href: `${base}/${titleId}`, label: row.titleName }}
        actions={can(ctx, "textbooks.issue") ? <DeskButton slug={slug} /> : null}
      />

      <Section title="Copy">
        <DefinitionList
          items={[
            ["Status", <Badge key="s" tone={STATUS_TONE[shownStatus]}>{COPY_STATUS_LABELS[shownStatus]}</Badge>],
            ["Condition", <Badge key="c" tone={CONDITION_TONE[copy.condition]}>{copy.condition}</Badge>],
            [
              "With",
              row.learner && holder ? (
                linkLearners ? (
                  <Link key="l" href={`/s/${slug}/learners/${row.learner.id}`} className="link">
                    {holder}
                  </Link>
                ) : (
                  holder
                )
              ) : null,
            ],
            ["Issued", row.issuedAt ? formatDate(row.issuedAt, tz) : null],
            ["Due", row.dueOn ? formatDate(row.dueOn, "UTC") : null],
            ["Received on", copy.acquiredOn ? formatDate(copy.acquiredOn, "UTC") : null],
            ["Notes", copy.notes],
          ]}
        />
      </Section>

      {manage ? (
        <Section title="Update copy">
          <CopyEditForm
            action={updateCopy.bind(null, slug, copyId)}
            copy={{ condition: copy.condition, acquiredOn: copy.acquiredOn, notes: copy.notes }}
          />
          <hr className="my-4 border-slate-200" />
          {isOut ? (
            <p className="text-sm text-slate-600">
              This copy is out{holder ? ` with ${holder}` : ""}. To mark it lost or damaged, return it at the{" "}
              <Link href={`/s/${slug}/desk`} className="link">
                textbook desk
              </Link>
              .
            </p>
          ) : (
            <div className="flex flex-wrap items-start gap-2">
              {copy.status !== "lost" ? (
                <CopyStatusForm
                  action={statusAction}
                  status="lost"
                  label="Mark lost"
                  confirmText={`Mark ${copy.copyNumber} as lost?`}
                />
              ) : null}
              {copy.status !== "written_off" ? (
                <CopyStatusForm
                  action={statusAction}
                  status="written_off"
                  label="Write off"
                  className="btn-danger"
                  confirmText={`Write off ${copy.copyNumber}? It will no longer count as stock.`}
                />
              ) : null}
              {copy.status === "lost" || copy.status === "written_off" ? (
                <CopyStatusForm action={statusAction} status="available" label="Found / back in stock" />
              ) : null}
            </div>
          )}
        </Section>
      ) : null}

      <Section title="Loan history">
        {loans.length === 0 ? (
          <p className="text-sm text-slate-600">Never issued.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Learner</th>
                  <th>Issued</th>
                  <th>Returned</th>
                  <th>Condition</th>
                </tr>
              </thead>
              <tbody>
                {loans.map((l) => (
                  <tr key={l.id}>
                    <td>
                      {linkLearners ? (
                        <Link href={`/s/${slug}/learners/${l.learnerId}`} className="link">
                          {fullName(l)}
                        </Link>
                      ) : (
                        fullName(l)
                      )}
                    </td>
                    <td>{formatDate(l.issuedAt, tz)}</td>
                    <td>{l.returnedAt ? formatDate(l.returnedAt, tz) : <Badge tone="amber">Out</Badge>}</td>
                    <td>
                      {l.conditionOut}
                      {l.conditionIn ? ` → ${l.conditionIn}` : ""}
                      {l.outcome && l.outcome !== "returned" ? (
                        <>
                          {" "}
                          <Badge tone="red">{l.outcome}</Badge>
                        </>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}
