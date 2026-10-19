"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/action-form";
import { getDb, schema } from "@/db/client";
import { formToObject, schoolAction } from "@/lib/actions";
import { diffFields, recordActivity } from "@/lib/activity";
import { encryptSecret } from "@/lib/crypto";

const optional = (max: number) => z.string().trim().max(max).optional();

const detailsInput = z.object({
  name: z.string().trim().min(2).max(200),
  registrationNumber: optional(50),
  phone: optional(30),
  email: z.string().trim().toLowerCase().pipe(z.email()).optional(),
  address: optional(500),
  timezone: z.string().refine((tz) => Intl.supportedValuesOf("timeZone").includes(tz), "Unknown timezone"),
});

export async function updateSchoolDetails(slug: string, _prev: FormState, form: FormData): Promise<FormState> {
  const result = await schoolAction(slug, "school.settings", async (ctx) => {
    const input = detailsInput.parse(formToObject(form));
    const patch = {
      ...input,
      registrationNumber: input.registrationNumber ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      address: input.address ?? null,
    };
    await getDb().update(schema.schools).set(patch).where(eq(schema.schools.id, ctx.school.id));
    await recordActivity(ctx, {
      action: "settings.details_updated",
      entityType: "school",
      entityId: ctx.school.id,
      subject: input.name,
      changes: diffFields(ctx.school, patch),
    });
  });
  if (!result.ok) return result;
  revalidatePath(`/s/${slug}`, "layout");
  return { ok: true, message: "Saved." };
}

const secretsInput = z.object({
  whapleApiKey: optional(500),
  resendApiKey: optional(500),
  resendFromEmail: z.string().trim().toLowerCase().pipe(z.email()).optional(),
  clear: z.array(z.enum(["whapleApiKey", "resendApiKey"])).default([]),
});

// Keys are write-only: the page shows whether one is set, never its value.
export async function updateSecrets(slug: string, _prev: FormState, form: FormData): Promise<FormState> {
  const result = await schoolAction(slug, "school.settings", async (ctx) => {
    const raw = formToObject(form);
    const input = secretsInput.parse({ ...raw, clear: raw["clear[]"] ?? [] });
    const patch: Partial<typeof schema.schoolSecrets.$inferInsert> = {};
    const changed: string[] = [];
    if (input.whapleApiKey) {
      patch.whapleApiKey = encryptSecret(input.whapleApiKey);
      changed.push("whapleApiKey");
    }
    if (input.resendApiKey) {
      patch.resendApiKey = encryptSecret(input.resendApiKey);
      changed.push("resendApiKey");
    }
    for (const key of input.clear) {
      patch[key] = null;
      changed.push(`${key} (removed)`);
    }
    if (input.resendFromEmail !== undefined) {
      patch.resendFromEmail = input.resendFromEmail;
      changed.push("resendFromEmail");
    }
    if (changed.length === 0) return;
    await getDb()
      .insert(schema.schoolSecrets)
      .values({ schoolId: ctx.school.id, ...patch })
      .onConflictDoUpdate({ target: schema.schoolSecrets.schoolId, set: patch });
    // Record which keys changed, never their values.
    await recordActivity(ctx, {
      action: "settings.keys_updated",
      entityType: "school",
      entityId: ctx.school.id,
      subject: ctx.school.name,
      meta: { changed },
    });
  });
  if (!result.ok) return result;
  revalidatePath(`/s/${slug}/settings`);
  return { ok: true, message: "Saved." };
}
