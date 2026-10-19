"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, schema } from "@/db/client";
import type { FormState } from "@/components/action-form";
import { formToObject, schoolAction, UserFacingError } from "@/lib/actions";
import { diffFields, recordActivity } from "@/lib/activity";
import type { SchoolContext } from "@/lib/auth/context";
import { fullName } from "@/lib/format";
import { isUuid, uuidv7 } from "@/lib/ids";
import { maskPhone } from "@/lib/phone";
import { emailContactInput, guardianInput, linkInput, phoneContactInput } from "@/lib/validation/people";
import { getGuardian, getLearner } from "@/server/school-data";

const { guardians, guardianContacts, learnerGuardians } = schema;

// Creates a guardian, optionally with a first phone/email and a link to a
// learner, in one step so the office can capture a parent in one form.
export async function createGuardian(slug: string, _prev: FormState, form: FormData): Promise<FormState> {
  const result = await schoolAction(slug, "guardians.manage", async (ctx) => {
    const raw = formToObject(form);
    const input = guardianInput.parse(raw);
    const phone = raw.phone
      ? parseAs(phoneContactInput, { ...prefixed(raw, "phone"), isPrimary: "on" }, "phone")
      : null;
    const email = raw.email
      ? parseAs(emailContactInput, { value: raw.email, isPrimary: phone ? undefined : "on" }, "email")
      : null;
    const learnerId = typeof raw.learnerId === "string" && isUuid(raw.learnerId) ? raw.learnerId : null;
    const link = learnerId ? linkInput.parse(raw) : null;
    if (learnerId && !(await getLearner(ctx.school.id, learnerId))) throw new UserFacingError("Learner not found.");

    const id = uuidv7();
    await getDb().transaction(async (tx) => {
      await tx.insert(guardians).values({ id, schoolId: ctx.school.id, ...input });
      const contacts = [
        phone && { ...phone },
        email && { ...email, kind: "email" as const, whatsapp: false, sms: false, voice: false },
      ].filter((c) => c !== null);
      if (contacts.length) {
        await tx
          .insert(guardianContacts)
          .values(contacts.map((c) => ({ id: uuidv7(), schoolId: ctx.school.id, guardianId: id, ...c })));
      }
      if (learnerId && link) {
        await tx.insert(learnerGuardians).values({ schoolId: ctx.school.id, learnerId, guardianId: id, ...link });
      }
    });

    await recordActivity(ctx, {
      action: "guardians.created",
      entityType: "guardian",
      entityId: id,
      subject: fullName(input),
      meta: learnerId ? { linkedLearnerId: learnerId } : undefined,
    });
    return { id, learnerId };
  });
  if (!result.ok) return result;
  revalidatePath(`/s/${slug}/guardians`);
  const { id, learnerId } = result.data;
  return {
    ok: true,
    redirectTo: learnerId ? `/s/${slug}/learners/${learnerId}` : `/s/${slug}/guardians/${id}`,
  };
}

export async function updateGuardian(
  slug: string,
  guardianId: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const result = await schoolAction(slug, "guardians.manage", async (ctx) => {
    const input = guardianInput.parse(formToObject(form));
    const current = await getGuardian(ctx.school.id, guardianId);
    if (!current) throw new UserFacingError("Parent not found.");
    const patch = {
      ...input,
      title: input.title ?? null,
      idNumber: input.idNumber ?? null,
      occupation: input.occupation ?? null,
      address: input.address ?? null,
      preferredChannel: input.preferredChannel ?? null,
      notes: input.notes ?? null,
    };
    await getDb()
      .update(guardians)
      .set(patch)
      .where(and(eq(guardians.schoolId, ctx.school.id), eq(guardians.id, guardianId)));
    await recordActivity(ctx, {
      action: "guardians.updated",
      entityType: "guardian",
      entityId: guardianId,
      subject: fullName(input),
      changes: diffFields(current, patch, ["idNumber", "address"]),
    });
  });
  if (!result.ok) return result;
  revalidatePath(`/s/${slug}/guardians/${guardianId}`);
  return { ok: true, redirectTo: `/s/${slug}/guardians/${guardianId}` };
}

export async function addContact(
  slug: string,
  guardianId: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const result = await schoolAction(slug, "guardians.manage", async (ctx) => {
    const raw = formToObject(form);
    const contact =
      raw.kind === "email"
        ? { ...emailContactInput.parse(raw), kind: "email" as const, whatsapp: false, sms: false, voice: false }
        : phoneContactInput.parse(raw);
    const guardian = await getGuardian(ctx.school.id, guardianId);
    if (!guardian) throw new UserFacingError("Parent not found.");

    const db = getDb();
    await db.transaction(async (tx) => {
      const [duplicate] = await tx
        .select({ id: guardianContacts.id })
        .from(guardianContacts)
        .where(
          and(
            eq(guardianContacts.guardianId, guardianId),
            eq(guardianContacts.value, contact.value),
            isNull(guardianContacts.deletedAt),
          ),
        );
      if (duplicate) throw new UserFacingError("That contact is already saved for this parent.");
      if (contact.isPrimary) await clearPrimary(tx, guardianId);
      await tx.insert(guardianContacts).values({ id: uuidv7(), schoolId: ctx.school.id, guardianId, ...contact });
    });

    await recordActivity(ctx, {
      action: "guardians.contact_added",
      entityType: "guardian",
      entityId: guardianId,
      subject: fullName(guardian),
      meta: { kind: contact.kind, masked: contact.kind === "phone" ? maskPhone(contact.value) : undefined },
    });
  });
  if (!result.ok) return result;
  revalidatePath(`/s/${slug}/guardians/${guardianId}`);
  return { ok: true, message: "Contact saved." };
}

export async function removeContact(slug: string, guardianId: string, contactId: string): Promise<FormState> {
  const result = await schoolAction(slug, "guardians.manage", async (ctx) => {
    const guardian = await getGuardian(ctx.school.id, guardianId);
    if (!guardian) throw new UserFacingError("Parent not found.");
    const [removed] = await getDb()
      .update(guardianContacts)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(guardianContacts.schoolId, ctx.school.id),
          eq(guardianContacts.guardianId, guardianId),
          eq(guardianContacts.id, contactId),
        ),
      )
      .returning({ kind: guardianContacts.kind });
    if (!removed) throw new UserFacingError("Contact not found.");
    await recordActivity(ctx, {
      action: "guardians.contact_removed",
      entityType: "guardian",
      entityId: guardianId,
      subject: fullName(guardian),
      meta: { kind: removed.kind },
    });
  });
  if (!result.ok) return result;
  revalidatePath(`/s/${slug}/guardians/${guardianId}`);
  return { ok: true };
}

export async function linkGuardian(
  slug: string,
  learnerId: string,
  guardianId: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const result = await schoolAction(slug, "guardians.manage", async (ctx) => {
    const link = linkInput.parse(formToObject(form));
    const [learner, guardian] = await Promise.all([
      getLearner(ctx.school.id, learnerId),
      getGuardian(ctx.school.id, guardianId),
    ]);
    if (!learner || !guardian) throw new UserFacingError("Learner or parent not found.");

    await getDb().transaction(async (tx) => {
      if (link.isPrimary) {
        await tx
          .update(learnerGuardians)
          .set({ isPrimary: false })
          .where(eq(learnerGuardians.learnerId, learnerId));
      }
      await tx
        .insert(learnerGuardians)
        .values({ schoolId: ctx.school.id, learnerId, guardianId, ...link })
        .onConflictDoUpdate({ target: [learnerGuardians.learnerId, learnerGuardians.guardianId], set: link });
    });

    await logLink(ctx, "guardians.linked", learner.learner, guardian, link.relationship);
  });
  if (!result.ok) return result;
  revalidatePath(`/s/${slug}/learners/${learnerId}`);
  return { ok: true, redirectTo: `/s/${slug}/learners/${learnerId}` };
}

export async function unlinkGuardian(slug: string, learnerId: string, guardianId: string): Promise<FormState> {
  const result = await schoolAction(slug, "guardians.manage", async (ctx) => {
    const [learner, guardian] = await Promise.all([
      getLearner(ctx.school.id, learnerId),
      getGuardian(ctx.school.id, guardianId),
    ]);
    if (!learner || !guardian) throw new UserFacingError("Learner or parent not found.");
    await getDb()
      .delete(learnerGuardians)
      .where(
        and(
          eq(learnerGuardians.schoolId, ctx.school.id),
          eq(learnerGuardians.learnerId, learnerId),
          eq(learnerGuardians.guardianId, guardianId),
        ),
      );
    await logLink(ctx, "guardians.unlinked", learner.learner, guardian);
  });
  if (!result.ok) return result;
  revalidatePath(`/s/${slug}/learners/${learnerId}`);
  return { ok: true };
}

const contactIdSchema = z.uuid();

// Form-friendly wrappers for one-click buttons.
export async function removeContactForm(slug: string, guardianId: string, form: FormData): Promise<void> {
  const contactId = contactIdSchema.safeParse(form.get("contactId"));
  if (contactId.success) await removeContact(slug, guardianId, contactId.data);
}

export async function unlinkGuardianForm(slug: string, learnerId: string, guardianId: string): Promise<void> {
  await unlinkGuardian(slug, learnerId, guardianId);
}

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

async function clearPrimary(tx: Tx, guardianId: string) {
  await tx
    .update(guardianContacts)
    .set({ isPrimary: false })
    .where(and(eq(guardianContacts.guardianId, guardianId), sql`${guardianContacts.isPrimary}`));
}

async function logLink(
  ctx: SchoolContext,
  action: string,
  learner: { id: string; firstName: string; lastName: string },
  guardian: { id: string; firstName: string; lastName: string },
  relationship?: string,
) {
  await recordActivity(ctx, {
    action,
    entityType: "learner",
    entityId: learner.id,
    subject: `${fullName(guardian)} ↔ ${fullName(learner)}`,
    meta: { guardianId: guardian.id, relationship },
  });
}

// Reports every issue under one form field, for sub-objects of a bigger form.
function parseAs<S extends z.ZodType>(schema: S, value: unknown, field: string): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new z.ZodError(result.error.issues.map((issue) => ({ ...issue, path: [field] })));
  }
  return result.data;
}

function prefixed(raw: Record<string, string | string[] | undefined>, prefix: string) {
  return {
    value: raw[prefix],
    whatsapp: raw[`${prefix}Whatsapp`],
    sms: raw[`${prefix}Sms`],
    voice: raw[`${prefix}Voice`],
  };
}
