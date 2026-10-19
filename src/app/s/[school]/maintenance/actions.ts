"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db/client";
import type { FormState } from "@/components/action-form";
import { formToObject, schoolAction, UserFacingError } from "@/lib/actions";
import { diffFields, recordActivity } from "@/lib/activity";
import { can } from "@/lib/auth/context";
import { uuidv7 } from "@/lib/ids";
import { MAINTENANCE_TRANSITIONS, maintenanceInput, maintenanceUpdateInput } from "@/lib/validation/maintenance";
import { getMaintenance } from "@/server/maintenance";

const { maintenanceRequests: requests } = schema;

export async function reportMaintenance(slug: string, _prev: FormState, form: FormData): Promise<FormState> {
  const result = await schoolAction(slug, "maintenance.report", async (ctx) => {
    const input = maintenanceInput.parse(formToObject(form));
    const id = uuidv7();
    await getDb()
      .insert(requests)
      .values({
        id,
        schoolId: ctx.school.id,
        title: input.title,
        description: input.description ?? null,
        location: input.location ?? null,
        category: input.category,
        priority: input.priority,
        reportedByUserId: ctx.user.id,
      });
    await recordActivity(ctx, {
      action: "maintenance.reported",
      entityType: "maintenance_request",
      entityId: id,
      subject: input.title,
      meta: { category: input.category, priority: input.priority },
    });
    return { id, canView: can(ctx, "maintenance.view") };
  });
  if (!result.ok) return result;
  revalidatePath(`/s/${slug}/maintenance`);
  if (!result.data.canView) {
    return { ok: true, message: "Thanks, your request has been logged. Facilities staff will pick it up." };
  }
  return { ok: true, redirectTo: `/s/${slug}/maintenance/${result.data.id}` };
}

export async function updateMaintenance(
  slug: string,
  requestId: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const result = await schoolAction(slug, "maintenance.manage", async (ctx) => {
    const input = maintenanceUpdateInput.parse(formToObject(form));
    const row = await getMaintenance(ctx.school.id, requestId);
    if (!row) throw new UserFacingError("Request not found.");
    const current = row.request;
    const statusChanged = input.status !== current.status;
    if (statusChanged && !MAINTENANCE_TRANSITIONS[current.status].includes(input.status)) {
      throw new UserFacingError(`Can't move a ${current.status.replace("_", " ")} request to ${input.status.replace("_", " ")}.`);
    }

    const patch = {
      status: input.status,
      category: input.category,
      priority: input.priority,
      assignedTo: input.assignedTo ?? null,
      vendor: input.vendor ?? null,
      costCents: input.cost ?? null,
      completedAt:
        input.status === "done" ? (current.status === "done" ? current.completedAt : new Date()) : null,
    };
    const changes = diffFields(current, patch);
    if (changes.length === 0) return;

    await getDb()
      .update(requests)
      .set(patch)
      .where(and(eq(requests.schoolId, ctx.school.id), eq(requests.id, requestId)));
    await recordActivity(ctx, {
      action: statusChanged ? "maintenance.status_changed" : "maintenance.updated",
      entityType: "maintenance_request",
      entityId: requestId,
      subject: current.title,
      changes,
      meta: statusChanged ? { from: current.status, to: input.status } : undefined,
    });
  });
  if (!result.ok) return result;
  revalidatePath(`/s/${slug}/maintenance`);
  revalidatePath(`/s/${slug}/maintenance/${requestId}`);
  return { ok: true, message: "Saved." };
}
