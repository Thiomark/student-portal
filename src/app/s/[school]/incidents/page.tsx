import Link from "next/link";
import { Badge, EmptyState, NoAccess, PageHeader } from "@/components/ui";
import { can, getSchoolContext } from "@/lib/auth/context";
import { formatDateTime, fullName } from "@/lib/format";
import { isUuid } from "@/lib/ids";
import {
  INCIDENT_CATEGORIES,
  INCIDENT_CATEGORY_LABELS,
  INCIDENT_SEVERITIES,
  INCIDENT_STATUSES,
} from "@/lib/validation/incidents";
import { listIncidents } from "@/server/incidents";
import { listCurrentClasses } from "@/server/school-data";

export const metadata = { title: "Incidents" };

const SEVERITY_TONE = { low: "gray", medium: "amber", high: "red" } as const;

const pick = <T extends string>(value: unknown, allowed: readonly T[]): T | undefined =>
  typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
const isoDate = (value: unknown) =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;

export default async function IncidentsPage({ params, searchParams }: PageProps<"/s/[school]/incidents">) {
  const { school: slug } = await params;
  const sp = await searchParams;
  const ctx = await getSchoolContext(slug);
  const base = `/s/${slug}/incidents`;

  if (!can(ctx, "incidents.view")) {
    if (!can(ctx, "incidents.report")) return <NoAccess />;
    return (
      <>
        <PageHeader title="Incidents" />
        <EmptyState title="You can report incidents">
          <Link href={`${base}/new`} className="btn-primary mt-2">
            Report an incident
          </Link>
        </EmptyState>
      </>
    );
  }

  // "any" keeps an explicit "all statuses" choice distinct from the default.
  const statusParam = typeof sp.status === "string" ? sp.status : "open";
  const filters = {
    status: pick(statusParam, INCIDENT_STATUSES),
    category: pick(sp.category, INCIDENT_CATEGORIES),
    severity: pick(sp.severity, INCIDENT_SEVERITIES),
    classGroupId: isUuid(sp.class) ? sp.class : undefined,
    from: isoDate(sp.from),
    to: isoDate(sp.to),
  };
  const page = Number(sp.page) || 1;
  const tz = ctx.school.timezone;

  const [{ rows, hasMore }, classes] = await Promise.all([
    listIncidents(ctx.school.id, tz, { ...filters, page }),
    listCurrentClasses(ctx.school.id),
  ]);
  const query = {
    status: filters.status ?? "any",
    category: filters.category ?? "",
    severity: filters.severity ?? "",
    class: filters.classGroupId ?? "",
    from: filters.from ?? "",
    to: filters.to ?? "",
  };
  const pageHref = (p: number) => `${base}?${new URLSearchParams({ ...query, page: String(p) })}`;
  const filtered = Boolean(
    filters.category || filters.severity || filters.classGroupId || filters.from || filters.to,
  );

  return (
    <>
      <PageHeader
        title="Incidents"
        actions={
          can(ctx, "incidents.report") ? (
            <Link href={`${base}/new`} className="btn-primary">
              Report incident
            </Link>
          ) : null
        }
      />
      <form className="mb-4 flex flex-wrap items-end gap-2" role="search">
        <select name="status" defaultValue={query.status} className="input w-auto" aria-label="Status">
          <option value="open">Open</option>
          <option value="resolved">Resolved</option>
          <option value="any">Any status</option>
        </select>
        <select name="category" defaultValue={query.category} className="input w-auto" aria-label="Category">
          <option value="">All categories</option>
          {INCIDENT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {INCIDENT_CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
        <select name="severity" defaultValue={query.severity} className="input w-auto" aria-label="Severity">
          <option value="">Any severity</option>
          {INCIDENT_SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select name="class" defaultValue={query.class} className="input w-auto" aria-label="Class">
          <option value="">All classes</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <label className="text-sm text-slate-600">
          From
          <input type="date" name="from" defaultValue={query.from} className="input w-auto" />
        </label>
        <label className="text-sm text-slate-600">
          To
          <input type="date" name="to" defaultValue={query.to} className="input w-auto" />
        </label>
        <button className="btn-secondary">Filter</button>
      </form>

      {rows.length === 0 ? (
        <EmptyState title={filtered || filters.status ? "No incidents match" : "No incidents recorded"} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Learner</th>
                <th>Class</th>
                <th>Category</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Reported by</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id}>
                  <td className="whitespace-nowrap">
                    <Link href={`${base}/${i.id}`} className="link">
                      {formatDateTime(i.occurredAt, tz)}
                    </Link>
                  </td>
                  <td className="font-medium">{fullName(i)}</td>
                  <td>{i.className ?? "—"}</td>
                  <td>{INCIDENT_CATEGORY_LABELS[i.category]}</td>
                  <td>
                    <Badge tone={SEVERITY_TONE[i.severity]}>{i.severity}</Badge>
                  </td>
                  <td>
                    <Badge tone={i.status === "open" ? "amber" : "green"}>{i.status}</Badge>
                    {i.guardianNotifiedAt ? (
                      <span className="ml-1 text-xs text-slate-500" title="Parents notified">
                        notified
                      </span>
                    ) : null}
                  </td>
                  <td>{i.reporterFirstName ? `${i.reporterFirstName} ${i.reporterLastName}` : "—"}</td>
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
