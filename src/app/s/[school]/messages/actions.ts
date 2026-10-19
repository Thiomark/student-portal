"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db/client";
import type { FormState } from "@/components/action-form";
import { formToObject, schoolAction, UserFacingError } from "@/lib/actions";
import { recordActivity } from "@/lib/activity";
import { fullName } from "@/lib/format";
import { isUuid, uuidv7 } from "@/lib/ids";
import { notifyGuardians } from "@/lib/messaging/notify";
import { audienceInput, broadcastInput, MAX_BROADCAST_GUARDIANS } from "@/lib/validation/messages";
import { getMessage, resendMessage, resolveAudience } from "@/server/messages";

const { messages } = schema;

// The office has phoned the parent, sent the letter home, or otherwise dealt
// with it. Failed sends can be closed the same way after a phone call.
export async function markMessageDone(slug: string, messageId: string): Promise<FormState> {
  const result = await schoolAction(slug, "messages.send", async (ctx) => {
    const current = await getMessage(ctx.school.id, messageId);
    if (!current) throw new UserFacingError("Message not found.");
    const [updated] = await getDb()
      .update(messages)
      .set({ status: "done" })
      .where(
        and(
          eq(messages.schoolId, ctx.school.id),
          eq(messages.id, messageId),
          inArray(messages.status, ["needs_action", "failed"]),
        ),
      )
      .returning({ id: messages.id });
    if (!updated) throw new UserFacingError("This message is already dealt with.");
    await recordActivity(ctx, {
      action: "messages.marked_done",
      entityType: "message",
      entityId: messageId,
      subject: current.guardian ? fullName(current.guardian) : current.message.subject,
      changes: [{ field: "status", before: current.message.status, after: "done" }],
      meta: { channel: current.message.channel, relatedType: current.message.relatedType },
    });
  });
  if (!result.ok) return result;
  revalidatePath(`/s/${slug}/messages`);
  return { ok: true, message: "Marked as done." };
}

// One-click form for the outbox list.
export async function markMessageDoneForm(slug: string, form: FormData): Promise<void> {
  const id = form.get("messageId");
  if (isUuid(id)) await markMessageDone(slug, id);
}

export async function retryMessage(slug: string, messageId: string): Promise<FormState> {
  const result = await schoolAction(slug, "messages.send", async (ctx) => {
    const current = await getMessage(ctx.school.id, messageId);
    if (!current) throw new UserFacingError("Message not found.");
    const outcome = await resendMessage(ctx, messageId);
    await recordActivity(ctx, {
      action: "messages.retried",
      entityType: "message",
      entityId: messageId,
      subject: current.guardian ? fullName(current.guardian) : current.message.subject,
      meta: { channel: current.message.channel, ok: outcome.ok },
    });
    if (!outcome.ok) throw new UserFacingError(`Still not sent: ${outcome.error}`);
  });
  if (!result.ok) {
    revalidatePath(`/s/${slug}/messages/${messageId}`);
    return result;
  }
  revalidatePath(`/s/${slug}/messages`);
  return { ok: true, message: "Sent." };
}

export async function sendBroadcast(slug: string, _prev: FormState, form: FormData): Promise<FormState> {
  const result = await schoolAction(slug, "messages.send", async (ctx) => {
    const raw = formToObject(form);
    const audience = audienceInput.parse(raw);
    const input = broadcastInput.parse(raw);
    const { guardianIds, overLimit } = await resolveAudience(ctx.school.id, audience, MAX_BROADCAST_GUARDIANS);
    if (overLimit) {
      throw new UserFacingError(
        `That is more than ${MAX_BROADCAST_GUARDIANS} parents. Send to one grade at a time instead.`,
      );
    }
    if (guardianIds.length === 0) throw new UserFacingError("No parents to send to for that audience.");

    // Groups this send's messages so the office can follow it up in the outbox.
    const broadcastId = uuidv7();
    const outcomes = await notifyGuardians(ctx, {
      guardianIds,
      subject: input.subject,
      text: input.text,
      relatedType: "broadcast",
      relatedId: broadcastId,
    });

    const byChannel: Record<string, number> = {};
    for (const o of outcomes) byChannel[o.channel] = (byChannel[o.channel] ?? 0) + 1;
    const counts = {
      guardians: outcomes.length,
      queued: outcomes.filter((o) => o.status === "queued").length,
      needsAction: outcomes.filter((o) => o.status === "needs_action").length,
    };
    await recordActivity(ctx, {
      action: "messages.broadcast_sent",
      entityType: "broadcast",
      entityId: broadcastId,
      subject: input.subject,
      meta: {
        audience: audience.audience,
        classGroupId: audience.classGroupId,
        gradeId: audience.gradeId,
        ...counts,
        byChannel,
      },
    });
    return broadcastId;
  });
  if (!result.ok) return result;
  revalidatePath(`/s/${slug}/messages`);
  return { ok: true, redirectTo: `/s/${slug}/messages?related=${result.data}&status=all` };
}
