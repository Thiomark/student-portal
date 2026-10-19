import Link from "next/link";
import { Badge, EmptyState, NoAccess, PageHeader } from "@/components/ui";
import { can, getSchoolContext } from "@/lib/auth/context";
import { formatDate } from "@/lib/format";
import {
  MAINTENANCE_CATEGORIES,
  MAINTENANCE_CATEGORY_LABELS,
  MAINTENANCE_PRIORITIES,
  MAINTENANCE_STATUSES,
  MAINTENANCE_STATUS_LABELS,
} from "@/lib/validation/maintenance";
import { listMaintenance } from "@/server/maintenance";

export const metadata = { title: "Maintenance" };

const STATUS_TONE = { open: "amber", in_progress: "blue", done: "green", cancelled: "gray" } as const;
const PRIORITY_TONE = { low: "gray", normal: "gray", urgent: "red" } as const;

const pick = <T extends string>(value: unknown, allowed: readonly T[]): T | undefined =>
  typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;

export default async function MaintenancePage({ params, searchParams }: PageProps<"/s/[school]/maintenance">) {
  const { school: slug } = await params;
  const sp = await searchParams;
  const ctx = await getSchoolContext(slug);
  const viewAll = can(ctx, "maintenance.view");
  const report = can(ctx, "maintenance.report");
  if (!viewAll && !report) return <NoAccess />;

  const statusParam = typeof sp.status === "string" ? sp.status : "active";
  const status = statusParam === "active" ? "active" : pick(statusParam, MAINTENANCE_STATUSES);
  const priority = pick(sp.priority, MAINTENANCE_PRIORITIES);
  const category = pick(sp.category, MAINTENANCE_CATEGORIES);
  const page = Number(sp.page) || 1;

  const { rows, hasMore } = await listMaintenance(ctx.school.id, {
    status,
    priority,
    category,
    // Reporters who can't see the whole list follow their own requests.
    reportedByUserId: viewAll ? undefined : ctx.user.id,
    page,
  });
  const base = `/s/${slug}/maintenance`;
  const tz = ctx.school.timezone;
  const query = { status: status ?? "any", priority: priority ?? "", category: category ?? "" };
  const pageHref = (p: number) => `${base}?${new URLSearchParams({ ...query, page: String(p) })}`;

  return (
    <>
      <PageHeader
        title={viewAll ? "Maintenance" : "My maintenance requests"}
        actions={
          report ? (
            <Link href={`${base}/new`} className="btn-primary">
              Report a problem
            </Link>
          ) : null
        }
      />
      <form className="mb-4 flex flex-wrap gap-2" role="search">
        <select name="status" defaultValue={query.status} className="input w-auto" aria-label="Status">
          <option value="active">Open & in progress</option>
          {MAINTENANCE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {MAINTENANCE_STATUS_LABELS[s]}
            </option>
          ))}
          <option value="any">Any status</option>
        </select>
        <select name="priority" defaultValue={query.priority} className="input w-auto" aria-label="Priority">
          <option value="">Any priority</option>
          {MAINTENANCE_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select name="category" defaultValue={query.category} className="input w-auto" aria-label="Category">
          <option value="">All categories</option>
          {MAINTENANCE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {MAINTENANCE_CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
        <button className="btn-secondary">Filter</button>
      </form>

      {rows.length === 0 ? (
        <EmptyState title="No requests match" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Request</th>
                <th>Where</th>
                <th>Category</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Assigned to</th>
                <th>Reported</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`${base}/${r.id}`} className="link font-medium">
                      {r.title}
                    </Link>
                  </td>
                  <td>{r.location ?? "—"}</td>
                  <td>{MAINTENANCE_CATEGORY_LABELS[r.category]}</td>
                  <td>
                    <Badge tone={PRIORITY_TONE[r.priority]}>{r.priority}</Badge>
                  </td>
                  <td>
                    <Badge tone={STATUS_TONE[r.status]}>{MAINTENANCE_STATUS_LABELS[r.status]}</Badge>
                  </td>
                  <td>{r.assignedTo ?? "—"}</td>
                  <td className="whitespace-nowrap">{formatDate(r.createdAt, tz)}</td>
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
