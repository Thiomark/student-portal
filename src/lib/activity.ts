import "server-only";
import { getDb, schema } from "@/db/client";
import type { SchoolContext } from "@/lib/auth/context";
import { uuidv7 } from "@/lib/ids";

export type ActivityInput = {
  // "<area>.<verb>", e.g. "textbooks.issued", "learners.updated".
  action: string;
  entityType: string;
  entityId?: string | null;
  // Human label for the row, e.g. "Thabo Mokoena (8A)". No phone numbers,
  // emails, ID numbers or medical details.
  subject?: string | null;
  changes?: { field: string; before: unknown; after: unknown }[];
  meta?: Record<string, unknown>;
  deviceId?: string | null;
};

// Call after the write has committed. Logging never fails the user's action;
// a lost log line is reported to the server log instead.
export async function recordActivity(ctx: SchoolContext, input: ActivityInput): Promise<void> {
  try {
    await getDb()
      .insert(schema.activityEvents)
      .values({
        id: uuidv7(),
        schoolId: ctx.school.id,
        actorUserId: ctx.user.id,
        actorName: ctx.user.name ?? ctx.user.email,
        actorRole: ctx.membership.role,
        action: input.action,
        area: input.action.split(".")[0],
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        subject: input.subject ?? null,
        changes: input.changes?.length ? input.changes : null,
        meta: input.meta ?? null,
        deviceId: input.deviceId ?? null,
      });
  } catch (err) {
    console.error("[activity] failed to record", input.action, err);
  }
}

// Field-level diff for the activity log. Fields listed in `redact` are logged
// as changed without their values.
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
  redact: (keyof T)[] = [],
): { field: string; before: unknown; after: unknown }[] {
  const out: { field: string; before: unknown; after: unknown }[] = [];
  for (const key of Object.keys(after) as (keyof T)[]) {
    if (key === "updatedAt" || key === "createdAt") continue;
    const a = normalise(before[key]);
    const b = normalise(after[key]);
    if (a === b) continue;
    const hidden = redact.includes(key);
    out.push({ field: String(key), before: hidden ? "[redacted]" : a, after: hidden ? "[redacted]" : b });
  }
  return out;
}

function normalise(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value === undefined || value === "") return null;
  return value;
}
