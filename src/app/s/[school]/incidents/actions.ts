"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db/client";
import type { FormState } from "@/components/action-form";
import { formToObject, schoolAction, UserFacingError } from "@/lib/actions";
import { diffFields, recordActivity } from "@/lib/activity";
import { can, ForbiddenError, type SchoolContext } from "@/lib/auth/context";
import { fullName, localInputToDate } from "@/lib/format";
import { uuidv7 } from "@/lib/ids";
import { notifyGuardians } from "@/lib/messaging/notify";
import {
  INCIDENT_CATEGORY_LABELS,
  incidentFields,
  incidentInput,
  notifyIncidentInput,
  resolveIncidentInput,
} from "@/lib/validation/incidents";
import { canEditIncident, canNotifyIncident, getIncident } from "@/server/incidents";
import { getLearner, listLearnerGuardians } from "@/server/school-data";

const { incidents } = schema;

// A few minutes of grace for a device clock that runs ahead.
const FUTURE_GRACE_MS = 10 * 60 * 1000;

function parseOccurredAt(ctx: SchoolContext, value: string): Date {
  const when = localInputToDate(value, ctx.school.timezone);
  if (Number.isNaN(when.getTime())) throw new UserFacingError("That date and time is not valid.");
  if (when.getTime() > Date.now() + FUTURE_GRACE_MS) throw new UserFacingError("The incident can't be in the future.");
  return when;
}

// Activity subjects never carry the description: it can hold sensitive detail.
function subjectFor(category: keyof typeof INCIDENT_CATEGORY_LABELS, learner: Parameters<typeof fullName>[0]) {
  return `${INCIDENT_CATEGORY_LABELS[category]} — ${fullName(learner)}`;
}

async function loadIncident(ctx: SchoolContext, incidentId: string) {
  const row = await getIncident(ctx.school.id, incidentId);
  if (!row) throw new UserFacingError("Incident not found.");
  return row;
}

export async function reportIncident(slug: string, _prev: FormState, form: FormData): Promise<FormState> {
  const result = await schoolAction(slug, "incidents.report", async (ctx) => {
    const input = incidentInput.parse(formToObject(form));
    const occurredAt = parseOccurredAt(ctx, input.occurredAt);
    const learner = await getLearner(ctx.school.id, input.learnerId);
    if (!learner) throw new UserFacingError("Learner not found.");

    const id = uuidv7();
    await getDb()
      .insert(incidents)
      .values({
        id,
        schoolId: ctx.school.id,
        learnerId: input.learnerId,
        reportedByStaffId: ctx.membership.staffId,
        occurredAt,
        category: input.category,
        severity: input.severity,
        description: input.description,
        actionTaken: input.actionTaken ?? null,
      });

    await recordActivity(ctx, {
      action: "incidents.reported",
      entityType: "incident",
      entityId: id,
      subject: subjectFor(input.category, learner.learner),
      meta: { learnerId: input.learnerId, severity: input.severity },
    });
    return { id, canView: can(ctx, "incidents.view") };
  });
  if (!result.ok) return result;
  revalidatePath(`/s/${slug}/incidents`);
  if (!result.data.canView) return { ok: true, message: "Incident reported. Thank you." };
  return { ok: true, redirectTo: `/s/${slug}/incidents/${result.data.id}` };
}

export async function updateIncident(
  slug: string,
  incidentId: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const result = await schoolAction(slug, "incidents.view", async (ctx) => {
    const input = incidentFields.parse(formToObject(form));
    const current = await loadIncident(ctx, incidentId);
    if (!canEditIncident(ctx, current.incident)) throw new ForbiddenError("incidents.manage");
    const patch = {
      occurredAt: parseOccurredAt(ctx, input.occurredAt),
      category: input.category,
      severity: input.severity,
      description: input.description,
      actionTaken: input.actionTaken ?? null,
    };
    await getDb()
      .update(incidents)
      .set(patch)
      .where(and(eq(incidents.schoolId, ctx.school.id), eq(incidents.id, incidentId)));

    await recordActivity(ctx, {
      action: "incidents.updated",
      entityType: "incident",
      entityId: incidentId,
      subject: subjectFor(input.category, current.learner),
      changes: diffFields(current.incident, patch, ["description", "actionTaken"]),
    });
  });
  if (!result.ok) return result;
  revalidatePath(`/s/${slug}/incidents`);
  revalidatePath(`/s/${slug}/incidents/${incidentId}`);
  return { ok: true, redirectTo: `/s/${slug}/incidents/${incidentId}` };
}

export async function resolveIncident(
  slug: string,
  incidentId: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const result = await schoolAction(slug, "incidents.view", async (ctx) => {
    const input = resolveIncidentInput.parse(formToObject(form));
    const current = await loadIncident(ctx, incidentId);
    if (current.incident.status !== "open") throw new UserFacingError("This incident is already resolved.");
    if (!canEditIncident(ctx, current.incident)) throw new ForbiddenError("incidents.manage");
    await getDb()
      .update(incidents)
      .set({ status: "resolved", actionTaken: input.actionTaken })
      .where(
        and(eq(incidents.schoolId, ctx.school.id), eq(incidents.id, incidentId), eq(incidents.status, "open")),
      );
    await recordActivity(ctx, {
      action: "incidents.resolved",
      entityType: "incident",
      entityId: incidentId,
      subject: subjectFor(current.incident.category, current.learner),
    });
  });
  if (!result.ok) return result;
  revalidatePath(`/s/${slug}/incidents`);
  revalidatePath(`/s/${slug}/incidents/${incidentId}`);
  return { ok: true, message: "Marked as resolved." };
}

export async function reopenIncident(slug: string, incidentId: string): Promise<FormState> {
  const result = await schoolAction(slug, "incidents.manage", async (ctx) => {
    const current = await loadIncident(ctx, incidentId);
    if (current.incident.status === "open") return;
    await getDb()
      .update(incidents)
      .set({ status: "open" })
      .where(and(eq(incidents.schoolId, ctx.school.id), eq(incidents.id, incidentId)));
    await recordActivity(ctx, {
      action: "incidents.reopened",
      entityType: "incident",
      entityId: incidentId,
      subject: subjectFor(current.incident.category, current.learner),
    });
  });
  if (!result.ok) return result;
  revalidatePath(`/s/${slug}/incidents`);
  revalidatePath(`/s/${slug}/incidents/${incidentId}`);
  return { ok: true };
}

export async function reopenIncidentForm(slug: string, incidentId: string): Promise<void> {
  await reopenIncident(slug, incidentId);
}

export async function notifyIncidentGuardians(
  slug: string,
  incidentId: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const result = await schoolAction(slug, "incidents.view", async (ctx) => {
    const input = notifyIncidentInput.parse(formToObject(form));
    const current = await loadIncident(ctx, incidentId);
    if (!canNotifyIncident(ctx, current.incident)) throw new ForbiddenError("incidents.manage");

    const links = await listLearnerGuardians(ctx.school.id, current.learner.id);
    const guardianIds = links.filter((l) => l.link.receivesNotices).map((l) => l.guardian.id);
    if (guardianIds.length === 0) {
      throw new UserFacingError("No parent or guardian of this learner is set to receive notices.");
    }

    const outcomes = await notifyGuardians(ctx, {
      guardianIds,
      subject: input.subject,
      text: input.text,
      relatedType: "incident",
      relatedId: incidentId,
    });
    await getDb()
      .update(incidents)
      .set({ guardianNotifiedAt: new Date() })
      .where(and(eq(incidents.schoolId, ctx.school.id), eq(incidents.id, incidentId)));

    const tally = {
      queued: outcomes.filter((o) => o.status === "queued").length,
      needsAction: outcomes.filter((o) => o.status === "needs_action").length,
    };
    await recordActivity(ctx, {
      action: "incidents.guardians_notified",
      entityType: "incident",
      entityId: incidentId,
      subject: subjectFor(current.incident.category, current.learner),
      meta: { guardianCount: guardianIds.length, ...tally },
    });
    return tally;
  });
  if (!result.ok) return result;
  revalidatePath(`/s/${slug}/incidents/${incidentId}`);
  const { queued, needsAction } = result.data;
  const parts = [
    queued ? `${queued} sending by WhatsApp or email` : null,
    needsAction ? `${needsAction} left for the office (call or letter)` : null,
  ].filter(Boolean);
  return { ok: true, message: `Parents notified: ${parts.join(", ")}.` };
}
