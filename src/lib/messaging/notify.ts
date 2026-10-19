import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import type { SchoolContext } from "@/lib/auth/context";
import { decryptSecret } from "@/lib/crypto";
import { uuidv7 } from "@/lib/ids";
import { chooseRoute, type Channel } from "./channel";
import { sendEmail } from "./email";
import { sendWhatsApp } from "./whaple";

export type NotifyOutcome = {
  guardianId: string;
  messageId: string;
  channel: Channel;
  status: "sent" | "failed" | "needs_action";
  error?: string;
};

// Sends one notice to each guardian over the best channel they have. Every
// attempt is stored in `messages`; anything that can't go out automatically
// (letter, call, SMS) is left as "needs_action" for the office to work through.
export async function notifyGuardians(
  ctx: SchoolContext,
  input: {
    guardianIds: string[];
    subject: string;
    text: string;
    relatedType?: string;
    relatedId?: string;
  },
): Promise<NotifyOutcome[]> {
  if (input.guardianIds.length === 0) return [];
  const db = getDb();
  const schoolId = ctx.school.id;

  const [guardians, contacts, [secrets]] = await Promise.all([
    db
      .select({ id: schema.guardians.id, preferredChannel: schema.guardians.preferredChannel })
      .from(schema.guardians)
      .where(and(eq(schema.guardians.schoolId, schoolId), inArray(schema.guardians.id, input.guardianIds))),
    db
      .select()
      .from(schema.guardianContacts)
      .where(
        and(
          eq(schema.guardianContacts.schoolId, schoolId),
          inArray(schema.guardianContacts.guardianId, input.guardianIds),
          isNull(schema.guardianContacts.deletedAt),
        ),
      ),
    db.select().from(schema.schoolSecrets).where(eq(schema.schoolSecrets.schoolId, schoolId)).limit(1),
  ]);

  const whapleKey = safeDecrypt(secrets?.whapleApiKey);
  const resendKey = safeDecrypt(secrets?.resendApiKey);

  const outcomes: NotifyOutcome[] = [];
  for (const guardian of guardians) {
    let route = chooseRoute(
      contacts.filter((c) => c.guardianId === guardian.id),
      guardian.preferredChannel,
    );
    // A school without a Whaple key can't send WhatsApp; fall back to a call.
    if (route.channel === "whatsapp" && !whapleKey) {
      route = { ...route, channel: "call", automatic: false };
    }

    const messageId = uuidv7();
    await db.insert(schema.messages).values({
      id: messageId,
      schoolId,
      guardianId: guardian.id,
      channel: route.channel,
      recipient: route.recipient,
      subject: input.subject,
      body: input.text,
      status: route.automatic ? "queued" : "needs_action",
      relatedType: input.relatedType,
      relatedId: input.relatedId,
      createdByUserId: ctx.user.id,
    });

    if (!route.automatic || !route.recipient) {
      outcomes.push({ guardianId: guardian.id, messageId, channel: route.channel, status: "needs_action" });
      continue;
    }

    const result =
      route.channel === "whatsapp"
        ? await sendWhatsApp(whapleKey!, route.recipient, `*${input.subject}*\n\n${input.text}`)
        : await sendEmail({
            schoolName: ctx.school.name,
            schoolApiKey: resendKey,
            schoolFromEmail: secrets?.resendFromEmail,
            replyTo: ctx.school.email,
            to: route.recipient,
            subject: input.subject,
            text: input.text,
          });

    await db
      .update(schema.messages)
      .set(
        result.ok
          ? {
              status: "sent",
              sentAt: new Date(),
              provider: route.channel === "whatsapp" ? "whaple" : "resend",
              providerMessageId: result.messageId ?? null,
            }
          : { status: "failed", error: result.error.slice(0, 500) },
      )
      .where(eq(schema.messages.id, messageId));

    outcomes.push({
      guardianId: guardian.id,
      messageId,
      channel: route.channel,
      status: result.ok ? "sent" : "failed",
      error: result.ok ? undefined : result.error,
    });
  }
  return outcomes;
}

function safeDecrypt(value: string | null | undefined): string | null {
  try {
    return decryptSecret(value);
  } catch (err) {
    console.error("[notify] could not decrypt a school secret", err);
    return null;
  }
}
