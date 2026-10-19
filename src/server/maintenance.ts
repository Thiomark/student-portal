import "server-only";
import { and, desc, eq, isNull, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import type { SchoolContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/context";
import { PAGE_SIZE } from "@/server/school-data";

const { maintenanceRequests: requests, users } = schema;

type Status = (typeof requests.status.enumValues)[number];
type Priority = (typeof requests.priority.enumValues)[number];
type Category = (typeof requests.category.enumValues)[number];

export async function listMaintenance(
  schoolId: string,
  opts: {
    // "active" is open + in progress.
    status?: Status | "active";
    priority?: Priority;
    category?: Category;
    reportedByUserId?: string;
    page?: number;
  },
) {
  const where: SQL[] = [eq(requests.schoolId, schoolId), isNull(requests.deletedAt)];
  if (opts.status === "active") where.push(sql`${requests.status} in ('open', 'in_progress')`);
  else if (opts.status) where.push(eq(requests.status, opts.status));
  if (opts.priority) where.push(eq(requests.priority, opts.priority));
  if (opts.category) where.push(eq(requests.category, opts.category));
  if (opts.reportedByUserId) where.push(eq(requests.reportedByUserId, opts.reportedByUserId));

  const page = Math.max(1, opts.page ?? 1);
  const rows = await getDb()
    .select({
      id: requests.id,
      title: requests.title,
      location: requests.location,
      category: requests.category,
      priority: requests.priority,
      status: requests.status,
      assignedTo: requests.assignedTo,
      createdAt: requests.createdAt,
      completedAt: requests.completedAt,
    })
    .from(requests)
    .where(and(...where))
    // Urgent first, then newest.
    .orderBy(sql`case ${requests.priority} when 'urgent' then 0 when 'normal' then 1 else 2 end`, desc(requests.createdAt))
    .limit(PAGE_SIZE + 1)
    .offset((page - 1) * PAGE_SIZE);
  return { rows: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE, page };
}

export async function getMaintenance(schoolId: string, requestId: string) {
  const [row] = await getDb()
    .select({ request: requests, reporterName: users.name })
    .from(requests)
    .leftJoin(users, eq(users.id, requests.reportedByUserId))
    .where(and(eq(requests.schoolId, schoolId), eq(requests.id, requestId), isNull(requests.deletedAt)))
    .limit(1);
  return row ?? null;
}

// Reporters without maintenance.view can still follow their own requests.
export function canSeeMaintenance(ctx: SchoolContext, request: { reportedByUserId: string | null }): boolean {
  return (
    can(ctx, "maintenance.view") || (can(ctx, "maintenance.report") && request.reportedByUserId === ctx.user.id)
  );
}
